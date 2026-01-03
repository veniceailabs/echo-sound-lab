/**
 * DemoDirector
 * Orchestrates the virtual user to execute a demo script
 * Handles action sequencing, error handling, and state management
 *
 * The Key Innovation:
 * The demo is not pre-recorded. It's a real execution.
 * Each demo run is slightly different based on actual UI state.
 * The agent respects AA constraints (400ms hold, etc).
 * This proves the safety is real.
 */

import { GhostUser, getGhostUser } from './GhostUser';
import { DemoScript, DemoAction, DemoScriptConfig } from './DemoScript';

export interface DemoDirectorConfig {
  verbose?: boolean;
  pauseBetweenActions?: number;
  onProgress?: (progress: { current: number; total: number; action: string }) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export type DemoStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error';

export class DemoDirector {
  private static instance: DemoDirector;
  private config: DemoDirectorConfig;
  private ghostUser: GhostUser;
  private currentScript: DemoScript | null = null;
  private currentAction: number = 0;
  private status: DemoStatus = 'idle';
  private startTime: number = 0;

  private constructor(config: DemoDirectorConfig = {}) {
    this.config = {
      verbose: false,
      pauseBetweenActions: 200,
      ...config,
    };
    this.ghostUser = getGhostUser({ verboseLogging: config.verbose });
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: DemoDirectorConfig): DemoDirector {
    if (!DemoDirector.instance) {
      DemoDirector.instance = new DemoDirector(config);
    }
    return DemoDirector.instance;
  }

  /**
   * Execute demo from prompt
   */
  async executeFromPrompt(prompt: string): Promise<void> {
    const script = DemoScript.fromPrompt(prompt);
    return this.executeScript(script);
  }

  /**
   * Execute demo from config
   */
  async executeFromConfig(config: DemoScriptConfig): Promise<void> {
    const script = new DemoScript(config);
    return this.executeScript(script);
  }

  /**
   * Execute a demo script
   */
  async executeScript(script: DemoScript): Promise<void> {
    if (this.status === 'running') {
      throw new Error('Demo already running');
    }

    this.currentScript = script;
    this.currentAction = 0;
    this.status = 'running';
    this.startTime = Date.now();

    const actions = script.generate();

    try {
      for (let i = 0; i < actions.length; i++) {
        if (this.status === 'paused') {
          await this.waitUntilResumed();
        }

        if (this.status !== 'running') {
          break;
        }

        this.currentAction = i;
        const action = actions[i];

        // Report progress
        if (this.config.onProgress) {
          this.config.onProgress({
            current: i + 1,
            total: actions.length,
            action: action.description || action.type,
          });
        }

        try {
          await this.executeAction(action);
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          this.log(`Action failed: ${action.description}`, err);

          if (this.config.onError) {
            this.config.onError(err);
          }

          // Continue or rethrow based on config
          throw err;
        }

        // Pause between actions
        if (this.config.pauseBetweenActions) {
          await this.ghostUser.wait(this.config.pauseBetweenActions);
        }
      }

      this.status = 'completed';

      if (this.config.onComplete) {
        this.config.onComplete();
      }

      this.log(`Demo completed in ${Date.now() - this.startTime}ms`);
    } catch (error) {
      this.status = 'error';
      this.log('Demo execution error', error);
      throw error;
    }
  }

