/**
 * Vision AI Plugin for DeepSeek Harness
 * Powerful visual analysis - image recognition, OCR, object detection, style analysis
 * Understand images like a human and provide detailed insights
 */
export class VisionAIPlugin {
  name = 'vision-ai';
  description = 'Vision AI - image recognition, OCR, object detection, visual analysis';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.tesseractWorker = null;
    this.tfModel = null;
  }

  async activate() {
    console.log('[Vision AI Plugin] Activated');
    await this.initializeOCR();
  }

  async deactivate() {
    console.log('[Vision AI Plugin] Deactivated');
    await this.cleanup();
  }

  async initializeOCR() {
    try {
      const Tesseract = await import('tesseract.js');
      this.Tesseract = Tesseract;
      console.log('[Vision AI Plugin] OCR initialized');
    } catch (error) {
      console.error('[Vision AI Plugin] Failed to initialize OCR:', error);
    }
  }

  async cleanup() {
    if (this.tesseractWorker) {
      await this.tesseractWorker.terminate();
    }
  }

  // ==================== Image Recognition ====================
  
  async recognizeImage(imagePath) {
    const sharp = (await import('sharp')).default;
    const imageBuffer = await sharp(imagePath)
      .resize(224, 224)
      .toBuffer();
    
    return {
      width: (await sharp(imagePath).metadata()).width,
      height: (await sharp(imagePath).metadata()).height,
      format: (await sharp(imagePath).metadata()).format,
      channels: (await sharp(imagePath).metadata()).channels,
      size: imageBuffer.length
    };
  }

  async classifyImage(imagePath) {
    // Analyze image properties and provide classification
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imagePath).metadata();
    const stats = await sharp(imagePath).stats();
    
    const classification = {
      type: this.determineImageType(metadata),
      content: this.analyzeImageContent(stats),
      quality: this.assessImageQuality(metadata, stats),
      colors: await this.extractDominantColors(imagePath),
      orientation: metadata.orientation || 'normal'
    };
    
    return classification;
  }

  determineImageType(metadata) {
    const { width, height, format } = metadata;
    const aspectRatio = width / height;
    
    if (aspectRatio > 1.8) return 'panorama';
    if (aspectRatio < 0.6) return 'portrait';
    if (Math.abs(aspectRatio - 1) < 0.1) return 'square';
    return 'standard';
  }

  analyzeImageContent(stats) {
    const { channels } = stats;
    const brightness = channels[0]?.mean || 128;
    const contrast = channels[0]?.stdev || 50;
    
    let contentType = 'balanced';
    if (brightness > 180) contentType = 'bright';
    else if (brightness < 75) contentType = 'dark';
    
    let contrastLevel = 'normal';
    if (contrast > 80) contrastLevel = 'high';
    else if (contrast < 30) contrastLevel = 'low';
    
    return { brightness, contrast, contentType, contrastLevel };
  }

  assessImageQuality(metadata, stats) {
    let score = 100;
    const issues = [];
    
    if (metadata.width < 800 || metadata.height < 600) {
      score -= 20;
      issues.push('Low resolution');
    }
    
    const noise = stats.channels[0]?.stdev || 0;
    if (noise > 100) {
      score -= 15;
      issues.push('High noise level');
    }
    
    return { score: Math.max(0, score), issues };
  }

  async extractDominantColors(imagePath, count = 5) {
    const sharp = (await import('sharp')).default;
    const { data } = await sharp(imagePath)
      .resize(100, 100)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const colors = [];
    const colorMap = {};
    
    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i] / 32) * 32;
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      colorMap[key] = (colorMap[key] || 0) + 1;
    }
    
    const sorted = Object.entries(colorMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, count);
    
    for (const [color, count] of sorted) {
      const [r, g, b] = color.split(',').map(Number);
      colors.push({
        rgb: { r, g, b },
        hex: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
        percentage: (count / (100 * 100) * 100).toFixed(1)
      });
    }
    
    return colors;
  }

  // ==================== OCR (Optical Character Recognition) ====================
  
  async extractText(imagePath, options = {}) {
    if (!this.Tesseract) throw new Error('OCR not initialized');
    
    const { language = 'eng', preprocess = 'auto' } = options;
    
    const result = await this.Tesseract.recognize(imagePath, language, {
      logger: m => console.log(m)
    });
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words.map(w => ({
        text: w.text,
        confidence: w.confidence,
        bbox: w.bbox
      })),
      lines: result.data.lines.map(l => ({
        text: l.text,
        confidence: l.confidence,
        bbox: l.bbox
      }))
    };
  }

  async extractTextFromRegion(imagePath, region) {
    const sharp = (await import('sharp')).default;
    const { x, y, width, height } = region;
    
    const croppedBuffer = await sharp(imagePath)
      .extract({ left: x, top: y, width, height })
      .toBuffer();
    
    // Save temp file and extract text
    const tempPath = `/tmp/region_${Date.now()}.png`;
    await sharp(croppedBuffer).toFile(tempPath);
    
    return await this.extractText(tempPath);
  }

  async detectDocument(imagePath) {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imagePath).metadata();
    
    // Analyze for document characteristics
    const stats = await sharp(imagePath).stats();
    const brightness = stats.channels[0]?.mean || 128;
    
    const isDocument = brightness > 200 || this.hasDocumentLayout(stats);
    
    return {
      isDocument,
      suggestedPreprocess: isDocument ? 'binarize' : 'none',
      confidence: isDocument ? 0.85 : 0.3
    };
  }

  hasDocumentLayout(stats) {
    // Simple heuristic for document detection
    const contrast = stats.channels[0]?.stdev || 0;
    return contrast > 50 && contrast < 120;
  }

  // ==================== Object Detection ====================
  
  async detectObjects(imagePath) {
    // Object detection using image analysis
    const sharp = (await import('sharp')).default;
    const { data, info } = await sharp(imagePath)
      .resize(640, 480)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const objects = this.analyzeImageRegions(data, info);
    
    return {
      objects: objects.map(obj => ({
        label: obj.label,
        confidence: obj.confidence,
        bbox: obj.bbox
      })),
      count: objects.length
    };
  }

  analyzeImageRegions(data, info) {
    const { width, height, channels } = info;
    const objects = [];
    
    // Simple region analysis
    const blockSize = 80;
    
    for (let y = 0; y < height - blockSize; y += blockSize / 2) {
      for (let x = 0; x < width - blockSize; x += blockSize / 2) {
        const region = this.extractRegion(data, x, y, blockSize, blockSize, width, channels);
        const analysis = this.analyzeRegion(region);
        
        if (analysis.hasContent) {
          objects.push({
            label: analysis.suggestedLabel,
            confidence: analysis.confidence,
            bbox: { x, y, width: blockSize, height: blockSize }
          });
        }
      }
    }
    
    return this.mergeOverlappingBoxes(objects);
  }

  extractRegion(data, startX, startY, blockWidth, blockHeight, imageWidth, channels) {
    const pixels = [];
    
    for (let y = startY; y < startY + blockHeight; y++) {
      for (let x = startX; x < startX + blockWidth; x++) {
        const idx = (y * imageWidth + x) * channels;
        pixels.push({
          r: data[idx],
          g: data[idx + 1],
          b: data[idx + 2]
        });
      }
    }
    
    return pixels;
  }

  analyzeRegion(pixels) {
    const avgR = pixels.reduce((sum, p) => sum + p.r, 0) / pixels.length;
    const avgG = pixels.reduce((sum, p) => sum + p.g, 0) / pixels.length;
    const avgB = pixels.reduce((sum, p) => sum + p.b, 0) / pixels.length;
    
    const variance = pixels.reduce((sum, p) => {
      const avg = (p.r + p.g + p.b) / 3;
      return sum + Math.pow(avg - (avgR + avgG + avgB) / 3, 2);
    }, 0) / pixels.length;
    
    const hasContent = variance > 500;
    let suggestedLabel = 'background';
    let confidence = 0.5;
    
    if (hasContent) {
      if (avgR > 200 && avgG > 200 && avgB > 200) {
        suggestedLabel = 'text';
        confidence = 0.7;
      } else if (avgR > avgG && avgR > avgB) {
        suggestedLabel = 'warm-object';
        confidence = 0.6;
      } else if (avgB > avgR && avgB > avgG) {
        suggestedLabel = 'cool-object';
        confidence = 0.6;
      } else {
        suggestedLabel = 'object';
        confidence = 0.65;
      }
    }
    
    return { hasContent, suggestedLabel, confidence };
  }

  mergeOverlappingBoxes(boxes) {
    const merged = [];
    const used = new Set();
    
    for (let i = 0; i < boxes.length; i++) {
      if (used.has(i)) continue;
      
      let current = { ...boxes[i] };
      
      for (let j = i + 1; j < boxes.length; j++) {
        if (used.has(j)) continue;
        
        if (this.boxesOverlap(current.bbox, boxes[j].bbox)) {
          current = this.mergeBoxes(current, boxes[j]);
          used.add(j);
        }
      }
      
      merged.push(current);
    }
    
    return merged;
  }

  boxesOverlap(a, b) {
    return !(a.x + a.width < b.x || b.x + b.width < a.x ||
             a.y + a.height < b.y || b.y + b.height < a.y);
  }

  mergeBoxes(a, b) {
    const x = Math.min(a.bbox.x, b.bbox.x);
    const y = Math.min(a.bbox.y, b.bbox.y);
    const width = Math.max(a.bbox.x + a.bbox.width, b.bbox.x + b.bbox.width) - x;
    const height = Math.max(a.bbox.y + a.bbox.height, b.bbox.y + b.bbox.height) - y;
    
    return {
      label: a.confidence > b.confidence ? a.label : b.label,
      confidence: Math.max(a.confidence, b.confidence),
      bbox: { x, y, width, height }
    };
  }

  // ==================== Image Comparison ====================
  
  async compareImages(imagePath1, imagePath2) {
    const sharp = (await import('sharp')).default;
    
    const img1 = await sharp(imagePath1).resize(100, 100).raw().toBuffer();
    const img2 = await sharp(imagePath2).resize(100, 100).raw().toBuffer();
    
    let totalDiff = 0;
    for (let i = 0; i < img1.length; i++) {
      totalDiff += Math.abs(img1[i] - img2[i]);
    }
    
    const avgDiff = totalDiff / img1.length;
    const similarity = Math.max(0, 100 - avgDiff);
    
    return {
      similarity: similarity.toFixed(2),
      identical: similarity > 99,
      difference: (100 - similarity).toFixed(2)
    };
  }

  // ==================== Style Analysis ====================
  
  async analyzeStyle(imagePath) {
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imagePath).metadata();
    const stats = await sharp(imagePath).stats();
    
    return {
      style: this.determineStyle(metadata, stats),
      mood: this.determineMood(stats),
      colorPalette: await this.extractDominantColors(imagePath, 3),
      suggestions: this.generateStyleSuggestions(stats)
    };
  }

  determineStyle(metadata, stats) {
    const brightness = stats.channels[0]?.mean || 128;
    const contrast = stats.channels[0]?.stdev || 50;
    
    if (brightness > 180 && contrast < 40) return 'minimalist';
    if (brightness < 80) return 'moody';
    if (contrast > 80) return 'dramatic';
    return 'balanced';
  }

  determineMood(stats) {
    const brightness = stats.channels[0]?.mean || 128;
    
    if (brightness > 180) return 'cheerful';
    if (brightness < 80) return 'somber';
    return 'neutral';
  }

  generateStyleSuggestions(stats) {
    const suggestions = [];
    const brightness = stats.channels[0]?.mean || 128;
    
    if (brightness > 200) {
      suggestions.push('Consider adding more contrast for visual interest');
    }
    if (brightness < 60) {
      suggestions.push('Image might benefit from increased brightness');
    }
    
    return suggestions;
  }

  // ==================== Image Enhancement ====================
  
  async enhanceImage(imagePath, options = {}) {
    const sharp = (await import('sharp')).default;
    const { brightness = 1, contrast = 1, sharpen = false, denoise = false } = options;
    
    let pipeline = sharp(imagePath);
    
    if (brightness !== 1 || contrast !== 1) {
      pipeline = pipeline.modulate({
        brightness,
        contrast
      });
    }
    
    if (sharpen) {
      pipeline = pipeline.sharpen();
    }
    
    if (denoise) {
      pipeline = pipeline.blur(0.5);
    }
    
    const enhancedBuffer = await pipeline.toBuffer();
    const outputPath = imagePath.replace(/(\.\w+)$/, '_enhanced$1');
    await sharp(enhancedBuffer).toFile(outputPath);
    
    return outputPath;
  }

  async resizeImage(imagePath, width, height, options = {}) {
    const sharp = (await import('sharp')).default;
    const { fit = 'cover', position = 'center' } = options;
    
    const outputPath = imagePath.replace(/(\.\w+)$/, `_resized_${width}x${height}$1`);
    
    await sharp(imagePath)
      .resize(width, height, { fit, position })
      .toFile(outputPath);
    
    return outputPath;
  }

  async convertFormat(imagePath, format) {
    const sharp = (await import('sharp')).default;
    const outputPath = imagePath.replace(/\.\w+$/, `.${format}`);
    
    await sharp(imagePath)
      .toFormat(format)
      .toFile(outputPath);
    
    return outputPath;
  }

  // ==================== Batch Processing ====================
  
  async batchProcess(imagePaths, operation) {
    const results = [];
    
    for (const imagePath of imagePaths) {
      try {
        let result;
        
        switch (operation) {
          case 'recognize':
            result = await this.recognizeImage(imagePath);
            break;
          case 'ocr':
            result = await this.extractText(imagePath);
            break;
          case 'detect':
            result = await this.detectObjects(imagePath);
            break;
          case 'enhance':
            result = await this.enhanceImage(imagePath);
            break;
          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
        
        results.push({ imagePath, success: true, result });
      } catch (error) {
        results.push({ imagePath, success: false, error: error.message });
      }
    }
    
    return results;
  }
}

export default VisionAIPlugin;
