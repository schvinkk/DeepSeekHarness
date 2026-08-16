/**
 * Computer Use Plugin for DeepSeek Harness
 * Allows AI to directly operate computer software and windows
 * Equivalent to giving AI "hands" to control the computer
 */
export class ComputerUsePlugin {
  name = 'computer-use';
  description = 'Computer control - operate software, switch windows, execute tasks';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.robot = null;
    this.screenshot = null;
  }

  async activate() {
    console.log('[Computer Use Plugin] Activated');
    await this.initialize();
  }

  async deactivate() {
    console.log('[Computer Use Plugin] Deactivated');
  }

  async initialize() {
    try {
      this.robot = await import('robotjs');
      this.screenshot = await import('node-screenshots');
      console.log('[Computer Use Plugin] Initialized');
    } catch (error) {
      console.error('[Computer Use Plugin] Failed to initialize:', error);
    }
  }

  async mouseMove(x, y) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    this.robot.default.moveMouse(x, y);
    return { x, y };
  }

  async mouseClick(button = 'left') {
    if (!this.robot) throw new Error('Computer Use not initialized');
    this.robot.default.mouseClick(button);
    return { clicked: true, button };
  }

  async typeText(text) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    this.robot.default.typeString(text);
    return { typed: text.length };
  }

  async pressKey(key) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    this.robot.default.keyTap(key);
    return { key };
  }

  async takeScreenshot() {
    if (!this.screenshot) throw new Error('Computer Use not initialized');
    const screen = this.screenshot.default;
    const img = await screen.capture();
    return img;
  }

  async getWindowList() {
    if (!this.robot) throw new Error('Computer Use not initialized');
    const windows = this.robot.default.getWindows();
    return windows;
  }

  async focusWindow(title) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    const window = this.robot.default.getWindows().find(w => 
      w.title.toLowerCase().includes(title.toLowerCase())
    );
    if (window) {
      window.focus();
      return { focused: true, title: window.title };
    }
    return { focused: false };
  }

  async moveWindow(title, x, y) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    const window = this.robot.default.getWindows().find(w => 
      w.title.toLowerCase().includes(title.toLowerCase())
    );
    if (window) {
      window.move(x, y);
      return { moved: true, x, y };
    }
    return { moved: false };
  }

  async resizeWindow(title, width, height) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    const window = this.robot.default.getWindows().find(w => 
      w.title.toLowerCase().includes(title.toLowerCase())
    );
    if (window) {
      window.resize(width, height);
      return { resized: true, width, height };
    }
    return { resized: false };
  }

  async getScreenSize() {
    if (!this.robot) throw new Error('Computer Use not initialized');
    return this.robot.default.getScreenSize();
  }

  async getMousePosition() {
    if (!this.robot) throw new Error('Computer Use not initialized');
    return this.robot.default.getMousePos();
  }

  async getPixelColor(x, y) {
    if (!this.robot) throw new Error('Computer Use not initialized');
    return this.robot.default.getPixelColor(x, y);
  }

  async openApplication(appPath) {
    const { spawn } = await import('child_process');
    return new Promise((resolve, reject) => {
      const child = spawn(appPath, [], { detached: true, stdio: 'ignore' });
      child.unref();
      resolve({ opened: true, pid: child.pid });
    });
  }
}

export default ComputerUsePlugin;
