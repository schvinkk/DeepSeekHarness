/**
 * MCP Marketplace tools: discover, install (register), and run MCP servers.
 * The registry persists to %USERPROFILE%\.dsh\mcp-servers.json; installing
 * records the server so it can be started with mcp_start.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_PATH = join(process.env.USERPROFILE || process.env.HOME || ".", ".dsh", "mcp-servers.json");

const BUILTIN_SERVERS = [
	{ id: "filesystem", name: "Filesystem", description: "Read/write files on the filesystem", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], category: "filesystem" },
	{ id: "github", name: "GitHub", description: "GitHub API: repos, issues, PRs", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"], category: "development" },
	{ id: "postgres", name: "PostgreSQL", description: "Query PostgreSQL databases", command: "npx", args: ["-y", "@modelcontextprotocol/server-postgres"], category: "database" },
	{ id: "brave-search", name: "Brave Search", description: "Web search via Brave API", command: "npx", args: ["-y", "@modelcontextprotocol/server-brave-search"], category: "search" },
	{ id: "google-maps", name: "Google Maps", description: "Places and directions", command: "npx", args: ["-y", "@modelcontextprotocol/server-google-maps"], category: "maps" },
	{ id: "memory", name: "Memory", description: "Persistent memory storage", command: "npx", args: ["-y", "@modelcontextprotocol/server-memory"], category: "utility" },
	{ id: "slack", name: "Slack", description: "Slack workspaces and channels", command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"], category: "communication" },
	{ id: "notion", name: "Notion", description: "Notion pages and databases", command: "npx", args: ["-y", "@modelcontextprotocol/server-notion"], category: "productivity" },
	{ id: "sequential-thinking", name: "Sequential Thinking", description: "Structured problem solving", command: "npx", args: ["-y", "@modelcontextprotocol/server-sequential-thinking"], category: "utility" },
	{ id: "fetch", name: "Fetch", description: "Fetch and convert web content", command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"], category: "web" }
];

function loadRegistry() {
	if (!existsSync(REGISTRY_PATH)) return {};
	try {
		return JSON.parse(readFileSync(REGISTRY_PATH, "utf-8"));
	} catch {
		return {};
	}
}

function saveRegistry(reg) {
	mkdirSync(join(REGISTRY_PATH, ".."), { recursive: true });
	writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2), "utf-8");
}

export function registerMCPTools(ctx) {
	ctx.tools.register(defineTool({
		name: "mcp_list_servers",
		description: "List available MCP servers (built-in catalog plus installed ones).",
		parameters: {
			category: { type: "string", description: "Optional category filter." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					servers: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								id: { type: "string", required: true },
								name: { type: "string", required: true },
								description: { type: "string", required: true },
								category: { type: "string", required: true },
								installed: { type: "boolean", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => value.servers.map((s) => `[${s.installed ? "✓" : " "}] ${s.id} — ${s.description} (${s.category})`).join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const installed = loadRegistry();
			const servers = BUILTIN_SERVERS
				.filter((s) => !args.category || s.category === args.category)
				.map((s) => ({ ...s, installed: Boolean(installed[s.id]) }));
			return { servers };
		}
	}));

	ctx.tools.register(defineTool({
		name: "mcp_install_server",
		description: "Install (register) an MCP server so it can be started with mcp_start_server.",
		parameters: {
			server_id: { type: "string", required: true, description: "Server id from mcp_list_servers." },
			env: { type: "object", additionalProperties: true, description: "Extra environment variables (e.g. {\"GITHUB_TOKEN\":\"...\"})." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					installed: { type: "boolean", required: true },
					server: { type: "string", required: true },
					start_command: { type: "string", required: true }
				}
			},
			render: (args, value) => `installed ${value.server}\nstart: ${value.start_command}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const server = BUILTIN_SERVERS.find((s) => s.id === args.server_id);
			if (!server) throw new Error(`unknown server id: ${args.server_id}`);
			const reg = loadRegistry();
			reg[server.id] = { ...server, installedAt: new Date().toISOString(), env: args.env || {} };
			saveRegistry(reg);
			return {
				installed: true,
				server: server.id,
				start_command: `${server.command} ${server.args.join(" ")}`
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "mcp_add_custom_server",
		description: "Register a custom MCP server by command and arguments.",
		parameters: {
			id: { type: "string", required: true, description: "Unique id." },
			name: { type: "string", required: true },
			description: { type: "string", description: "Short description." },
			command: { type: "string", required: true, description: "Executable (e.g. npx, node, python)." },
			args: { type: "array", items: { type: "string" }, description: "Arguments." },
			env: { type: "object", additionalProperties: true, description: "Environment variables." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					id: { type: "string", required: true },
					installed: { type: "boolean", required: true }
				}
			},
			render: (args, value) => `registered custom MCP server ${value.id}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const reg = loadRegistry();
			reg[args.id] = {
				id: args.id,
				name: args.name,
				description: args.description || "",
				command: args.command,
				args: args.args || [],
				env: args.env || {},
				category: "custom",
				installedAt: new Date().toISOString()
			};
			saveRegistry(reg);
			return { id: args.id, installed: true };
		}
	}));

	ctx.tools.register(defineTool({
		name: "mcp_start_server",
		description: "Start an installed MCP server as a background process (stdio transport).",
		parameters: {
			server_id: { type: "string", required: true, description: "Server id to start." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					started: { type: "boolean", required: true },
					pid: { type: "integer", required: true },
					detail: { type: "string", required: true }
				}
			},
			render: (args, value) => value.detail
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const reg = loadRegistry();
			const server = reg[args.server_id];
			if (!server) throw new Error(`server not installed: ${args.server_id}`);
			const { spawn } = await import("node:child_process");
			const env = { ...process.env, ...(server.env || {}) };
			const child = spawn(server.command, server.args || [], { env, stdio: "ignore", detached: true, windowsHide: true });
			child.unref();
			return {
				started: true,
				pid: child.pid || 0,
				detail: `started ${args.server_id} (${server.command} ${(server.args || []).join(" ")}) pid=${child.pid}`
			};
		}
	}));
}
