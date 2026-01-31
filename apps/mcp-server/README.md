# lore.dev MCP Server

MCP server that exposes lore.dev procedures as tools for Claude Desktop.

## Claude Desktop Configuration

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "lore": {
      "command": "node",
      "args": ["/Users/nitish/tmp/boilerplate/js-monorepo-boilerplate/apps/mcp-server/index.js"]
    }
  }
}
```

## Available Tools

- **lore_list** - List available procedures (filter by level, maturity)
- **lore_get** - Get procedure details by slug
- **lore_run** - Execute a procedure with parameters
- **lore_status** - Check execution status
