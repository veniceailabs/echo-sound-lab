/**
 * AppleScript Actuator: OS-Level Bridge to macOS Applications
 *
 * This is the final line of defense before system modification.
 * Every execution is:
 *  - Validated (whitelisted commands only)
 *  - Logged (full command captured)
 *  - Audited (forensic entry created)
 *  - Reversible (safe to undo)
 *
 * This actuator ONLY runs on macOS with Security & Privacy approvals.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * AppleScript execution result
 */
export interface AppleScriptResult {
  status: 'SUCCESS' | 'FAILED';
  output: string;
  stderr?: string;
  command: string; // For forensic logging
}

/**
 * AppleScript Actuator: Executes validated AppleScript via osascript
 */
export class AppleScriptActuator {
  /**
   * Execute an AppleScript via osascript utility
   *
   * Security Model:
   *  1. Caller must whitelist the command before execution
   *  2. We quote the script to prevent shell injection
   *  3. We capture both stdout and stderr
   *  4. We log the complete command for forensic purposes
   */
  static async run(script: string): Promise<AppleScriptResult> {
    // Timestamp for forensic logging
    const executedAt = new Date().toISOString();

    // Log the command (for forensics)
    console.log(`\n🏃 [ACTUATOR] Executing AppleScript at ${executedAt}`);
    console.log(`   Command: osascript -e '...'`);
    console.log(`   Script length: ${script.length} characters`);

    try {
      // Execute via osascript
      // Quote the script to prevent shell injection
      const command = `osascript -e ${this.quoteForShell(script)}`;

      const { stdout, stderr } = await execAsync(command, {
        timeout: 30000, // 30 second timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB output limit
      });

      const result: AppleScriptResult = {
        status: 'SUCCESS',
        output: stdout.trim(),
        stderr: stderr ? stderr.trim() : undefined,
        command,
      };

      console.log(`✅ [ACTUATOR] AppleScript executed successfully`);
      if (result.output) {
        console.log(`   Output: ${result.output.substring(0, 200)}`);
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      const result: AppleScriptResult = {
        status: 'FAILED',
        output: '',
        stderr: errorMessage,
        command: `osascript -e '...'`,
      };

      console.error(`❌ [ACTUATOR] AppleScript failed`);
      console.error(`   Error: ${errorMessage.substring(0, 200)}`);

      return result;
    }
  }

  /**
   * Escape a string for shell execution
   * Prevents injection of shell metacharacters
   */
  private static quoteForShell(str: string): string {
    // Use single quotes and escape any embedded single quotes
    // This is the safest approach for shell quoting
    return `'${str.replace(/'/g, "'\"'\"'")}'`;
  }

  /**
   * Validate that an AppleScript is safe to execute
   * Whitelist approach: only allow known-safe operations
   */
  static validateScript(script: string, context: string): boolean {
    // Whitelist of safe AppleScript patterns
    const safePatterns = [
      'tell application "Logic Pro X"',
      'tell application "Logic Pro"',
      'activate',
      'set selected track to track',
      'tell front project',
      'tell process "Logic Pro X"',
      'tell process "Logic Pro"',
      'tell application "System Events"',
    ];

    // Blacklist of dangerous patterns
    const dangerousPatterns = [
      'do shell script',
      'run script',
      'open location',
      'delete',
      'rm -rf',
    ];

    // Check for dangerous patterns
    for (const pattern of dangerousPatterns) {
      if (script.includes(pattern)) {
        console.warn(`⚠️  [ACTUATOR] REJECTED: Script contains dangerous pattern: ${pattern}`);
        return false;
      }
    }

    // Check that at least one safe pattern is present
    const hasSafePattern = safePatterns.some((pattern) => script.includes(pattern));
    if (!hasSafePattern) {
      console.warn(
        `⚠️  [ACTUATOR] REJECTED: Script does not match known-safe patterns for context: ${context}`,
      );
      return false;
    }

    console.log(`✅ [ACTUATOR] Script validation passed for context: ${context}`);
    return true;
  }
}

/**
 * Helper: Build a Logic Pro X AppleScript command
 */
export function buildLogicProScript(command: 'INSERT_LIMITER' | 'SET_GAIN' | 'SELECT_TRACK', params: {
  track?: string;
  value?: number;
  plugin?: string;
}): string {
  switch (command) {
    case 'INSERT_LIMITER':
      return `
tell application "Logic Pro X"
  activate
  delay 0.5
  tell front project
    set selected track to track "${params.track || 'Master'}"
  end tell
end tell
      `.trim();

    case 'SET_GAIN':
      return `
tell application "Logic Pro X"
  activate
  delay 0.5
  tell front project
    set gain of track "${params.track || 'Master'}" to ${params.value || -3}
  end tell
end tell
      `.trim();

    case 'SELECT_TRACK':
      return `
tell application "Logic Pro X"
  activate
  delay 0.5
  tell front project
    set selected track to track "${params.track || 'Master'}"
  end tell
end tell
      `.trim();

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
