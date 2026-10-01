# Installation guide

Fjordbook (`fjordbook-mcp`) is an MCP server that runs locally over stdio. Your MCP client starts it with `npx`, so there is nothing to install by hand.

## 1. Requirements

- Node.js **18.17 or newer** (`node --version`). `npx` ships with Node.
- A Fiken account with API access.

## 2. Get your credentials

| Value                | Where to find it                                            |
| :------------------- | :---------------------------------------------------------- |
| `FIKEN_API_TOKEN`    | fiken.no → Profile → API → Personal tokens → create a token |
| `FIKEN_COMPANY_SLUG` | In the Fiken URL: `https://fiken.no/company/YOUR-SLUG/...`  |

Treat the token like a password. It can reach every company your Fiken user can access, so pin `FIKEN_COMPANY_SLUG` to the one company you want the assistant to work on. If you are trying things out, use a demo company.

## 3. Add the server to your client

All clients use the same command and environment; only the config location differs.

### Claude Desktop

Edit `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`), then restart Claude Desktop:

```json
{
    "mcpServers": {
        "fjordbook": {
            "command": "npx",
            "args": ["-y", "fjordbook-mcp"],
            "env": {
                "FIKEN_API_TOKEN": "your-personal-token-here",
                "FIKEN_COMPANY_SLUG": "your-company-slug"
            }
        }
    }
}
```

On Windows, if `npx` is not found, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "fjordbook-mcp"]`.

### Claude Code

```bash
claude mcp add fjordbook \
  --env FIKEN_API_TOKEN=your-personal-token-here \
  --env FIKEN_COMPANY_SLUG=your-company-slug \
  -- npx -y fjordbook-mcp
```

### Cursor

Add the JSON block above to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project).

### VS Code / other clients

Any client that supports stdio MCP servers works. Configure command `npx`, arguments `-y fjordbook-mcp`, and the two environment variables.

### pnpm instead of npx

Use `"command": "pnpx"` and `"args": ["fjordbook-mcp"]`.

## 4. Verify

Restart the client, then ask: _"Who am I in Fiken?"_ (calls `fiken_get_user`) or _"List my contacts"_. If tools do not appear, see troubleshooting below.

## Small context windows and local models

The full server exposes 189 tools, about 47k tokens of tool definitions. Small or local models cannot afford that. Expose only the areas you need with `FIKEN_TOOLSETS`:

```json
"env": {
    "FIKEN_API_TOKEN": "...",
    "FIKEN_COMPANY_SLUG": "...",
    "FIKEN_TOOLSETS": "contacts,products,invoices"
}
```

Valid names: `user`, `accounts`, `contacts`, `invoices`, `creditNotes`, `offers`, `orderConfirmations`, `journalEntries`, `transactions`, `purchases`, `sales`, `misc`, `recurringInvoices`, `products`, `timeTracking`, `attachments`. `user` is always included. A typo aborts startup with a list of valid names.

## Optional settings

| Variable                 | Default    | Purpose                                                       |
| :----------------------- | :--------- | :------------------------------------------------------------ |
| `FIKEN_TIMEOUT_MS`       | `30000`    | Per-request timeout                                           |
| `FIKEN_TOOLSETS`         | all        | Comma-separated toolsets to expose                            |
| `FIKEN_UPLOAD_ROOT`      | unset      | Attachment uploads by file path must be inside this directory |
| `FIKEN_MAX_UPLOAD_BYTES` | `26214400` | Maximum attachment size (25 MB)                               |

## Troubleshooting

| Symptom                                            | Fix                                                                                                 |
| :------------------------------------------------- | :-------------------------------------------------------------------------------------------------- |
| Server does not start / `npx` not found            | Check `node --version` (>= 18.17) and that `npx` is on the PATH the client uses; restart the client |
| `FIKEN_API_TOKEN environment variable is required` | The `env` block is missing or misspelled; both variables are required                               |
| `Fiken 401` with a message                         | The message is Fiken's real reason (for example an uninitialised counter); act on it                |
| `Fiken 401` / `403` with the token hint            | Token invalid, revoked, or no access to that company; create a new token and check the slug         |
| `Fiken 404` on company calls                       | Wrong `FIKEN_COMPANY_SLUG`; call `fiken_list_companies` to see valid slugs                          |
| `Fiken 429`                                        | Rate limit; the server retries automatically, ask for smaller batches                               |
| Validation error on a date                         | Dates must be `YYYY-MM-DD`                                                                          |
| Account/VAT error when creating records            | Fiken enforces account/VAT pairs (for example 3000 accepts only `HIGH`); see the tool descriptions  |
| Too many tools / context overflow                  | Set `FIKEN_TOOLSETS` (see above)                                                                    |

## Updating and uninstalling

`npx -y fjordbook-mcp` fetches the latest version on a cold cache; pin one with `fjordbook-mcp@1.0.0`. To uninstall, remove the server entry from your client config and revoke the token in Fiken.
