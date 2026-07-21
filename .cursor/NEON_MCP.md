# Neon MCP Configuration

This folder contains Neon MCP (Model Context Protocol) configuration for AI-assisted database management.

## What is MCP?

The Model Context Protocol (MCP) lets AI assistants interact with your Neon database on your behalf. With MCP, you can:

- Execute SQL queries
- Inspect database schema
- Create branches for testing
- Run migrations safely
- Manage projects

## Setup

1. **Get your Neon API Key**
   - Go to [console.neon.tech](https://console.neon.tech/app/settings/api-keys)
   - Create a new API key
   - Copy the key and add it to your `.env` file:
     ```
     NEON_API_KEY=your_api_key_here
     ```

2. **Configure MCP Client**
   
   The MCP configuration is in `.mcp.json` (project root).

3. **Test the Connection**
   
   Once configured, your AI assistant can run queries like:
   ```
   List all tables in the database
   Show recent analyses from candidate_match_analyses
   ```

## Security

### Read-Only Mode
Add `?readonly=true` to the MCP URL to restrict to read operations:
```json
{
  "mcpServers": {
    "neon": {
      "url": "https://mcp.neon.tech/mcp?readonly=true",
      "env": {
        "NEON_API_KEY": "${NEON_API_KEY}"
      }
    }
  }
}
```

### Project-Scoped Mode
Limit operations to a specific project:
```json
{
  "mcpServers": {
    "neon": {
      "url": "https://mcp.neon.tech/mcp?projectId=<your-project-id>",
      "env": {
        "NEON_API_KEY": "${NEON_API_KEY}"
      }
    }
  }
}
```

### Category Filtering
Enable only specific tool categories:
```json
{
  "mcpServers": {
    "neon": {
      "url": "https://mcp.neon.tech/mcp?category=querying&category=schema",
      "env": {
        "NEON_API_KEY": "${NEON_API_KEY}"
      }
    }
  }
}
```

Available categories:
- `querying` - Execute SQL queries
- `schema` - Inspect and modify schema
- `branches` - Branch management
- `projects` - Project management

## Quick Reference

### Common MCP Operations

```bash
# Initialize MCP (if using CLI)
npx neon@latest init

# List available tools
curl "https://mcp.neon.tech/api/list-tools?readonly=true"

# Test connection
npx -y @neondatabase/mcp-server-neon start $NEON_API_KEY
```

### Database Operations via MCP

Your AI assistant can perform these operations:

**Querying:**
- "Show all tables"
- "Describe candidate_match_analyses table"
- "Count analyses from last week"

**Schema:**
- "Create a new column for candidate feedback"
- "Add an index on match_category"

**Branches:**
- "Create a test branch"
- "Compare schema between branches"

## IP Allowlist

If using IP Allow on your Neon project, add these IPs:
- `34.192.103.46`
- `23.22.233.166`

## Documentation

- [Neon MCP Server](https://neon.tech/docs/ai/neon-mcp-server)
- [MCP Protocol](https://modelcontextprotocol.org)
- [Neon API Reference](https://neon.tech/docs/reference/api)
