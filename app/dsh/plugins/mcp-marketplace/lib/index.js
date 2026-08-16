/**
 * MCP Marketplace Plugin for DeepSeek Harness
 * Discover and install MCP servers from GitHub and open source platforms
 * Use MCP tools directly in conversations
 */
export class MCPMarketplacePlugin {
  name = 'mcp-marketplace';
  description = 'MCP Marketplace - discover and install MCP servers';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.servers = new Map();
    this.installedServers = new Map();
  }

  async activate() {
    console.log('[MCP Marketplace Plugin] Activated');
    await this.loadRegistry();
  }

  async deactivate() {
    console.log('[MCP Marketplace Plugin] Deactivated');
    await this.saveRegistry();
  }

  async loadRegistry() {
    // Load built-in MCP server registry
    this.servers = new Map([
      ['filesystem', {
        name: 'Filesystem MCP Server',
        description: 'Read, write, and manage files on the filesystem',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
        tools: ['read_file', 'write_file', 'list_directory', 'search_files'],
        category: 'filesystem',
        rating: 4.8,
        downloads: 15000
      }],
      ['github', {
        name: 'GitHub MCP Server',
        description: 'Interact with GitHub API - repos, issues, PRs',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
        tools: ['create_issue', 'list_issues', 'create_pr', 'get_file_contents'],
        category: 'development',
        rating: 4.7,
        downloads: 12000
      }],
      ['postgres', {
        name: 'PostgreSQL MCP Server',
        description: 'Query and manage PostgreSQL databases',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-postgres'],
        env: { DATABASE_URL: '${DATABASE_URL}' },
        tools: ['query', 'list_tables', 'describe_table'],
        category: 'database',
        rating: 4.6,
        downloads: 8000
      }],
      ['brave-search', {
        name: 'Brave Search MCP Server',
        description: 'Search the web using Brave Search API',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-brave-search'],
        env: { BRAVE_API_KEY: '${BRAVE_API_KEY}' },
        tools: ['brave_web_search', 'brave_local_search'],
        category: 'search',
        rating: 4.5,
        downloads: 10000
      }],
      ['google-maps', {
        name: 'Google Maps MCP Server',
        description: 'Access Google Maps API for places and directions',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/google-maps',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-google-maps'],
        env: { GOOGLE_MAPS_API_KEY: '${GOOGLE_MAPS_API_KEY}' },
        tools: ['search_places', 'get_directions', 'get_place_details'],
        category: 'maps',
        rating: 4.4,
        downloads: 7000
      }],
      ['memory', {
        name: 'Memory MCP Server',
        description: 'Persistent memory storage for conversations',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        tools: ['save_memory', 'search_memory', 'list_memories'],
        category: 'utility',
        rating: 4.9,
        downloads: 20000
      }],
      ['slack', {
        name: 'Slack MCP Server',
        description: 'Interact with Slack workspaces and channels',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { SLACK_BOT_TOKEN: '${SLACK_BOT_TOKEN}' },
        tools: ['send_message', 'list_channels', 'get_thread'],
        category: 'communication',
        rating: 4.3,
        downloads: 6000
      }],
      ['notion', {
        name: 'Notion MCP Server',
        description: 'Read and write Notion pages and databases',
        source: 'https://github.com/modelcontextprotocol/servers/tree/main/src/notion',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-notion'],
        env: { NOTION_API_KEY: '${NOTION_API_KEY}' },
        tools: ['search_pages', 'create_page', 'update_page', 'query_database'],
        category: 'productivity',
        rating: 4.6,
        downloads: 9000
      }]
    ]);
  }

  async saveRegistry() {
    // Save registry to disk
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const registryPath = path.join(os.homedir(), '.dsh', 'mcp-registry.json');
    const registry = Object.fromEntries(this.servers);
    
    await fs.writeFile(registryPath, JSON.stringify(registry, null, 2));
  }

  // ==================== Discovery ====================
  
  async searchServers(query, options = {}) {
    const { category, minRating = 0, sortBy = 'downloads' } = options;
    
    let results = Array.from(this.servers.values());
    
    // Filter by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(server => 
        server.name.toLowerCase().includes(lowerQuery) ||
        server.description.toLowerCase().includes(lowerQuery)
      );
    }
    
    // Filter by category
    if (category) {
      results = results.filter(server => server.category === category);
    }
    
    // Filter by rating
    results = results.filter(server => server.rating >= minRating);
    
    // Sort
    switch (sortBy) {
      case 'downloads':
        results.sort((a, b) => b.downloads - a.downloads);
        break;
      case 'rating':
        results.sort((a, b) => b.rating - a.rating);
        break;
      case 'name':
        results.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }
    
    return results;
  }

  async getServerDetails(serverId) {
    return this.servers.get(serverId) || null;
  }

  async listCategories() {
    const categories = new Set();
    for (const server of this.servers.values()) {
      categories.add(server.category);
    }
    return Array.from(categories);
  }

  // ==================== Installation ====================
  
  async installServer(serverId, options = {}) {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    console.log(`[MCP Marketplace] Installing ${server.name}...`);
    
    // Check if already installed
    if (this.installedServers.has(serverId)) {
      console.log(`[MCP Marketplace] ${server.name} already installed`);
      return this.installedServers.get(serverId);
    }
    
    // Install dependencies
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      // Install the MCP server package
      await execAsync(`npm install -g ${server.args[1]}`, { stdio: 'inherit' });
      
      // Configure environment variables
      const env = { ...process.env };
      for (const [key, value] of Object.entries(server.env || {})) {
        if (value.startsWith('${') && value.endsWith('}')) {
          const envVar = value.slice(2, -1);
          env[key] = options.env?.[envVar] || process.env[envVar] || '';
        } else {
          env[key] = value;
        }
      }
      
      const installation = {
        id: serverId,
        server,
        installedAt: new Date().toISOString(),
        env,
        status: 'installed'
      };
      
      this.installedServers.set(serverId, installation);
      await this.saveRegistry();
      
      console.log(`[MCP Marketplace] ${server.name} installed successfully`);
      return installation;
    } catch (error) {
      console.error(`[MCP Marketplace] Failed to install ${server.name}:`, error);
      throw error;
    }
  }

  async uninstallServer(serverId) {
    if (!this.installedServers.has(serverId)) {
      throw new Error(`Server ${serverId} not installed`);
    }
    
    const server = this.servers.get(serverId);
    console.log(`[MCP Marketplace] Uninstalling ${server.name}...`);
    
    // Uninstall package
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    try {
      await execAsync(`npm uninstall -g ${server.args[1]}`, { stdio: 'inherit' });
      
      this.installedServers.delete(serverId);
      await this.saveRegistry();
      
      console.log(`[MCP Marketplace] ${server.name} uninstalled`);
    } catch (error) {
      console.error(`[MCP Marketplace] Failed to uninstall ${server.name}:`, error);
    }
  }

  // ==================== Server Management ====================
  
  async startServer(serverId) {
    const installation = this.installedServers.get(serverId);
    if (!installation) {
      throw new Error(`Server ${serverId} not installed`);
    }
    
    const { server, env } = installation;
    const { spawn } = await import('child_process');
    
    const child = spawn(server.command, server.args.slice(1), {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    installation.process = child;
    installation.status = 'running';
    
    child.stdout.on('data', (data) => {
      console.log(`[MCP Server ${serverId}] ${data.toString()}`);
    });
    
    child.stderr.on('data', (data) => {
      console.error(`[MCP Server ${serverId}] Error: ${data.toString()}`);
    });
    
    child.on('close', (code) => {
      console.log(`[MCP Server ${serverId}] Process exited with code ${code}`);
      installation.status = 'stopped';
    });
    
    return installation;
  }

  async stopServer(serverId) {
    const installation = this.installedServers.get(serverId);
    if (!installation || !installation.process) {
      return;
    }
    
    installation.process.kill();
    installation.status = 'stopped';
  }

  async getServerStatus(serverId) {
    const installation = this.installedServers.get(serverId);
    return installation ? installation.status : 'not_installed';
  }

  // ==================== Tool Integration ====================
  
  async getServerTools(serverId) {
    const installation = this.installedServers.get(serverId);
    if (!installation) {
      throw new Error(`Server ${serverId} not installed`);
    }
    
    return installation.server.tools;
  }

  async callServerTool(serverId, toolName, params = {}) {
    const installation = this.installedServers.get(serverId);
    if (!installation || installation.status !== 'running') {
      throw new Error(`Server ${serverId} not running`);
    }
    
    // Send tool call to MCP server
    const request = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      },
      id: Date.now()
    };
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Tool call timeout'));
      }, 30000);
      
      installation.process.stdout.once('data', (data) => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(data.toString());
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result);
          }
        } catch (error) {
          reject(error);
        }
      });
      
      installation.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  // ==================== Custom Servers ====================
  
  async addCustomServer(config) {
    const { id, name, description, command, args = [], env = {}, tools = [] } = config;
    
    const server = {
      name,
      description,
      command,
      args,
      env,
      tools,
      category: 'custom',
      rating: 0,
      downloads: 0,
      isCustom: true
    };
    
    this.servers.set(id, server);
    await this.saveRegistry();
    
    return server;
  }

  async removeCustomServer(serverId) {
    const server = this.servers.get(serverId);
    if (!server || !server.isCustom) {
      throw new Error(`Cannot remove built-in server ${serverId}`);
    }
    
    if (this.installedServers.has(serverId)) {
      await this.uninstallServer(serverId);
    }
    
    this.servers.delete(serverId);
    await this.saveRegistry();
  }

  // ==================== Recommendations ====================
  
  async getRecommendations(category) {
    const servers = Array.from(this.servers.values());
    
    if (category) {
      return servers.filter(s => s.category === category).slice(0, 5);
    }
    
    // Return top rated
    return servers.sort((a, b) => b.rating - a.rating).slice(0, 5);
  }

  async getPopularServers(limit = 10) {
    return Array.from(this.servers.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }
}

export default MCPMarketplacePlugin;
