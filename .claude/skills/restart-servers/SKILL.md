---
name: restart-servers
description: >
  Restarts the Hono dev server after code changes. Run after ANY file edit
  in src/, after dependency changes, or after token updates.
  The user should never see "connection refused".
---

# Restart Servers

## When to run
- After editing any file in `src/`
- After any `pnpm add/remove`
- After any commit
- Before telling the user a URL is ready
- **After changing consumer tokens in org_settings** (consumers only start at boot)

## Steps

### 1. Restart Hono

**IMPORTANT:** Use absolute paths to avoid CWD drift issues.

```bash
pkill -f "tsx.*index.ts" 2>/dev/null; sleep 1
REPO_ROOT=$(git rev-parse --show-toplevel) && cd "$REPO_ROOT" && nohup npx tsx src/index.ts > /tmp/supaproxy-core.log 2>&1 &
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health
# Must be 200
```

If you don't know the repo root, find it with: `git rev-parse --show-toplevel`

After restart, verify consumers started (if tokens are configured):
```bash
strings /tmp/supaproxy-core.log | grep -i "consumer\|started\|failed\|token"
```

### 2. Verify MySQL (if DB-related changes)

```bash
docker exec supaproxy-mysql mysqladmin ping -h localhost --silent 2>&1
# Should return "1"
```

### 3. Verify Redis (if queue-related changes)

```bash
docker exec supaproxy-redis redis-cli ping
# Should return "PONG"
```

### 4. Report

Tell the user which servers were restarted and their health status.

## If the server fails to start

DO NOT tell the user the URL is ready. Read the error output:

```bash
cat /tmp/supaproxy-core.log
```

Fix the issue, restart again, and only then report.
