/**
 * Skill Market Plugin for DeepSeek Harness
 * Discover and use agent skills from GitHub and open source platforms
 * Enhance AI capabilities with specialized skills
 */
export class SkillMarketPlugin {
  name = 'skill-market';
  description = 'Skill Market - discover and use agent skills';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.skills = new Map();
    this.installedSkills = new Map();
  }

  async activate() {
    console.log('[Skill Market Plugin] Activated');
    await this.loadSkills();
  }

  async deactivate() {
    console.log('[Skill Market Plugin] Deactivated');
    await this.saveSkills();
  }

  async loadSkills() {
    // Load built-in skill registry
    this.skills = new Map([
      ['web-search', {
        name: 'Web Search',
        description: 'Search the web for information using multiple search engines',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-web-search',
        category: 'search',
        tags: ['web', 'search', 'information'],
        rating: 4.8,
        downloads: 25000,
        instructions: 'Use this skill to search the web for current information on any topic.',
        examples: [
          'Search for latest news about AI',
          'Find documentation for React',
          'Look up weather in Beijing'
        ]
      }],
      ['code-review', {
        name: 'Code Review',
        description: 'Review code for best practices, security issues, and improvements',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-code-review',
        category: 'development',
        tags: ['code', 'review', 'quality'],
        rating: 4.7,
        downloads: 18000,
        instructions: 'Use this skill to perform thorough code reviews.',
        examples: [
          'Review this JavaScript file for issues',
          'Check security vulnerabilities in this code',
          'Suggest improvements for this function'
        ]
      }],
      ['data-analysis', {
        name: 'Data Analysis',
        description: 'Analyze data and generate insights with charts and statistics',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-data-analysis',
        category: 'analytics',
        tags: ['data', 'analysis', 'statistics'],
        rating: 4.6,
        downloads: 15000,
        instructions: 'Use this skill to analyze datasets and generate insights.',
        examples: [
          'Analyze this CSV file and show trends',
          'Create a chart from this data',
          'Calculate statistics for this dataset'
        ]
      }],
      ['content-writing', {
        name: 'Content Writing',
        description: 'Write engaging content for blogs, social media, and marketing',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-content-writing',
        category: 'content',
        tags: ['writing', 'content', 'marketing'],
        rating: 4.5,
        downloads: 12000,
        instructions: 'Use this skill to create compelling content.',
        examples: [
          'Write a blog post about machine learning',
          'Create social media captions for this product',
          'Draft an email newsletter'
        ]
      }],
      ['image-generation', {
        name: 'Image Generation',
        description: 'Generate images using AI models',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-image-generation',
        category: 'creative',
        tags: ['image', 'generation', 'ai'],
        rating: 4.4,
        downloads: 10000,
        instructions: 'Use this skill to generate images from text descriptions.',
        examples: [
          'Generate an image of a sunset over mountains',
          'Create a logo for a tech startup',
          'Design a banner for a website'
        ]
      }],
      ['translation', {
        name: 'Translation',
        description: 'Translate text between multiple languages',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-translation',
        category: 'language',
        tags: ['translation', 'language', 'internationalization'],
        rating: 4.7,
        downloads: 20000,
        instructions: 'Use this skill to translate text accurately.',
        examples: [
          'Translate this text from English to Chinese',
          'Localize this content for Japanese market',
          'Translate technical documentation'
        ]
      }],
      ['api-design', {
        name: 'API Design',
        description: 'Design RESTful APIs with best practices',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-api-design',
        category: 'development',
        tags: ['api', 'rest', 'design'],
        rating: 4.6,
        downloads: 8000,
        instructions: 'Use this skill to design well-structured APIs.',
        examples: [
          'Design an API for a user management system',
          'Create OpenAPI specification for this service',
          'Review this API design for best practices'
        ]
      }],
      ['database-design', {
        name: 'Database Design',
        description: 'Design database schemas and optimize queries',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-database-design',
        category: 'development',
        tags: ['database', 'sql', 'design'],
        rating: 4.5,
        downloads: 7000,
        instructions: 'Use this skill to design efficient databases.',
        examples: [
          'Design a database schema for an e-commerce app',
          'Optimize this SQL query',
          'Create migration scripts for this schema'
        ]
      }],
      ['testing', {
        name: 'Testing',
        description: 'Write unit tests, integration tests, and test plans',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-testing',
        category: 'development',
        tags: ['testing', 'qa', 'automation'],
        rating: 4.6,
        downloads: 9000,
        instructions: 'Use this skill to create comprehensive tests.',
        examples: [
          'Write unit tests for this function',
          'Create a test plan for this feature',
          'Generate integration tests for this API'
        ]
      }],
      ['devops', {
        name: 'DevOps',
        description: 'Set up CI/CD pipelines, Docker, and deployment automation',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-devops',
        category: 'operations',
        tags: ['devops', 'ci-cd', 'deployment'],
        rating: 4.5,
        downloads: 8500,
        instructions: 'Use this skill to automate deployments and infrastructure.',
        examples: [
          'Create a GitHub Actions workflow for this project',
          'Write a Dockerfile for this application',
          'Set up Kubernetes deployment manifests'
        ]
      }],
      ['security-audit', {
        name: 'Security Audit',
        description: 'Audit code for security vulnerabilities and compliance',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-security-audit',
        category: 'security',
        tags: ['security', 'audit', 'vulnerability'],
        rating: 4.8,
        downloads: 11000,
        instructions: 'Use this skill to identify security issues.',
        examples: [
          'Audit this code for SQL injection vulnerabilities',
          'Check for XSS issues in this web app',
          'Review authentication implementation'
        ]
      }],
      ['performance-optimization', {
        name: 'Performance Optimization',
        description: 'Optimize code performance and identify bottlenecks',
        author: 'deepseek',
        version: '1.0.0',
        source: 'https://github.com/deepseek-ai/dsh-skill-performance',
        category: 'development',
        tags: ['performance', 'optimization', 'profiling'],
        rating: 4.4,
        downloads: 6500,
        instructions: 'Use this skill to improve application performance.',
        examples: [
          'Optimize this React component for rendering',
          'Identify performance bottlenecks in this code',
          'Improve database query performance'
        ]
      }]
    ]);
  }

  async saveSkills() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const skillsPath = path.join(os.homedir(), '.dsh', 'skill-registry.json');
    const skills = Object.fromEntries(this.skills);
    
    await fs.writeFile(skillsPath, JSON.stringify(skills, null, 2));
  }

  // ==================== Discovery ====================
  
  async searchSkills(query, options = {}) {
    const { category, tags, minRating = 0, sortBy = 'downloads' } = options;
    
    let results = Array.from(this.skills.values());
    
    // Filter by query
    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(skill => 
        skill.name.toLowerCase().includes(lowerQuery) ||
        skill.description.toLowerCase().includes(lowerQuery) ||
        skill.tags.some(tag => tag.includes(lowerQuery))
      );
    }
    
    // Filter by category
    if (category) {
      results = results.filter(skill => skill.category === category);
    }
    
    // Filter by tags
    if (tags && tags.length > 0) {
      results = results.filter(skill => 
        tags.some(tag => skill.tags.includes(tag))
      );
    }
    
    // Filter by rating
    results = results.filter(skill => skill.rating >= minRating);
    
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
      case 'newest':
        // Would need timestamp field
        break;
    }
    
    return results;
  }

  async getSkillDetails(skillId) {
    return this.skills.get(skillId) || null;
  }

  async listCategories() {
    const categories = new Set();
    for (const skill of this.skills.values()) {
      categories.add(skill.category);
    }
    return Array.from(categories);
  }

  async listTags() {
    const tags = new Set();
    for (const skill of this.skills.values()) {
      skill.tags.forEach(tag => tags.add(tag));
    }
    return Array.from(tags);
  }

  // ==================== Installation ====================
  
  async installSkill(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }
    
    console.log(`[Skill Market] Installing ${skill.name}...`);
    
    // Check if already installed
    if (this.installedSkills.has(skillId)) {
      console.log(`[Skill Market] ${skill.name} already installed`);
      return this.installedSkills.get(skillId);
    }
    
    // Create installation record
    const installation = {
      id: skillId,
      skill,
      installedAt: new Date().toISOString(),
      status: 'installed'
    };
    
    this.installedSkills.set(skillId, installation);
    await this.saveSkills();
    
    console.log(`[Skill Market] ${skill.name} installed successfully`);
    return installation;
  }

  async uninstallSkill(skillId) {
    if (!this.installedSkills.has(skillId)) {
      throw new Error(`Skill ${skillId} not installed`);
    }
    
    const skill = this.skills.get(skillId);
    console.log(`[Skill Market] Uninstalling ${skill.name}...`);
    
    this.installedSkills.delete(skillId);
    await this.saveSkills();
    
    console.log(`[Skill Market] ${skill.name} uninstalled`);
  }

  // ==================== Skill Usage ====================
  
  async useSkill(skillId, task) {
    const installation = this.installedSkills.get(skillId);
    if (!installation) {
      throw new Error(`Skill ${skillId} not installed`);
    }
    
    const { skill } = installation;
    
    console.log(`[Skill Market] Using ${skill.name} for: ${task}`);
    
    // Generate skill response based on skill type
    const response = await this.generateSkillResponse(skill, task);
    
    return response;
  }

  async generateSkillResponse(skill, task) {
    // This would integrate with the actual skill implementation
    // For now, return a structured response
    
    return {
      skill: skill.name,
      task,
      instructions: skill.instructions,
      examples: skill.examples,
      response: `Using ${skill.name} skill to process: ${task}`,
      timestamp: new Date().toISOString()
    };
  }

  // ==================== Recommendations ====================
  
  async getRecommendations(category) {
    const skills = Array.from(this.skills.values());
    
    if (category) {
      return skills.filter(s => s.category === category).slice(0, 5);
    }
    
    // Return top rated
    return skills.sort((a, b) => b.rating - a.rating).slice(0, 5);
  }

  async getPopularSkills(limit = 10) {
    return Array.from(this.skills.values())
      .sort((a, b) => b.downloads - a.downloads)
      .slice(0, limit);
  }

  async getNewSkills(limit = 10) {
    // Would need timestamp field
    return Array.from(this.skills.values()).slice(0, limit);
  }

  // ==================== Custom Skills ====================
  
  async addCustomSkill(config) {
    const { id, name, description, instructions, examples = [], category, tags = [] } = config;
    
    const skill = {
      name,
      description,
      author: 'custom',
      version: '1.0.0',
      instructions,
      examples,
      category,
      tags,
      rating: 0,
      downloads: 0,
      isCustom: true
    };
    
    this.skills.set(id, skill);
    await this.saveSkills();
    
    return skill;
  }

  async removeCustomSkill(skillId) {
    const skill = this.skills.get(skillId);
    if (!skill || !skill.isCustom) {
      throw new Error(`Cannot remove built-in skill ${skillId}`);
    }
    
    if (this.installedSkills.has(skillId)) {
      await this.uninstallSkill(skillId);
    }
    
    this.skills.delete(skillId);
    await this.saveSkills();
  }

  async updateCustomSkill(skillId, updates) {
    const skill = this.skills.get(skillId);
    if (!skill || !skill.isCustom) {
      throw new Error(`Cannot update built-in skill ${skillId}`);
    }
    
    const updatedSkill = { ...skill, ...updates };
    this.skills.set(skillId, updatedSkill);
    await this.saveSkills();
    
    return updatedSkill;
  }

  // ==================== Skill Marketplace ====================
  
  async getSkillStats() {
    const skills = Array.from(this.skills.values());
    
    return {
      totalSkills: skills.length,
      totalDownloads: skills.reduce((sum, s) => sum + s.downloads, 0),
      averageRating: skills.reduce((sum, s) => sum + s.rating, 0) / skills.length,
      categories: this.getCategoryStats(skills),
      topTags: this.getTagStats(skills)
    };
  }

  getCategoryStats(skills) {
    const stats = {};
    for (const skill of skills) {
      stats[skill.category] = (stats[skill.category] || 0) + 1;
    }
    return stats;
  }

  getTagStats(skills) {
    const stats = {};
    for (const skill of skills) {
      for (const tag of skill.tags) {
        stats[tag] = (stats[tag] || 0) + 1;
      }
    }
    return Object.entries(stats)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }));
  }

  // ==================== Integration ====================
  
  async integrateWithChat(skillId, message) {
    const installation = this.installedSkills.get(skillId);
    if (!installation) {
      throw new Error(`Skill ${skillId} not installed`);
    }
    
    const { skill } = installation;
    
    // Analyze if skill is relevant to message
    const relevance = this.analyzeRelevance(skill, message);
    
    if (relevance > 0.5) {
      return await this.useSkill(skillId, message);
    }
    
    return null;
  }

  analyzeRelevance(skill, message) {
    const lowerMessage = message.toLowerCase();
    const lowerName = skill.name.toLowerCase();
    const lowerDescription = skill.description.toLowerCase();
    
    let relevance = 0;
    
    if (lowerMessage.includes(lowerName)) relevance += 0.5;
    if (lowerMessage.includes(lowerDescription)) relevance += 0.3;
    
    for (const tag of skill.tags) {
      if (lowerMessage.includes(tag)) relevance += 0.1;
    }
    
    return Math.min(1, relevance);
  }
}

export default SkillMarketPlugin;
