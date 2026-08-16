/**
 * GitHub tools: list repos, get repo, list/create issues, list/create PRs,
 * read file contents. Uses the public GitHub REST API; a GITHUB_TOKEN
 * environment variable enables authenticated (higher-rate) requests.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";

const GH_API = "https://api.github.com";

async function gh(path, method = "GET", body) {
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	const headers = {
		"user-agent": "dsh-plugin-suite/2.95.27",
		accept: "application/vnd.github+json"
	};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body !== undefined) headers["content-type"] = "application/json";
	const res = await fetch(`${GH_API}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const text = await res.text().catch(() => "");
		throw new Error(`GitHub API ${res.status}: ${text.slice(0, 300)}`);
	}
	return res.status === 204 ? null : await res.json();
}

function renderList(title, items) {
	return title + "\n" + items.map((i, n) => `${n + 1}. ${i}`).join("\n");
}

export function registerGitHubTools(ctx) {
	ctx.tools.register(defineTool({
		name: "github_list_repos",
		description: "List public repositories for a GitHub user (or the authenticated user).",
		parameters: {
			username: {
				type: "string",
				description: "GitHub username; omit to list the authenticated user's repos."
			},
			max: {
				type: "number",
				description: "Maximum repos to return (default 10)."
			}
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					repos: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								name: { type: "string", required: true },
								description: { type: "string", required: true },
								url: { type: "string", required: true },
								stars: { type: "integer", required: true },
								language: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => renderList("Repositories:", value.repos.map((r) => `${r.name} ⭐${r.stars} [${r.language || "?"}] — ${r.description || "no description"} (${r.url})`))
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const max = Math.min(args.max ?? 10, 50);
			const path = args.username
				? `/users/${encodeURIComponent(args.username)}/repos?sort=updated&per_page=${max}`
				: `/user/repos?sort=updated&per_page=${max}&visibility=all`;
			const data = await gh(path);
			return {
				repos: (data || []).map((r) => ({
					name: r.full_name || r.name,
					description: r.description || "",
					url: r.html_url,
					stars: r.stargazers_count || 0,
					language: r.language || ""
				}))
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "github_get_repo",
		description: "Get details about a GitHub repository.",
		parameters: {
			owner: { type: "string", required: true, description: "Repository owner." },
			repo: { type: "string", required: true, description: "Repository name." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					name: { type: "string", required: true },
					description: { type: "string", required: true },
					stars: { type: "integer", required: true },
					forks: { type: "integer", required: true },
					open_issues: { type: "integer", required: true },
					language: { type: "string", required: true },
					url: { type: "string", required: true },
					license: { type: "string", required: true },
					updated_at: { type: "string", required: true }
				}
			},
			render: (args, value) => [
				`<repo>${value.name}</repo>`,
				value.description,
				`⭐ ${value.stars} · 🍴 ${value.forks} · issues ${value.open_issues} · ${value.language || "?"}`,
				`license: ${value.license} · updated ${value.updated_at}`,
				value.url
			].join("\n")
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const r = await gh(`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}`);
			return {
				name: r.full_name,
				description: r.description || "",
				stars: r.stargazers_count || 0,
				forks: r.forks_count || 0,
				open_issues: r.open_issues_count || 0,
				language: r.language || "",
				url: r.html_url,
				license: r.license?.spdx_id || "none",
				updated_at: r.updated_at || ""
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "github_list_issues",
		description: "List issues for a GitHub repository.",
		parameters: {
			owner: { type: "string", required: true },
			repo: { type: "string", required: true },
			state: { type: "string", description: "open | closed | all (default open)." },
			max: { type: "number", description: "Maximum issues (default 10)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					issues: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								number: { type: "integer", required: true },
								title: { type: "string", required: true },
								state: { type: "string", required: true },
								url: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => renderList("Issues:", value.issues.map((i) => `#${i.number} [${i.state}] ${i.title} (${i.url})`))
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const max = Math.min(args.max ?? 10, 50);
			const data = await gh(
				`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues?state=${args.state || "open"}&per_page=${max}`
			);
			return {
				issues: (data || []).filter((i) => !i.pull_request).map((i) => ({
					number: i.number,
					title: i.title,
					state: i.state,
					url: i.html_url
				}))
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "github_create_issue",
		description: "Create an issue in a GitHub repository (requires GITHUB_TOKEN).",
		parameters: {
			owner: { type: "string", required: true },
			repo: { type: "string", required: true },
			title: { type: "string", required: true, description: "Issue title." },
			body: { type: "string", description: "Issue body." },
			labels: { type: "array", items: { type: "string" }, description: "Labels to apply." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					number: { type: "integer", required: true },
					url: { type: "string", required: true }
				}
			},
			render: (args, value) => `Created issue #${value.number}: ${value.url}`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			if (!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN)) {
				throw new Error("GITHUB_TOKEN environment variable is required to create issues");
			}
			const i = await gh(
				`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues`,
				"POST",
				{ title: args.title, body: args.body || "", labels: args.labels || [] }
			);
			return { number: i.number, url: i.html_url };
		}
	}));

	ctx.tools.register(defineTool({
		name: "github_list_prs",
		description: "List pull requests for a GitHub repository.",
		parameters: {
			owner: { type: "string", required: true },
			repo: { type: "string", required: true },
			state: { type: "string", description: "open | closed | all (default open)." },
			max: { type: "number", description: "Maximum PRs (default 10)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					pulls: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								number: { type: "integer", required: true },
								title: { type: "string", required: true },
								state: { type: "string", required: true },
								url: { type: "string", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => renderList("Pull requests:", value.pulls.map((p) => `#${p.number} [${p.state}] ${p.title} (${p.url})`))
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const max = Math.min(args.max ?? 10, 50);
			const data = await gh(
				`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/pulls?state=${args.state || "open"}&per_page=${max}`
			);
			return {
				pulls: (data || []).map((p) => ({
					number: p.number,
					title: p.title,
					state: p.state,
					url: p.html_url
				}))
			};
		}
	}));

	ctx.tools.register(defineTool({
		name: "github_get_file",
		description: "Read a file from a GitHub repository and return its decoded content.",
		parameters: {
			owner: { type: "string", required: true },
			repo: { type: "string", required: true },
			path: { type: "string", required: true, description: "File path in the repo." },
			ref: { type: "string", description: "Branch/tag/SHA (default: default branch)." }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					content: { type: "string", required: true },
					size: { type: "integer", required: true }
				}
			},
			render: (args, value) => `<path>${value.path}</path>\n<content>\n${value.content}\n</content>`
		},
		isConcurrencySafe: () => true,
		async execute(args) {
			const q = args.ref ? `?ref=${encodeURIComponent(args.ref)}` : "";
			const data = await gh(`/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/contents/${encodeURIComponent(args.path)}${q}`);
			const content = Buffer.from(data.content, "base64").toString("utf-8");
			return { path: data.path, content, size: data.size };
		}
	}));
}
