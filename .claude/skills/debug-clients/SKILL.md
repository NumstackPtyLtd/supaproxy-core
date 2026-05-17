---
name: debug-clients
description: >
  Diagnose consumer/client connectivity issues. Covers any consumer type:
  Slack, WhatsApp, API, CLI, or future integrations. Checks token validity,
  channel/endpoint bindings, consumer startup lifecycle, and message flow.
  Run when a consumer is not receiving or responding to messages.
---

# Debug Clients (Consumers)

Diagnose why a consumer is not receiving or responding to messages. Works for any consumer type.

## Step 0: Load DB password

```bash
# Read DB_PASSWORD from the root .env (used by docker-compose)
export DB_PASSWORD=$(grep DB_PASSWORD "$(git rev-parse --show-toplevel)/.env" | cut -d= -f2)
```

## Step 1: Identify the consumer type and config

```bash
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -e "
  SELECT c.id, c.type, c.status, c.workspace_id, c.config
  FROM consumers c
  ORDER BY c.type;" 2>&1 | grep -v Warning
```

Note the `type`, `status`, and `config` for the failing consumer.

## Step 2: Check consumer-specific connectivity

### For Slack consumers

```bash
# Get tokens
BOT_TOKEN=$(docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -N -e "SELECT value FROM org_settings WHERE key_name = 'slack_bot_token' LIMIT 1" 2>/dev/null)
APP_TOKEN=$(docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -N -e "SELECT value FROM org_settings WHERE key_name = 'slack_app_token' LIMIT 1" 2>/dev/null)

# Verify auth
curl -s -H "Authorization: Bearer $BOT_TOKEN" https://slack.com/api/auth.test | python3 -m json.tool

# Check Socket Mode (required for receiving events)
curl -s -X POST https://slack.com/api/apps.connections.open \
  -H "Authorization: Bearer $APP_TOKEN" | python3 -m json.tool
# If response contains "Socket Mode is not turned on" -> enable in Slack app settings

# Check which channels the bot is in
curl -s -H "Authorization: Bearer $BOT_TOKEN" "https://slack.com/api/users.conversations?types=public_channel,private_channel&limit=100" | python3 -c "
import sys, json
for ch in json.load(sys.stdin).get('channels', []):
    print(f'  #{ch[\"name\"]} (id: {ch[\"id\"]})')
"

# Test posting to a channel
CHANNEL_ID="<from config>"
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"$CHANNEL_ID\",\"text\":\"Diagnostic ping.\"}" | python3 -c "import sys,json; print('OK' if json.load(sys.stdin).get('ok') else 'FAILED')"
```

### For API consumers
- API consumers are stateless -- they work if the server is running
- Test: `curl -s -X POST http://localhost:3001/api/workspaces/<id>/query -H "Content-Type: application/json" -d '{"query":"test"}'`

### For future consumers (WhatsApp, Discord, etc.)
- Check the consumer-specific integration config in the consumer's `config` JSON
- Verify webhook URLs are reachable from the external service
- Check server logs for connection errors

## Step 3: Check channel/endpoint is bound to a workspace

```bash
# Verify the consumer's config has the correct channel/endpoint
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -e "
  SELECT c.type, w.name as workspace, c.config
  FROM consumers c
  JOIN workspaces w ON c.workspace_id = w.id;" 2>&1 | grep -v Warning
```

The consumer's config must include the channel ID (Slack), phone number (WhatsApp), or endpoint (API) that maps to a workspace.

## Step 4: CRITICAL -- Consumer lifecycle

**Consumers that use persistent connections (Slack Socket Mode, WebSocket-based) only start at server boot.**

The server reads consumer tokens from `org_settings` at startup (`index.ts`). If you:
- Add tokens after startup -- consumer does NOT auto-start
- Change tokens after startup -- old consumer keeps running with old tokens

**Fix: Restart the SupaProxy server after any token change.**

```bash
# Restart and verify consumer started
pkill -f "tsx.*index.ts" 2>/dev/null; sleep 2
REPO_ROOT=$(git rev-parse --show-toplevel) && cd "$REPO_ROOT" && nohup npx tsx src/index.ts > /tmp/supaproxy-core.log 2>&1 &
sleep 5

# Check which consumers started
strings /tmp/supaproxy-core.log | grep -i "consumer\|started\|failed\|token"
```

## Step 5: Check server logs for message handling

```bash
# Tail recent logs for the consumer type
strings /tmp/supaproxy-core.log | grep -i "<consumer_type>\|mention\|message\|query\|error" | tail -20
```

Look for:
- `app_mention received` / `message received` -- event came in
- `No workspace found for channel` -- channel not bound
- `Reply posted` -- response sent successfully
- `MCP connection failed` -- tool connection issue (run `/debug-mcp`)
- `Agent error` -- AI provider issue (check API key in org settings)

## Step 6: Verify the full message flow

A message goes through: **Consumer -> Workspace lookup -> Agent (AI + MCP tools) -> Response**

1. Consumer receives message (Step 2)
2. Channel bound to workspace (Step 3)
3. Workspace has connections (`/debug-mcp`)
4. AI provider key configured (org_settings)
5. Response posted back (Step 5 logs)

If step 3 or 4 fails, the agent returns an error but the consumer may not surface it clearly.

## Provider-agnostic rules

- Never reference specific provider names in error messages or logs shown to users
- The diagnostic steps above work for ANY consumer -- adapt the connectivity check (Step 2) to the consumer's protocol
