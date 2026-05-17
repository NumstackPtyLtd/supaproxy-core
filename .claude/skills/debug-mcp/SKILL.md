---
name: debug-mcp
description: >
  Diagnose and fix MCP connection issues. Covers: stale Docker ports,
  missing headers, tools returning 0, agent runtime failures, and
  MCP server route/DI issues. Run when connections show [UNKNOWN] or
  "No tools available".
---

# Debug MCP Connections

Diagnose why MCP connections fail to discover tools or why the agent cannot use them at runtime.

## Step 0: Load DB password

```bash
export DB_PASSWORD=$(grep DB_PASSWORD "$(git rev-parse --show-toplevel)/.env" | cut -d= -f2)
```

## Step 1: Check the MCP server is reachable

```bash
# Get the connection URL from DB
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -N -e "SELECT name, config FROM connections;" 2>&1 | grep -v Warning

# Test the URL directly with a tools/list call
URL="<url from above>"
curl -s -X POST "$URL" \
  -H "Content-Type: application/json" \
  -H "x-moo-request-id: debug-$(date +%s)" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | python3 -m json.tool
```

### Common failures:

**"No routes found for /mcp"** -- The MCP server does not have the HTTP route registered.
- Check the server framework's route configuration for the MCP endpoint
- Clear any route caches after adding routes

**"idempotency header not set"** -- Server requires custom headers (e.g., `x-moo-request-id`).
- SupaProxy sends `x-moo-request-id` automatically on all MCP calls (agent.ts + connectors.ts)
- If the server needs other headers, add them to the connection config: `cfg.headers`

**Connection refused / timeout** -- Docker port changed.
- Docker ephemeral ports change on every container restart
- Check current port: `docker ps --format '{{.Names}}\t{{.Ports}}' | grep <name>`
- Update the connection URL in the DB

**"Too few arguments to function"** -- Dependency injection not resolving.
- Verify the MCP controller/handler is properly registered in the service container

## Step 2: Check tools are registered in DB

```bash
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -e "
  SELECT c.name, c.status, COUNT(t.id) as tools
  FROM connections c
  LEFT JOIN connection_tools t ON c.id = t.connection_id
  GROUP BY c.id;" 2>&1 | grep -v Warning
```

If status is `connected` but tools = 0, the test/save succeeded but tool discovery returned empty. Re-test the connection.

## Step 3: Check agent runtime MCP calls

If tools are registered but querying says "No tools available":

```bash
# Check server logs for MCP connection errors
strings /tmp/supaproxy-core.log | grep -i "mcp\|tools\|connection" | tail -20
```

The agent (`core/agent.ts`) connects to MCP fresh on every query. Common issues:
- **Missing headers at runtime** -- agent.ts must send the same headers as connectors.ts
- **MCP server crashed** between test and query -- check the Docker container is still running
- **Port changed** -- Docker ephemeral port rotated since the connection was saved

## Step 4: Force re-discover tools

If tools are stale or missing, delete and re-add the connection, or:

```bash
CONN_ID="<connection_id>"
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -e "
  DELETE FROM connection_tools WHERE connection_id = '${CONN_ID}';
  UPDATE connections SET status = 'disconnected' WHERE id = '${CONN_ID}';" 2>&1 | grep -v Warning
```

Then re-test the connection.

## Step 5: Verify agent.ts MCP transport

Check which transport `agent.ts` uses for the connection:
- **HTTP (streamable)**: uses `fetch()` with JSON-RPC -- verify URL and headers
- **stdio**: uses `StdioClientTransport` -- verify the `command` and `args` in connection config
- Connection config is stored as JSON in `connections.config` column

```bash
# View raw connection configs
docker exec supaproxy-mysql mysql -u root -p"$DB_PASSWORD" supaproxy -e "
  SELECT name, type, config FROM connections;" 2>&1 | grep -v Warning
```
