/**
 * GhostUser
 * A virtual user that can interact with the UI just like a human
 * Dispatches synthetic React events, respects Action Authority constraints
 *
 * The key insight: This agent experiences the SAME constraints as a human.
 * If AA requires 400ms hold, the agent must hold for 400ms.
 * If the agent releases early, AA blocks the action (just like a human).
 *
 * This proves the safety is real, not a trick.
 */

interface GhostUserConfig {
  demoMode?: boolean;
  verboseLogging?: boolean;
}

interface MouseEventOptions {
  bubbles?: boolean;
  cancelable?: boolean;
  button?: number;
}

type EventName = 'GHOST_CURSOR_MOVE' | 'GHOST_CURSOR_CLICK' | 'GHOST_CURSOR_HOLD';

export class GhostUser {
  private static instance: GhostUser;
  private config: GhostUserConfig;
  private currentX: number = 0;
  private currentY: number = 0;
  private isMoving: boolean = false;
  private isHolding: boolean = false;

  private constructor(config: GhostUserConfig = {}) {
    this.config = {
      demoMode: true,
      verboseLogging: false,
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: GhostUserConfig): GhostUser {
    if (!GhostUser.instance) {
      GhostUser.instance = new GhostUser(config);
    }
    return GhostUser.instance;
  }

  /**
   * Log a message if verbose logging is enabled
   */
  private log(message: string, data?: any) {
    if (this.config.verboseLogging) {
      console.log(`[GhostUser] ${message}`, data || '');
    }
  }

  /**
   * Emit a custom event to notify listeners (VirtualCursor, etc)
   */
  private emitCursorEvent(eventName: EventName, detail: any) {
    const event = new CustomEvent(eventName, { detail });
    window.dispatchEvent(event);
  }

  /**
   * Smoothly move cursor to target coordinates
   * Duration in ms (default: 300ms for natural movement)
   */
  async moveCursorTo(
    targetX: number,
    targetY: number,
    duration: number = 300
  ): Promise<void> {
    this.log(`Moving cursor to (${targetX}, ${targetY})`, { duration });

    return new Promise((resolve) => {
      this.isMoving = true;
      const startX = this.currentX;
      const startY = this.currentY;
      const startTime = Date.now();

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Easing function: cubic-bezier(0.25, 1, 0.5, 1) - natural movement
        const easeProgress =
          progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        this.currentX = startX + (targetX - startX) * easeProgress;
        this.currentY = startY + (targetY - startY) * easeProgress;

        this.emitCursorEvent('GHOST_CURSOR_MOVE', {
          x: this.currentX,
          y: this.currentY,
        });

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          this.isMoving = false;
          resolve();
        }
      };

      animate();
    });
  }

  /**
   * Find element on page and move cursor to it
   */
  async moveToElement(selector: string, offset?: { x?: number; y?: number }): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2 + (offset?.x || 0);
    const targetY = rect.top + rect.height / 2 + (offset?.y || 0);

    this.log(`Moving to element ${selector}`);
    await this.moveCursorTo(targetX, targetY);
  }

  /**
   * Click at current cursor position
   */
  async click(duration: number = 100): Promise<void> {
    this.log(`Clicking at (${this.currentX}, ${this.currentY})`);

    const element = document.elementFromPoint(this.currentX, this.currentY);
    if (!element) {
      throw new Error(`No element at cursor position (${this.currentX}, ${this.currentY})`);
    }

    // Show click feedback
    this.emitCursorEvent('GHOST_CURSOR_CLICK', { down: true });

    // Dispatch mouse down
    this.dispatchMouseEvent(element, 'mousedown', { button: 0 });

    // Wait for click duration
    await this.wait(duration);

    // Dispatch mouse up
    this.dispatchMouseEvent(element, 'mouseup', { button: 0 });

    // Dispatch click
    this.dispatchMouseEvent(element, 'click', { button: 0 });

    // Hide click feedback
    this.emitCursorEvent('GHOST_CURSOR_CLICK', { down: false });

    this.log(`Click completed`);
  }

  /**
   * Hold button for specified duration
   * This demonstrates that the agent respects AA constraints
   * If AA requires 400ms hold, the agent must hold for 400ms
   * If the agent releases early, AA blocks the action
   */
  async holdButton(selector: string, duration: number = 400): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Button not found: ${selector}`);
    }

    this.log(`Holding button ${selector} for ${duration}ms`);

    await this.moveToElement(selector);

    this.isHolding = true;

    // Dispatch mouse down
    this.dispatchMouseEvent(element as Element, 'mousedown', { button: 0 });

    // Show hold feedback with progress
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);

      this.emitCursorEvent('GHOST_CURSOR_HOLD', {
        active: true,
        progress,
      });
    }, 16); // Update every ~16ms (60fps)

    // Wait for hold duration
    await this.wait(duration);

    clearInterval(progressInterval);

    // Dispatch mouse up
    this.dispatchMouseEvent(element as Element, 'mouseup', { button: 0 });

    // Hide hold feedback
    this.emitCursorEvent('GHOST_CURSOR_HOLD', {
      active: false,
      progress: 0,
    });

    this.isHolding = false;
    this.log(`Hold completed`);
  }

  /**
   * Type text into a focused input element
   */
  async type(text: string, delayPerChar: number = 50): Promise<void> {
    const activeElement = document.activeElement as HTMLInputElement;
    if (!activeElement) {
      throw new Error('No active input element to type into');
    }

    this.log(`Typing: "${text}"`, { delayPerChar });

    for (const char of text) {
      activeElement.value += char;

      // Trigger input event for React binding
      const inputEvent = new Event('input', { bubbles: true });
      activeElement.dispatchEvent(inputEvent);

      // Trigger change event
      const changeEvent = new Event('change', { bubbles: true });
      activeElement.dispatchEvent(changeEvent);

      await this.wait(delayPerChar);
    }

    this.log(`Typing completed`);
  }

  /**
   * Scroll element into view and wait
   */
  async scrollToElement(selector: string): Promise<void> {
    const element = document.querySelector(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    this.log(`Scrolling to element: ${selector}`);
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Wait for scroll to complete
    await this.wait(500);
  }

  /**
   * Wait for element to appear in DOM
   */
  async waitForElement(selector: string, timeout: number = 5000): Promise<Element> {
    this.log(`Waiting for element: ${selector}`, { timeout });

    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) {
          observer.disconnect();
          resolve(found);
        }
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    });
  }

  /**
   * Simple wait
   */
  async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Dispatch synthetic mouse event
   */
  private dispatchMouseEvent(
    element: Element,
    eventType: string,
    options: MouseEventOptions = {}
  ): void {
    const event = new MouseEvent(eventType, {
      bubbles: options.bubbles ?? true,
      cancelable: options.cancelable ?? true,
      view: window,
      button: options.button ?? 0,
    });

    element.dispatchEvent(event);
  }

  /**
   * Get current cursor position
   */
  getCurrentPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }

  /**
   * Check if currently moving or holding
   */
  isBusy(): boolean {
    return this.isMoving || this.isHolding;
  }
}

/**
 * Export singleton accessor
 */
export const getGhostUser = (config?: GhostUserConfig) => GhostUser.getInstance(config);
