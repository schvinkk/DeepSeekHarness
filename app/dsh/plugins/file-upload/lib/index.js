/**
 * File Upload Handler Plugin for DeepSeek Harness
 * Upload images, documents, any file type in chat
 * Supports drag-and-drop, clipboard paste, and file selection
 */
export class FileUploadPlugin {
  name = 'file-upload';
  description = 'File upload - upload images, documents, any file in chat';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.uploadDir = ctx?.config?.uploadDir || '%TEMP%/dsh-uploads';
    this.maxSize = ctx?.config?.maxUploadSize || 100 * 1024 * 1024; // 100MB
    this.allowedTypes = [
      // Images
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
      // Documents
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv', 'text/markdown', 'text/html',
      // Code
      'application/javascript', 'application/json', 'application/xml', 'text/typescript', 'text/python',
      // Archives
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
      // Media
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm',
      // Other
      'application/octet-stream'
    ];
  }

  async activate() {
    console.log('[File Upload Plugin] Activated');
    await this.ensureUploadDir();
  }

  async deactivate() {
    console.log('[File Upload Plugin] Deactivated');
  }

  async ensureUploadDir() {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const uploadDir = this.uploadDir.replace('%TEMP%', os.tmpdir());
    
    try {
      await fs.access(uploadDir);
    } catch {
      await fs.mkdir(uploadDir, { recursive: true });
    }
    
    this.uploadDir = uploadDir;
  }

  async uploadFile(file, options = {}) {
    const { originalname, buffer, mimetype, size } = file;
    
    // Validate file type
    if (!this.isAllowedType(mimetype)) {
      throw new Error(`File type ${mimetype} is not allowed`);
    }
    
    // Validate file size
    if (size > this.maxSize) {
      throw new Error(`File size ${size} exceeds maximum ${this.maxSize}`);
    }
    
    // Generate unique filename
    const filename = this.generateFilename(originalname);
    const filePath = `${this.uploadDir}/${filename}`;
    
    // Save file
    const fs = await import('fs/promises');
    await fs.writeFile(filePath, buffer);
    
    // Analyze file
    const analysis = await this.analyzeFile(filePath, mimetype);
    
    return {
      id: filename,
      originalName: originalname,
      filename,
      path: filePath,
      size,
      mimetype,
      analysis
    };
  }

  isAllowedType(mimetype) {
    return this.allowedTypes.includes(mimetype) || mimetype.startsWith('image/') || mimetype.startsWith('text/');
  }

  generateFilename(originalname) {
    const ext = originalname.split('.').pop();
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}.${ext}`;
  }

  async analyzeFile(filePath, mimetype) {
    const analysis = {
      type: this.getFileType(mimetype),
      preview: null,
      metadata: null
    };
    
    if (mimetype.startsWith('image/')) {
      analysis.preview = await this.generateImagePreview(filePath);
      analysis.metadata = await this.getImageMetadata(filePath);
    } else if (mimetype === 'application/pdf') {
      analysis.preview = await this.generatePDFPreview(filePath);
      analysis.metadata = await this.getPDFMetadata(filePath);
    } else if (mimetype.startsWith('text/')) {
      analysis.preview = await this.getTextPreview(filePath);
      analysis.metadata = await this.getTextMetadata(filePath);
    }
    
    return analysis;
  }

  getFileType(mimetype) {
    if (mimetype.startsWith('image/')) return 'image';
    if (mimetype.startsWith('audio/')) return 'audio';
    if (mimetype.startsWith('video/')) return 'video';
    if (mimetype === 'application/pdf') return 'pdf';
    if (mimetype.includes('word') || mimetype.includes('document')) return 'document';
    if (mimetype.includes('sheet') || mimetype.includes('excel')) return 'spreadsheet';
    if (mimetype.includes('presentation') || mimetype.includes('powerpoint')) return 'presentation';
    if (mimetype.startsWith('text/')) return 'text';
    if (mimetype.includes('zip') || mimetype.includes('rar') || mimetype.includes('7z')) return 'archive';
    return 'other';
  }

  async generateImagePreview(filePath) {
    const sharp = (await import('sharp')).default;
    
    const preview = await sharp(filePath)
      .resize(200, 200, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();
    
    return `data:image/jpeg;base64,${preview.toString('base64')}`;
  }

  async getImageMetadata(filePath) {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(filePath).metadata();
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      channels: metadata.channels,
      density: metadata.density,
      hasAlpha: metadata.hasAlpha
    };
  }

  async generatePDFPreview(filePath) {
    // PDF preview generation
    return 'PDF preview not available';
  }

  async getPDFMetadata(filePath) {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime
    };
  }

  async getTextPreview(filePath) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    return content.substring(0, 500) + (content.length > 500 ? '...' : '');
  }

  async getTextMetadata(filePath) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    
    return {
      lines: lines.length,
      words: content.split(/\s+/).length,
      characters: content.length,
      encoding: 'utf-8'
    };
  }

  async processUploadedFile(fileInfo) {
    const { path: filePath, mimetype, analysis } = fileInfo;
    
    const result = {
      fileInfo,
      content: null,
      description: null
    };
    
    switch (analysis.type) {
      case 'image':
        result.content = await this.processImage(filePath);
        result.description = this.generateImageDescription(analysis.metadata);
        break;
      case 'text':
        result.content = await this.processText(filePath);
        result.description = `Text file with ${analysis.metadata.lines} lines`;
        break;
      case 'pdf':
        result.content = await this.processPDF(filePath);
        result.description = 'PDF document';
        break;
      case 'document':
        result.content = await this.processDocument(filePath);
        result.description = 'Word document';
        break;
      case 'spreadsheet':
        result.content = await this.processSpreadsheet(filePath);
        result.description = 'Excel spreadsheet';
        break;
      default:
        result.description = `File: ${fileInfo.originalName}`;
    }
    
    return result;
  }

  async processImage(filePath) {
    const VisionAI = (await import('../../vision-ai/lib/index.js')).default;
    const vision = new VisionAI();
    
    const recognition = await vision.recognizeImage(filePath);
    const colors = await vision.extractDominantColors(filePath, 3);
    
    return {
      type: 'image',
      recognition,
      colors
    };
  }

  async processText(filePath) {
    const fs = await import('fs/promises');
    const content = await fs.readFile(filePath, 'utf-8');
    
    return {
      type: 'text',
      content,
      wordCount: content.split(/\s+/).length,
      lineCount: content.split('\n').length
    };
  }

  async processPDF(filePath) {
    return {
      type: 'pdf',
      message: 'PDF processing available with pdf-lib'
    };
  }

  async processDocument(filePath) {
    return {
      type: 'document',
      message: 'Document processing available with docx'
    };
  }

  async processSpreadsheet(filePath) {
    return {
      type: 'spreadsheet',
      message: 'Spreadsheet processing available with xlsx'
    };
  }

  generateImageDescription(metadata) {
    if (!metadata) return 'Image uploaded';
    return `Image: ${metadata.width}x${metadata.height} ${metadata.format}`;
  }

  async getUploadHistory() {
    const fs = await import('fs/promises');
    
    try {
      const files = await fs.readdir(this.uploadDir);
      return files.map(f => ({
        filename: f,
        path: `${this.uploadDir}/${f}`
      }));
    } catch {
      return [];
    }
  }

  async deleteFile(filename) {
    const fs = await import('fs/promises');
    const filePath = `${this.uploadDir}/${filename}`;
    
    try {
      await fs.unlink(filePath);
      return { deleted: true, filename };
    } catch (error) {
      return { deleted: false, error: error.message };
    }
  }

  async clearAll() {
    const fs = await import('fs/promises');
    
    try {
      const files = await fs.readdir(this.uploadDir);
      for (const file of files) {
        await fs.unlink(`${this.uploadDir}/${file}`);
      }
      return { cleared: true, count: files.length };
    } catch (error) {
      return { cleared: false, error: error.message };
    }
  }

  // ==================== Clipboard Support ====================
  
  async handleClipboardPaste(clipboardData) {
    if (clipboardData.items) {
      for (const item of clipboardData.items) {
        if (item.kind === 'file') {
          const file = item.getAsFile();
          return await this.uploadFile({
            originalname: file.name || 'clipboard-paste',
            buffer: Buffer.from(await file.arrayBuffer()),
            mimetype: file.type,
            size: file.size
          });
        }
      }
    }
    
    throw new Error('No file found in clipboard');
  }

  // ==================== Drag & Drop ====================
  
  async handleDragDrop(files) {
    const results = [];
    
    for (const file of files) {
      const result = await this.uploadFile(file);
      results.push(result);
    }
    
    return results;
  }
}

export default FileUploadPlugin;
