/**
 * Figma Integration Plugin for DeepSeek Harness
 * Understand Figma designs and generate corresponding code
 * Reduce communication costs between design and development
 */
export class FigmaPlugin {
  name = 'figma';
  description = 'Figma integration - understand designs and generate code';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.apiToken = null;
  }

  async activate() {
    console.log('[Figma Plugin] Activated');
    this.apiToken = process.env.FIGMA_API_TOKEN;
  }

  async deactivate() {
    console.log('[Figma Plugin] Deactivated');
  }

  async getFile(fileKey) {
    if (!this.apiToken) throw new Error('Figma API token not set');
    
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}`, {
      headers: {
        'X-Figma-Token': this.apiToken
      }
    });
    
    return await response.json();
  }

  async getFileNodes(fileKey, nodeIds) {
    if (!this.apiToken) throw new Error('Figma API token not set');
    
    const ids = nodeIds.join(',');
    const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/nodes?ids=${ids}`, {
      headers: {
        'X-Figma-Token': this.apiToken
      }
    });
    
    return await response.json();
  }

  async getImages(fileKey, nodeIds, format = 'png', scale = 2) {
    if (!this.apiToken) throw new Error('Figma API token not set');
    
    const ids = nodeIds.join(',');
    const response = await fetch(
      `https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`,
      {
        headers: {
          'X-Figma-Token': this.apiToken
        }
      }
    );
    
    return await response.json();
  }

  async generateCodeFromDesign(fileKey, nodeId) {
    const { nodes } = await this.getFileNodes(fileKey, [nodeId]);
    const node = nodes[nodeId];
    
    return this.nodeToCode(node);
  }

  nodeToCode(node) {
    const { name, type, absoluteBoundingBox, fills, strokes, effects, children } = node;
    
    let code = '';
    
    switch (type) {
      case 'FRAME':
      case 'GROUP':
        code = this.generateFrameCode(name, absoluteBoundingBox, fills, children);
        break;
      case 'TEXT':
        code = this.generateTextCode(name, node.characters, node.style);
        break;
      case 'RECTANGLE':
      case 'ELLIPSE':
        code = this.generateShapeCode(name, type, absoluteBoundingBox, fills, strokes);
        break;
      default:
        code = `<div className="${this.toClassName(name)}"><!-- ${type} --></div>`;
    }
    
    return code;
  }

  generateFrameCode(name, box, fills, children) {
    const className = this.toClassName(name);
    const width = box ? box.width : '100%';
    const height = box ? box.height : 'auto';
    const backgroundColor = fills && fills[0] ? this.colorToCSS(fills[0].color) : 'transparent';
    
    const childrenCode = children ? children.map(child => this.nodeToCode(child)).join('\n') : '';
    
    return `<div className="${className}" style={{
  width: '${width}px',
  height: '${height}px',
  backgroundColor: '${backgroundColor}'
}}>
${childrenCode}
</div>`;
  }

  generateTextCode(name, text, style) {
    const className = this.toClassName(name);
    const fontSize = style ? style.fontSize : 16;
    const fontFamily = style ? style.fontFamily : 'Arial';
    const fontWeight = style ? style.fontWeight : 'normal';
    
    return `<p className="${className}" style={{
  fontSize: '${fontSize}px',
  fontFamily: '${fontFamily}',
  fontWeight: '${fontWeight}'
}}>
{text}
</p>`;
  }

  generateShapeCode(name, type, box, fills, strokes) {
    const className = this.toClassName(name);
    const width = box ? box.width : 100;
    const height = box ? box.height : 100;
    const backgroundColor = fills && fills[0] ? this.colorToCSS(fills[0].color) : 'transparent';
    const borderRadius = type === 'ELLIPSE' ? '50%' : '0';
    
    return `<div className="${className}" style={{
  width: '${width}px',
  height: '${height}px',
  backgroundColor: '${backgroundColor}',
  borderRadius: '${borderRadius}'
}} />`;
  }

  toClassName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  colorToCSS(color) {
    if (!color) return 'transparent';
    const { r, g, b, a } = color;
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a || 1})`;
  }

  async exportAsCSS(fileKey, nodeId) {
    const { nodes } = await this.getFileNodes(fileKey, [nodeId]);
    const node = nodes[nodeId];
    return this.nodeToCSS(node);
  }

  nodeToCSS(node) {
    const { name, type, absoluteBoundingBox, fills, strokes } = node;
    
    let css = `.${this.toClassName(name)} {\n`;
    
    if (absoluteBoundingBox) {
      css += `  width: ${absoluteBoundingBox.width}px;\n`;
      css += `  height: ${absoluteBoundingBox.height}px;\n`;
    }
    
    if (fills && fills[0]) {
      css += `  background-color: ${this.colorToCSS(fills[0].color)};\n`;
    }
    
    if (strokes && strokes[0]) {
      css += `  border: 1px solid ${this.colorToCSS(strokes[0].color)};\n`;
    }
    
    css += '}\n';
    
    return css;
  }
}

export default FigmaPlugin;
