/**
 * Remotion Plugin for DeepSeek Harness
 * Programmatic video generation through code
 * Batch generate video content with code
 */
export class RemotionPlugin {
  name = 'remotion';
  description = 'Programmatic video generation - batch create videos with code';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.compositions = new Map();
  }

  async activate() {
    console.log('[Remotion Plugin] Activated');
  }

  async deactivate() {
    console.log('[Remotion Plugin] Deactivated');
  }

  // ==================== Composition Management ====================
  
  registerComposition(id, component, options = {}) {
    const composition = {
      id,
      component,
      durationInFrames: options.duration || 300,
      fps: options.fps || 30,
      width: options.width || 1920,
      height: options.height || 1080,
      props: options.props || {}
    };
    
    this.compositions.set(id, composition);
    return composition;
  }

  getComposition(id) {
    return this.compositions.get(id);
  }

  listCompositions() {
    return Array.from(this.compositions.keys());
  }

  // ==================== Video Templates ====================
  
  createTextAnimation(text, options = {}) {
    const { 
      duration = 3,
      fontSize = 72,
      color = '#ffffff',
      backgroundColor = '#000000',
      animationType = 'fade'
    } = options;
    
    const composition = {
      id: `text-${Date.now()}`,
      type: 'text-animation',
      text,
      duration,
      fontSize,
      color,
      backgroundColor,
      animationType,
      props: { text, fontSize, color, backgroundColor, animationType }
    };
    
    return composition;
  }

  createSlideshow(images, options = {}) {
    const {
      transition = 'fade',
      transitionDuration = 0.5,
      imageDuration = 3,
      width = 1920,
      height = 1080
    } = options;
    
    const totalDuration = images.length * (imageDuration + transitionDuration);
    
    const composition = {
      id: `slideshow-${Date.now()}`,
      type: 'slideshow',
      images,
      transition,
      transitionDuration,
      imageDuration,
      width,
      height,
      durationInFrames: Math.ceil(totalDuration * 30),
      props: { images, transition, transitionDuration, imageDuration }
    };
    
    return composition;
  }

  createKineticTypography(text, options = {}) {
    const {
      wordsPerSecond = 3,
      fontSize = 64,
      color = '#ffffff',
      highlightColor = '#ff0000'
    } = options;
    
    const words = text.split(' ');
    const duration = words.length / wordsPerSecond;
    
    const composition = {
      id: `kinetic-${Date.now()}`,
      type: 'kinetic-typography',
      text,
      words,
      duration,
      fontSize,
      color,
      highlightColor,
      props: { words, fontSize, color, highlightColor, wordsPerSecond }
    };
    
    return composition;
  }

  createDataVisualization(data, options = {}) {
    const {
      type = 'bar',
      title = 'Data Visualization',
      duration = 5,
      colors = ['#0070f3', '#7928ca', '#ff0000', '#f5a623']
    } = options;
    
    const composition = {
      id: `data-viz-${Date.now()}`,
      type: 'data-visualization',
      chartType: type,
      data,
      title,
      duration,
      colors,
      props: { data, title, type, colors }
    };
    
    return composition;
  }

  createSocialMediaPost(options = {}) {
    const {
      platform = 'instagram',
      text = '',
      image = null,
      duration = 15,
      style = 'modern'
    } = options;
    
    const dimensions = {
      instagram: { width: 1080, height: 1080 },
      tiktok: { width: 1080, height: 1920 },
      youtube: { width: 1920, height: 1080 },
      twitter: { width: 1280, height: 720 }
    };
    
    const { width, height } = dimensions[platform] || dimensions.instagram;
    
    const composition = {
      id: `social-${platform}-${Date.now()}`,
      type: 'social-media',
      platform,
      text,
      image,
      duration,
      style,
      width,
      height,
      props: { text, image, style, platform }
    };
    
    return composition;
  }

  createProductShowcase(product, options = {}) {
    const {
      features = [],
      duration = 30,
      style = 'professional'
    } = options;
    
    const composition = {
      id: `showcase-${Date.now()}`,
      type: 'product-showcase',
      product,
      features,
      duration,
      style,
      props: { product, features, style }
    };
    
    return composition;
  }

  // ==================== Rendering ====================
  
  async renderComposition(composition, options = {}) {
    const { output = 'output.mp4', codec = 'h264' } = options;
    
    // Generate video code
    const videoCode = this.generateVideoCode(composition);
    
    // Create temporary project
    const projectDir = await this.createTempProject(composition, videoCode);
    
    // Render video
    const outputPath = await this.renderVideo(projectDir, output, codec);
    
    return outputPath;
  }

  generateVideoCode(composition) {
    const { type, props } = composition;
    
    switch (type) {
      case 'text-animation':
        return this.generateTextAnimationCode(props);
      case 'slideshow':
        return this.generateSlideshowCode(props);
      case 'kinetic-typography':
        return this.generateKineticCode(props);
      case 'data-visualization':
        return this.generateDataVizCode(props);
      case 'social-media':
        return this.generateSocialMediaCode(props);
      case 'product-showcase':
        return this.generateShowcaseCode(props);
      default:
        return this.generateDefaultCode(props);
    }
  }

  generateTextAnimationCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const TextAnimation = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const scale = spring({ frame, fps, config: { damping: 10 } });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '${props.backgroundColor}' }}>
      <div style={{
        color: '${props.color}',
        fontSize: ${props.fontSize},
        opacity,
        transform: \`scale(\${scale})\`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%'
      }}>
        ${props.text}
      </div>
    </AbsoluteFill>
  );
};`;
  }

  generateSlideshowCode(props) {
    return `
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';

const images = ${JSON.stringify(props.images)};

export const Slideshow = () => {
  const frame = useCurrentFrame();
  const imageDuration = ${props.imageDuration} * 30;
  
  const currentIndex = Math.floor(frame / imageDuration);
  const currentFrame = frame % imageDuration;
  
  const opacity = interpolate(
    currentFrame,
    [0, 15, imageDuration - 15, imageDuration],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp' }
  );
  
  return (
    <AbsoluteFill>
      {images.map((src, index) => (
        index === currentIndex && (
          <Img
            key={index}
            src={src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity
            }}
          />
        )
      ))}
    </AbsoluteFill>
  );
};`;
  }

  generateKineticCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

const words = ${JSON.stringify(props.words)};

export const KineticTypography = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const wordsPerFrame = ${props.wordsPerSecond} / fps;
  const currentWordIndex = Math.floor(frame * wordsPerFrame);
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        {words.map((word, index) => {
          const isActive = index === currentWordIndex;
          const opacity = interpolate(
            frame,
            [index * fps / ${props.wordsPerSecond}, (index + 1) * fps / ${props.wordsPerSecond}],
            [0.3, 1],
            { extrapolateRight: 'clamp' }
          );
          
          return (
            <span key={index} style={{
              fontSize: ${props.fontSize},
              color: isActive ? '${props.highlightColor}' : '${props.color}',
              opacity,
              margin: '0 10px'
            }}>
              {word}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};`;
  }

  generateDataVizCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

const data = ${JSON.stringify(props.data)};

export const DataVisualization = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a2e', padding: 50 }}>
      <h1 style={{ color: 'white', textAlign: 'center' }}>${props.title}</h1>
      <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end', height: '70%' }}>
        {data.map((item, index) => {
          const height = interpolate(frame, [0, 60], [0, (item.value / maxValue) * 100], { extrapolateRight: 'clamp' });
          
          return (
            <div key={index} style={{ textAlign: 'center' }}>
              <div style={{
                width: 80,
                height: \`\${height}%\`,
                backgroundColor: '${props.colors[index % props.colors.length]}',
                borderRadius: '8px 8px 0 0'
              }} />
              <p style={{ color: 'white', marginTop: 10 }}>{item.label}</p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};`;
  }

  generateSocialMediaCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const SocialMediaPost = () => {
  const frame = useCurrentFrame();
  
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const translateY = interpolate(frame, [0, 30], [50, 0], { extrapolateRight: 'clamp' });
  
  return (
    <AbsoluteFill style={{
      backgroundColor: '#000',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        opacity,
        transform: \`translateY(\${translateY}px)\`,
        textAlign: 'center',
        padding: 40
      }}>
        <h1 style={{ color: 'white', fontSize: 48 }}>${props.text || 'Your Content Here'}</h1>
        <p style={{ color: '#888', fontSize: 24 }}>Created with DeepSeek Harness</p>
      </div>
    </AbsoluteFill>
  );
};`;
  }

  generateShowcaseCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, interpolate, spring } from 'remotion';

const product = ${JSON.stringify(props.product)};
const features = ${JSON.stringify(props.features)};

export const ProductShowcase = () => {
  const frame = useCurrentFrame();
  
  const titleOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  const featureDelay = (index) => interpolate(frame, [60 + index * 30, 90 + index * 30], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#0f0f23', padding: 60 }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <h1 style={{ color: 'white', fontSize: 64, opacity: titleOpacity }}>{product.name}</h1>
        <p style={{ color: '#888', fontSize: 24, opacity: titleOpacity }}>{product.description}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-around' }}>
        {features.map((feature, index) => (
          <div key={index} style={{
            opacity: featureDelay(index),
            textAlign: 'center',
            padding: 20
          }}>
            <div style={{ fontSize: 48 }}>✨</div>
            <h3 style={{ color: 'white' }}>{feature.title}</h3>
            <p style={{ color: '#888' }}>{feature.description}</p>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};`;
  }

  generateDefaultCode(props) {
    return `
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';

export const DefaultVideo = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
  
  return (
    <AbsoluteFill style={{ backgroundColor: '#000', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <h1 style={{ color: 'white', opacity }}>Video Generated by DeepSeek Harness</h1>
    </AbsoluteFill>
  );
};`;
  }

  async createTempProject(composition, videoCode) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const projectDir = path.join(os.tmpdir(), `remotion-${Date.now()}`);
    await fs.mkdir(projectDir, { recursive: true });
    
    // Create package.json
    await fs.writeFile(path.join(projectDir, 'package.json'), JSON.stringify({
      name: composition.id,
      version: '1.0.0',
      scripts: {
        start: 'remotion studio',
        render: 'remotion render'
      },
      dependencies: {
        remotion: '^4.0.0',
        '@remotion/cli': '^4.0.0'
      }
    }));
    
    // Create video component
    await fs.writeFile(path.join(projectDir, 'Video.jsx'), videoCode);
    
    // Create index
    await fs.writeFile(path.join(projectDir, 'index.js'), `
import { registerRoot } from 'remotion';
import { Video } from './Video';
registerRoot(Video);
`);
    
    return projectDir;
  }

  async renderVideo(projectDir, output, codec) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    const outputPath = `${projectDir}/${output}`;
    
    try {
      await execAsync(`cd ${projectDir} && npx remotion render index.js --codec ${codec} ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('[Remotion Plugin] Render failed:', error);
      throw error;
    }
  }
}

export default RemotionPlugin;
