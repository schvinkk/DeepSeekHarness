/**
 * Build Web Apps Plugin for DeepSeek Harness
 * Generate web applications with one sentence
 * Landing pages, admin dashboards, internal tools, SaaS MVPs
 */
export class BuildWebAppsPlugin {
  name = 'build-web-apps';
  description = 'Generate web applications - landing pages, dashboards, internal tools, SaaS MVPs';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.templates = {
      'landing-page': this.getLandingPageTemplate(),
      'admin-dashboard': this.getAdminDashboardTemplate(),
      'internal-tool': this.getInternalToolTemplate(),
      'saas-mvp': this.getSaaSMVPTemplate(),
      'portfolio': this.getPortfolioTemplate(),
      'blog': this.getBlogTemplate()
    };
  }

  async activate() {
    console.log('[Build Web Apps Plugin] Activated');
  }

  async deactivate() {
    console.log('[Build Web Apps Plugin] Deactivated');
  }

  async generateApp(type, options = {}) {
    if (!this.templates[type]) {
      throw new Error(`Template ${type} not found. Available: ${Object.keys(this.templates).join(', ')}`);
    }
    
    const template = this.templates[type];
    const app = this.customizeTemplate(template, options);
    return app;
  }

  async generateFromDescription(description) {
    // Parse description to determine app type
    const lowerDesc = description.toLowerCase();
    let type = 'landing-page';
    
    if (lowerDesc.includes('dashboard') || lowerDesc.includes('admin')) {
      type = 'admin-dashboard';
    } else if (lowerDesc.includes('tool') || lowerDesc.includes('internal')) {
      type = 'internal-tool';
    } else if (lowerDesc.includes('saas') || lowerDesc.includes('mvp')) {
      type = 'saas-mvp';
    } else if (lowerDesc.includes('portfolio') || lowerDesc.includes('personal')) {
      type = 'portfolio';
    } else if (lowerDesc.includes('blog') || lowerDesc.includes('content')) {
      type = 'blog';
    }
    
    return await this.generateApp(type, { description });
  }

  customizeTemplate(template, options) {
    return {
      ...template,
      name: options.name || template.name,
      description: options.description || template.description,
      components: this.generateComponents(template.type, options),
      styles: this.generateStyles(template.type, options)
    };
  }

  generateComponents(type, options) {
    // Generate React components based on template type
    return [
      { name: 'Header', file: 'Header.tsx', content: this.getHeaderComponent(options) },
      { name: 'Main', file: 'Main.tsx', content: this.getMainComponent(type, options) },
      { name: 'Footer', file: 'Footer.tsx', content: this.getFooterComponent(options) }
    ];
  }

  generateStyles(type, options) {
    return {
      theme: options.theme || 'light',
      primaryColor: options.primaryColor || '#0070f3',
      fontFamily: options.fontFamily || 'Inter, sans-serif'
    };
  }

  getHeaderComponent(options) {
    return `import React from 'react';

export default function Header() {
  return (
    <header className="header">
      <nav>
        <div className="logo">${options.name || 'My App'}</div>
        <ul className="nav-links">
          <li><a href="#features">Features</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="#contact">Contact</a></li>
        </ul>
      </nav>
    </header>
  );
}`;
  }

  getMainComponent(type, options) {
    return `import React from 'react';

export default function Main() {
  return (
    <main className="main">
      <section className="hero">
        <h1>${options.name || 'Welcome'}</h1>
        <p>${options.description || 'Your amazing description here'}</p>
        <button className="cta-button">Get Started</button>
      </section>
      <section className="features">
        <h2>Features</h2>
        <div className="feature-grid">
          <div className="feature-card">
            <h3>Feature 1</h3>
            <p>Description of feature 1</p>
          </div>
          <div className="feature-card">
            <h3>Feature 2</h3>
            <p>Description of feature 2</p>
          </div>
          <div className="feature-card">
            <h3>Feature 3</h3>
            <p>Description of feature 3</p>
          </div>
        </div>
      </section>
    </main>
  );
}`;
  }

  getFooterComponent(options) {
    return `import React from 'react';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-content">
        <p>&copy; ${new Date().getFullYear()} ${options.name || 'My App'}. All rights reserved.</p>
      </div>
    </footer>
  );
}`;
  }

  getLandingPageTemplate() {
    return {
      name: 'Landing Page',
      type: 'landing-page',
      description: 'A modern landing page template',
      framework: 'next',
      features: ['responsive', 'seo-optimized', 'fast-loading']
    };
  }

  getAdminDashboardTemplate() {
    return {
      name: 'Admin Dashboard',
      type: 'admin-dashboard',
      description: 'A comprehensive admin dashboard',
      framework: 'react',
      features: ['charts', 'tables', 'forms', 'authentication']
    };
  }

  getInternalToolTemplate() {
    return {
      name: 'Internal Tool',
      type: 'internal-tool',
      description: 'An internal tool for your team',
      framework: 'react',
      features: ['data-management', 'workflow-automation', 'reporting']
    };
  }

  getSaaSMVPTemplate() {
    return {
      name: 'SaaS MVP',
      type: 'saas-mvp',
      description: 'A complete SaaS minimum viable product',
      framework: 'next',
      features: ['authentication', 'billing', 'api', 'dashboard']
    };
  }

  getPortfolioTemplate() {
    return {
      name: 'Portfolio',
      type: 'portfolio',
      description: 'A personal portfolio website',
      framework: 'next',
      features: ['projects-showcase', 'blog', 'contact-form']
    };
  }

  getBlogTemplate() {
    return {
      name: 'Blog',
      type: 'blog',
      description: 'A modern blog platform',
      framework: 'next',
      features: ['markdown-support', 'categories', 'search', 'rss']
    };
  }
}

export default BuildWebAppsPlugin;
