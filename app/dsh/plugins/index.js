/**
 * DeepSeek Harness Plugin Suite
 * Complete set of 15 plugins for enhanced AI capabilities
 * Version: 2.95.27
 */

// ==================== Core Plugins ====================

export { ChromePlugin } from './chrome/lib/index.js';
export { GitHubPlugin } from './github/lib/index.js';
export { ComputerUsePlugin } from './computer-use/lib/index.js';
export { BuildWebAppsPlugin } from './build-web-apps/lib/index.js';
export { FigmaPlugin } from './figma/lib/index.js';

// ==================== Productivity Plugins ====================

export { DocumentsPlugin } from './documents/lib/index.js';
export { PresentationsPlugin } from './presentations/lib/index.js';
export { SpreadsheetsPlugin } from './spreadsheets/lib/index.js';

// ==================== Media Plugins ====================

export { HyperFramesPlugin } from './hyperframes/lib/index.js';
export { RemotionPlugin } from './remotion/lib/index.js';
export { VisionAIPlugin } from './vision-ai/lib/index.js';
export { FileUploadPlugin } from './file-upload/lib/index.js';

// ==================== Integration Plugins ====================

export { MCPMarketplacePlugin } from './mcp-marketplace/lib/index.js';
export { SkillMarketPlugin } from './skill-market/lib/index.js';
export { ContextCompressionPlugin } from './context-compression/lib/index.js';

/**
 * Plugin Registry - All available plugins
 */
export const PLUGIN_REGISTRY = {
  // Core Plugins
  'chrome': {
    name: 'Chrome Browser Control',
    description: 'Control Chrome browser - open pages, search, fill forms, test websites',
    category: 'core',
    icon: '🌐',
    version: '0.1.0-rc.6'
  },
  'github': {
    name: 'GitHub Integration',
    description: 'View repos, submit PRs, handle issues, review code',
    category: 'core',
    icon: '💻',
    version: '0.1.0-rc.6'
  },
  'computer-use': {
    name: 'Computer Use',
    description: 'Directly operate computer software and windows',
    category: 'core',
    icon: '🖥️',
    version: '0.1.0-rc.6'
  },
  'build-web-apps': {
    name: 'Build Web Apps',
    description: 'Generate web applications with one sentence',
    category: 'core',
    icon: '🚀',
    version: '0.1.0-rc.6'
  },
  'figma': {
    name: 'Figma Integration',
    description: 'Understand Figma designs and generate code',
    category: 'core',
    icon: '🎨',
    version: '0.1.0-rc.6'
  },
  
  // Productivity Plugins
  'documents': {
    name: 'Document Generation',
    description: 'Generate PRDs, proposals, meeting notes, reports',
    category: 'productivity',
    icon: '📄',
    version: '0.1.0-rc.6'
  },
  'presentations': {
    name: 'PPT Generation',
    description: 'AI auto-generate presentations from topics',
    category: 'productivity',
    icon: '📊',
    version: '0.1.0-rc.6'
  },
  'spreadsheets': {
    name: 'Data Analysis',
    description: 'Analyze data, generate charts, output reports',
    category: 'productivity',
    icon: '📈',
    version: '0.1.0-rc.6'
  },
  
  // Media Plugins
  'hyperframes': {
    name: 'Web to Video',
    description: 'Convert web pages to demo videos',
    category: 'media',
    icon: '🎬',
    version: '0.1.0-rc.6'
  },
  'remotion': {
    name: 'Programmatic Video',
    description: 'Generate videos through code',
    category: 'media',
    icon: '⚡',
    version: '0.1.0-rc.6'
  },
  'vision-ai': {
    name: 'Vision AI',
    description: 'Image recognition, OCR, object detection',
    category: 'media',
    icon: '👁️',
    version: '0.1.0-rc.6'
  },
  'file-upload': {
    name: 'File Upload',
    description: 'Upload images, documents, any file type',
    category: 'media',
    icon: '📎',
    version: '0.1.0-rc.6'
  },
  
  // Integration Plugins
  'mcp-marketplace': {
    name: 'MCP Marketplace',
    description: 'Discover and install MCP servers',
    category: 'integration',
    icon: '🔌',
    version: '0.1.0-rc.6'
  },
  'skill-market': {
    name: 'Skill Market',
    description: 'Discover and use agent skills',
    category: 'integration',
    icon: '🎯',
    version: '0.1.0-rc.6'
  },
  'context-compression': {
    name: 'Context Compression',
    description: 'Automatically compress context when full',
    category: 'integration',
    icon: '🗜️',
    version: '0.1.0-rc.6'
  }
};

/**
 * Get all plugins by category
 */
export function getPluginsByCategory(category) {
  return Object.entries(PLUGIN_REGISTRY)
    .filter(([, plugin]) => plugin.category === category)
    .map(([id, plugin]) => ({ id, ...plugin }));
}

/**
 * Get all plugin IDs
 */
export function getAllPluginIds() {
  return Object.keys(PLUGIN_REGISTRY);
}

/**
 * Get plugin info by ID
 */
export function getPluginInfo(pluginId) {
  return PLUGIN_REGISTRY[pluginId] || null;
}

/**
 * Plugin count
 */
export const PLUGIN_COUNT = Object.keys(PLUGIN_REGISTRY).length;

console.log(`[DeepSeek Harness] Loaded ${PLUGIN_COUNT} plugins`);
