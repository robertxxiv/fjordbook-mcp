#!/usr/bin/env node
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { TOOLSETS, selectToolsets } from "./toolsets.js";
import { draftOnlyEnabled, draftOnlyServer } from "./draftOnly.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const server = new McpServer({
    name: "fjordbook-mcp",
    version,
});

const registrationServer = draftOnlyEnabled(process.env.FIKEN_DRAFT_ONLY)
    ? draftOnlyServer(server)
    : server;
for (const name of selectToolsets(process.env.FIKEN_TOOLSETS)) TOOLSETS[name](registrationServer);

const transport = new StdioServerTransport();
await server.connect(transport);
