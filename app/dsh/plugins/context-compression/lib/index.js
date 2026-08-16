/**
 * Context Compression Plugin for DeepSeek Harness
 * Automatically compress context when it's full to continue processing tasks
 * Smart summarization and context management
 */
export class ContextCompressionPlugin {
  name = 'context-compression';
  description = 'Context Compression - automatically compress context when full to continue processing';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.maxTokens = ctx?.config?.maxTokens || 128000;
    this.compressionThreshold = ctx?.config?.compressionThreshold || 0.85; // 85% full
    this.compressionRatio = ctx?.config?.compressionRatio || 0.5; // Compress to 50%
    this.conversationHistory = [];
    this.compressedSummaries = [];
  }

  async activate() {
    console.log('[Context Compression Plugin] Activated');
  }

  async deactivate() {
    console.log('[Context Compression Plugin] Deactivated');
  }

  // ==================== Token Counting ====================
  
  async countTokens(text) {
    // Simple token estimation (approximate)
    // In production, use tiktoken for accurate counting
    const words = text.split(/\s+/).length;
    const chars = text.length;
    
    // Rough estimate: 1 token ≈ 4 characters or 0.75 words
    return Math.ceil(chars / 4);
  }

  async countMessageTokens(messages) {
    let total = 0;
    for (const message of messages) {
      total += await this.countTokens(message.content || '');
      total += 4; // Overhead for message formatting
    }
    return total;
  }

  // ==================== Context Analysis ====================
  
  async analyzeContext(messages) {
    const totalTokens = await this.countMessageTokens(messages);
    const usage = totalTokens / this.maxTokens;
    
    const analysis = {
      totalTokens,
      maxTokens: this.maxTokens,
      usage,
      isNearFull: usage >= this.compressionThreshold,
      isFull: usage >= 1,
      messageCount: messages.length,
      oldestMessage: messages[0]?.timestamp,
      newestMessage: messages[messages.length - 1]?.timestamp
    };
    
    // Analyze message importance
    analysis.messageImportance = await this.analyzeMessageImportance(messages);
    
    return analysis;
  }

  async analyzeMessageImportance(messages) {
    const importance = [];
    
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const score = await this.calculateImportance(message, i, messages.length);
      
      importance.push({
        index: i,
        role: message.role,
        timestamp: message.timestamp,
        score,
        tokens: await this.countTokens(message.content || '')
      });
    }
    
    return importance;
  }

  async calculateImportance(message, index, totalMessages) {
    let score = 0.5; // Base score
    
    const content = (message.content || '').toLowerCase();
    
    // Boost for system messages
    if (message.role === 'system') score += 0.3;
    
    // Boost for recent messages
    const recency = index / totalMessages;
    score += recency * 0.2;
    
    // Boost for messages with important keywords
    const importantKeywords = ['important', 'critical', 'key', 'summary', 'conclusion', 'decision'];
    for (const keyword of importantKeywords) {
      if (content.includes(keyword)) score += 0.1;
    }
    
    // Boost for messages with code or technical content
    if (content.includes('```') || content.includes('function') || content.includes('class')) {
      score += 0.1;
    }
    
    // Boost for messages with questions
    if (content.includes('?')) score += 0.05;
    
    // Reduce for very short messages
    if (content.length < 50) score -= 0.1;
    
    return Math.min(1, Math.max(0, score));
  }

  // ==================== Compression Strategies ====================
  
  async compressContext(messages, strategy = 'smart') {
    const analysis = await this.analyzeContext(messages);
    
    if (!analysis.isNearFull) {
      return { messages, compressed: false, analysis };
    }
    
    console.log(`[Context Compression] Context at ${(analysis.usage * 100).toFixed(1)}% capacity, compressing...`);
    
    let compressedMessages;
    
    switch (strategy) {
      case 'smart':
        compressedMessages = await this.smartCompression(messages, analysis);
        break;
      case 'aggressive':
        compressedMessages = await this.aggressiveCompression(messages, analysis);
        break;
      case 'preserve-recent':
        compressedMessages = await this.preserveRecentCompression(messages, analysis);
        break;
      case 'summarize-all':
        compressedMessages = await this.summarizeAllCompression(messages, analysis);
        break;
      default:
        compressedMessages = await this.smartCompression(messages, analysis);
    }
    
    const newAnalysis = await this.analyzeContext(compressedMessages);
    
    return {
      messages: compressedMessages,
      compressed: true,
      originalAnalysis: analysis,
      newAnalysis,
      compressionRatio: 1 - (newAnalysis.totalTokens / analysis.totalTokens)
    };
  }

  async smartCompression(messages, analysis) {
    // Smart compression: keep important messages, summarize others
    const compressed = [];
    const toSummarize = [];
    
    // Always keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    compressed.push(...systemMessages);
    
    // Keep recent messages
    const recentCount = Math.min(10, Math.floor(messages.length * 0.2));
    const recentMessages = messages.slice(-recentCount);
    compressed.push(...recentMessages);
    
    // Summarize older messages
    const olderMessages = messages.slice(0, -recentCount).filter(m => m.role !== 'system');
    
    if (olderMessages.length > 0) {
      const summary = await this.summarizeMessages(olderMessages);
      compressed.unshift({
        role: 'system',
        content: `[Context Summary]\n${summary}`,
        timestamp: new Date().toISOString(),
        isSummary: true
      });
    }
    
    return compressed;
  }

  async aggressiveCompression(messages, analysis) {
    // Aggressive compression: keep only essential messages
    const compressed = [];
    
    // Keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    compressed.push(...systemMessages);
    
    // Keep only the last 5 messages
    const recentMessages = messages.slice(-5);
    compressed.push(...recentMessages);
    
    // Summarize everything else
    const otherMessages = messages.slice(0, -5).filter(m => m.role !== 'system');
    
    if (otherMessages.length > 0) {
      const summary = await this.summarizeMessages(otherMessages, true);
      compressed.unshift({
        role: 'system',
        content: `[Aggressive Context Summary]\n${summary}`,
        timestamp: new Date().toISOString(),
        isSummary: true
      });
    }
    
    return compressed;
  }

  async preserveRecentCompression(messages, analysis) {
    // Preserve recent context, compress older parts
    const compressed = [];
    
    // Keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    compressed.push(...systemMessages);
    
    // Keep recent 30% of messages
    const recentCount = Math.ceil(messages.length * 0.3);
    const recentMessages = messages.slice(-recentCount);
    compressed.push(...recentMessages);
    
    // Compress the rest
    const olderMessages = messages.slice(0, -recentCount).filter(m => m.role !== 'system');
    
    if (olderMessages.length > 0) {
      const summary = await this.summarizeMessages(olderMessages);
      compressed.unshift({
        role: 'system',
        content: `[Earlier Context Summary]\n${summary}`,
        timestamp: new Date().toISOString(),
        isSummary: true
      });
    }
    
    return compressed;
  }

  async summarizeAllCompression(messages, analysis) {
    // Summarize all non-system messages
    const compressed = [];
    
    // Keep system messages
    const systemMessages = messages.filter(m => m.role === 'system');
    compressed.push(...systemMessages);
    
    // Summarize all other messages
    const otherMessages = messages.filter(m => m.role !== 'system');
    
    if (otherMessages.length > 0) {
      const summary = await this.summarizeMessages(otherMessages, true);
      compressed.push({
        role: 'system',
        content: `[Complete Conversation Summary]\n${summary}`,
        timestamp: new Date().toISOString(),
        isSummary: true
      });
      
      // Keep the last message for context
      compressed.push(messages[messages.length - 1]);
    }
    
    return compressed;
  }

  // ==================== Summarization ====================
  
  async summarizeMessages(messages, detailed = false) {
    // Group messages by role
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    
    const summary = {
      topics: await this.extractTopics(messages),
      keyPoints: await this.extractKeyPoints(messages),
      decisions: await this.extractDecisions(messages),
      questions: await this.extractQuestions(messages),
      code: await this.extractCode(messages),
      timeline: this.extractTimeline(messages)
    };
    
    // Generate summary text
    let summaryText = '';
    
    // Topics
    if (summary.topics.length > 0) {
      summaryText += `## Topics Discussed\n${summary.topics.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    
    // Key points
    if (summary.keyPoints.length > 0) {
      summaryText += `## Key Points\n${summary.keyPoints.map(p => `- ${p}`).join('\n')}\n\n`;
    }
    
    // Decisions
    if (summary.decisions.length > 0) {
      summaryText += `## Decisions Made\n${summary.decisions.map(d => `- ${d}`).join('\n')}\n\n`;
    }
    
    // Questions
    if (summary.questions.length > 0 && detailed) {
      summaryText += `## Open Questions\n${summary.questions.map(q => `- ${q}`).join('\n')}\n\n`;
    }
    
    // Code
    if (summary.code.length > 0 && detailed) {
      summaryText += `## Code Discussed\n${summary.code.map(c => `- ${c}`).join('\n')}\n\n`;
    }
    
    // Timeline
    if (summary.timeline.length > 0 && detailed) {
      summaryText += `## Timeline\n${summary.timeline.map(t => `- ${t}`).join('\n')}\n\n`;
    }
    
    // Statistics
    summaryText += `## Statistics\n`;
    summaryText += `- Total messages: ${messages.length}\n`;
    summaryText += `- User messages: ${userMessages.length}\n`;
    summaryText += `- Assistant messages: ${assistantMessages.length}\n`;
    
    return summaryText;
  }

  async extractTopics(messages) {
    const topics = new Set();
    
    for (const message of messages) {
      const content = (message.content || '').toLowerCase();
      
      // Simple topic extraction based on keywords
      const topicKeywords = {
        'code': ['code', 'function', 'class', 'variable', 'programming'],
        'design': ['design', 'ui', 'ux', 'layout', 'interface'],
        'data': ['data', 'database', 'sql', 'query', 'analytics'],
        'api': ['api', 'endpoint', 'rest', 'graphql', 'request'],
        'deployment': ['deploy', 'server', 'hosting', 'cloud', 'aws'],
        'testing': ['test', 'testing', 'qa', 'quality', 'bug']
      };
      
      for (const [topic, keywords] of Object.entries(topicKeywords)) {
        if (keywords.some(keyword => content.includes(keyword))) {
          topics.add(topic);
        }
      }
    }
    
    return Array.from(topics);
  }

  async extractKeyPoints(messages) {
    const keyPoints = [];
    
    for (const message of messages) {
      const content = message.content || '';
      
      // Look for sentences with important indicators
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
      
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        const lower = trimmed.toLowerCase();
        
        // Check for importance indicators
        if (lower.includes('important') || lower.includes('key') || 
            lower.includes('crucial') || lower.includes('essential') ||
            lower.includes('must') || lower.includes('should')) {
          keyPoints.push(trimmed);
        }
      }
    }
    
    return keyPoints.slice(0, 10); // Limit to 10 key points
  }

  async extractDecisions(messages) {
    const decisions = [];
    
    for (const message of messages) {
      const content = message.content || '';
      const lower = content.toLowerCase();
      
      // Look for decision indicators
      if (lower.includes('decided') || lower.includes('agreed') || 
          lower.includes('conclusion') || lower.includes('will use') ||
          lower.includes('going with') || lower.includes('chose')) {
        // Extract the decision
        const sentences = content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (sentence.toLowerCase().includes('decided') || 
              sentence.toLowerCase().includes('agreed')) {
            decisions.push(sentence.trim());
          }
        }
      }
    }
    
    return decisions.slice(0, 5); // Limit to 5 decisions
  }

  async extractQuestions(messages) {
    const questions = [];
    
    for (const message of messages) {
      const content = message.content || '';
      const sentences = content.split(/[.!?]+/);
      
      for (const sentence of sentences) {
        if (sentence.includes('?')) {
          questions.push(sentence.trim());
        }
      }
    }
    
    return questions.slice(0, 5); // Limit to 5 questions
  }

  async extractCode(messages) {
    const codeBlocks = [];
    
    for (const message of messages) {
      const content = message.content || '';
      const codeMatches = content.match(/```[\s\S]*?```/g);
      
      if (codeMatches) {
        for (const match of codeMatches) {
          const code = match.replace(/```\w*\n?/g, '').replace(/```/g, '').trim();
          if (code.length > 0) {
            codeBlocks.push(code.substring(0, 200) + (code.length > 200 ? '...' : ''));
          }
        }
      }
    }
    
    return codeBlocks.slice(0, 3); // Limit to 3 code blocks
  }

  extractTimeline(messages) {
    const timeline = [];
    
    for (const message of messages) {
      if (message.timestamp) {
        const time = new Date(message.timestamp).toLocaleTimeString();
        const preview = (message.content || '').substring(0, 50);
        timeline.push(`${time} - ${message.role}: ${preview}...`);
      }
    }
    
    return timeline.slice(-10); // Last 10 timeline entries
  }

  // ==================== Context Management ====================
  
  async manageContext(messages, options = {}) {
    const { strategy = 'smart', forceCompression = false } = options;
    
    const analysis = await this.analyzeContext(messages);
    
    if (forceCompression || analysis.isNearFull) {
      return await this.compressContext(messages, strategy);
    }
    
    return { messages, compressed: false, analysis };
  }

  async autoCompress(messages) {
    const analysis = await this.analyzeContext(messages);
    
    if (analysis.usage > 0.9) {
      return await this.compressContext(messages, 'aggressive');
    } else if (analysis.usage > 0.75) {
      return await this.compressContext(messages, 'smart');
    }
    
    return { messages, compressed: false, analysis };
  }

  // ==================== Monitoring ====================
  
  async getContextStats() {
    return {
      maxTokens: this.maxTokens,
      compressionThreshold: this.compressionThreshold,
      compressionRatio: this.compressionRatio,
      compressedSummaries: this.compressedSummaries.length
    };
  }

  async getCompressionHistory() {
    return this.compressedSummaries;
  }

  async clearHistory() {
    this.compressedSummaries = [];
    this.conversationHistory = [];
    return { cleared: true };
  }

  // ==================== Settings ====================
  
  async updateSettings(settings) {
    if (settings.maxTokens) this.maxTokens = settings.maxTokens;
    if (settings.compressionThreshold) this.compressionThreshold = settings.compressionThreshold;
    if (settings.compressionRatio) this.compressionRatio = settings.compressionRatio;
    
    return {
      maxTokens: this.maxTokens,
      compressionThreshold: this.compressionThreshold,
      compressionRatio: this.compressionRatio
    };
  }

  async getSettings() {
    return {
      maxTokens: this.maxTokens,
      compressionThreshold: this.compressionThreshold,
      compressionRatio: this.compressionRatio
    };
  }
}

export default ContextCompressionPlugin;
