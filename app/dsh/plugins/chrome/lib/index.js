/**
 * Chrome Browser Control Plugin for DeepSeek Harness
 * Allows AI to directly control Chrome browser - open pages, search, fill forms, test websites
 */
export class ChromePlugin {
  name = 'chrome';
  description = 'Chrome browser control - open pages, search, fill forms, test websites';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.browser = null;
    this.page = null;
  }

  async activate() {
    console.log('[Chrome Plugin] Activated');
    await this.launchBrowser();
  }

  async deactivate() {
    console.log('[Chrome Plugin] Deactivated');
    await this.closeBrowser();
  }

  async launchBrowser() {
    try {
      const puppeteer = await import('puppeteer-core');
      const chromeLauncher = await import('chrome-launcher');
      
      // Launch Chrome with remote debugging
      const chrome = await chromeLauncher.launch({
        chromeFlags: ['--no-sandbox', '--disable-setuid-sandbox'],
        logLevel: 'info'
      });
      
      this.browser = await puppeteer.default.connect({
        browserURL: `http://127.0.0.1:${chrome.port}`
      });
      
      this.page = await this.browser.newPage();
      console.log(`[Chrome Plugin] Browser launched on port ${chrome.port}`);
    } catch (error) {
      console.error('[Chrome Plugin] Failed to launch browser:', error);
      throw error;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  async navigateTo(url) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(url, { waitUntil: 'networkidle2' });
    return await this.page.title();
  }

  async search(query) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
    return await this.page.title();
  }

  async fillForm(selector, value) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.type(selector, value);
  }

  async clickElement(selector) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.click(selector);
  }

  async getPageContent() {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.content();
  }

  async screenshot(path) {
    if (!this.page) throw new Error('Browser not initialized');
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  async evaluateInPage(code) {
    if (!this.page) throw new Error('Browser not initialized');
    return await this.page.evaluate(code);
  }
}

export default ChromePlugin;