  /**
   * Execute individual action
   */
  private async executeAction(action: DemoAction): Promise<void> {
    this.log(`Executing: ${action.description || action.type}`);

    switch (action.type) {
      case 'moveToElement':
        if (!action.selector) throw new Error('selector required');
        await this.ghostUser.moveToElement(action.selector);
        break;

      case 'click':
        if (!action.selector) throw new Error('selector required');
        await this.ghostUser.moveToElement(action.selector);
        await this.ghostUser.click();
        break;

      case 'holdButton':
        if (!action.selector) throw new Error('selector required');
        const holdDuration = action.duration || 400;
        await this.ghostUser.holdButton(action.selector, holdDuration);
        break;

      case 'uploadFile':
        if (!action.value) throw new Error('filename required');
        await this.handleFileUpload(action.value);
        break;

      case 'selectCheckbox':
        if (!action.selector) throw new Error('selector required');
        await this.ghostUser.moveToElement(action.selector);
        await this.ghostUser.click();
        break;

      case 'adjustSlider':
        if (!action.selector || action.value === undefined)
          throw new Error('selector and value required');
        await this.handleSliderAdjustment(action.selector, action.value);
        break;

      case 'waitFor':
        if (!action.selector) throw new Error('selector required');
        await this.ghostUser.waitForElement(action.selector);
        break;

      case 'wait':
        const waitDuration = action.duration || 1000;
        await this.ghostUser.wait(waitDuration);
        break;

      case 'scrollTo':
        if (!action.selector) throw new Error('selector required');
        await this.ghostUser.scrollToElement(action.selector);
        break;

      case 'navigate':
        if (!action.value) throw new Error('tab required');
        await this.handleNavigation(action.value);
        break;

      case 'takeScreenshot':
        await this.handleScreenshot();
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  /**
   * Handle file upload simulation
   */
  private async handleFileUpload(filename: string): Promise<void> {
    // This would need to be integrated with your actual upload handler
    // For now, we'll dispatch a custom event that your app can listen for
    const event = new CustomEvent('DEMO_UPLOAD_FILE', {
      detail: { filename },
    });
    window.dispatchEvent(event);

    // Wait for upload to complete
    await this.ghostUser.wait(1500);
  }

  /**
   * Handle slider adjustment
   */
  private async handleSliderAdjustment(selector: string, value: number): Promise<void> {
    const element = document.querySelector(selector) as HTMLInputElement;
    if (!element) {
      throw new Error(`Slider not found: ${selector}`);
    }

    // Move to slider
    await this.ghostUser.moveToElement(selector);

    // Simulate drag
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));

    this.log(`Adjusted slider to ${value}`);
  }

  /**
   * Handle navigation between tabs
   */
  private async handleNavigation(tab: string): Promise<void> {
    const selector = `[data-tab="${tab}"]`;
    await this.ghostUser.moveToElement(selector);
    await this.ghostUser.click();

    this.log(`Navigated to ${tab} tab`);
  }

  /**
   * Handle screenshot capture
   */
  private async handleScreenshot(): Promise<void> {
    // This would integrate with your recording system
    const event = new CustomEvent('DEMO_TAKE_SCREENSHOT');
    window.dispatchEvent(event);
  }

  /**
   * Pause the demo
   */
  pause(): void {
    if (this.status === 'running') {
      this.status = 'paused';
      this.log('Demo paused');
    }
  }

  /**
   * Resume the demo
   */
  resume(): void {
    if (this.status === 'paused') {
      this.status = 'running';
      this.log('Demo resumed');
    }
  }

  /**
   * Stop the demo
   */
  stop(): void {
    this.status = 'completed';
    this.log('Demo stopped');
  }

  /**
   * Wait until demo is resumed
   */
  private waitUntilResumed(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.status === 'running') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Get current status
   */
  getStatus(): DemoStatus {
    return this.status;
  }

  /**
   * Get current progress
   */
  getProgress(): { current: number; total: number; percentage: number } {
    const total = this.currentScript?.getActionCount() || 0;
    const current = this.currentAction;
    return {
      current,
      total,
      percentage: total > 0 ? (current / total) * 100 : 0,
    };
  }

  /**
   * Get elapsed time
   */
  getElapsedTime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Log message
   */
  private log(message: string, data?: any): void {
    if (this.config.verbose) {
      console.log(`[DemoDirector] ${message}`, data || '');
    }
  }
}

/**
 * Export singleton accessor
 */
export const getDemoDirector = (config?: DemoDirectorConfig) =>
  DemoDirector.getInstance(config);
