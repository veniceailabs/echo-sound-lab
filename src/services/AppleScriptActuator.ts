/**
 * APPLESCRIPT ACTUATOR
 * The Muscle. Executes raw AppleScript commands via Node.js child_process.
 *
 * RUNTIME: Node.js (Main Process) ONLY.
 * Do NOT attempt to use this in React/Browser context.
 */

// Only import Node.js modules in Node.js context
let execAsync: ((command: string) => Promise<{ stdout: string; stderr: string }>) | null = null;

if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  // We're in Node.js
  const { exec: nodeExec } = require('child_process');
  const { promisify } = require('util');
  execAsync = promisify(nodeExec);
}

export class AppleScriptActuator {
  /**
   * Executes a raw AppleScript string on the host OS.
   * @param script The AppleScript code to run
   */
  public static async run(script: string): Promise<string> {
    if (!execAsync) {
      throw new Error('AppleScriptActuator requires Node.js runtime. Not available in browser context.');
    }

    // 1. Sanitize: Escape double quotes to prevent shell injection (basic)
    const sanitizedScript = script.replace(/"/g, '\\"');

    // 2. Command: osascript -e "tell app..."
    const command = `osascript -e "${sanitizedScript}"`;

    try {
      console.log(`[Actuator] Executing OS Command...`);
      const { stdout, stderr } = await execAsync!(command);

      if (stderr) {
        console.warn(`[Actuator] Stderr warning: ${stderr}`);
      }

      return stdout.trim();
    } catch (error) {
      console.error(`[Actuator] EXECUTION FAILED:`, error);
      throw new Error(`OSAScript Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Health Check: Verifies Logic Pro is running
   */
  public static async isLogicRunning(): Promise<boolean> {
    const script = `tell application "System Events" to (name of processes) contains "Logic Pro X"`;
    try {
      const result = await this.run(script);
      return result === 'true';
    } catch (e) {
      return false;
    }
  }
}
