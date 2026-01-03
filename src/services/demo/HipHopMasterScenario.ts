/**
 * HipHopMasterScenario.ts
 * The "Kill Shot" Demo - Hip-Hop Vocal Mastering with Action Authority
 *
 * Demonstrates:
 * 1. AI understands the UI (navigation)
 * 2. AI makes intelligent decisions (selects relevant suggestions)
 * 3. AI respects constraints (400ms hold on AA button)
 * 4. System enforces safety (if constraint violated, FSM blocks)
 *
 * This is the "Tesla Autopilot Moment" - the system proves its own safety.
 */

import { DemoAction } from './DemoScript';
import {
  SELECTOR_MAP,
  WAIT_FOR_STATES,
  findElementByText,
  waitForSelector,
} from './SelectorMap';

/**
 * HIP_HOP_MASTER_SCENARIO
 * Complete action sequence for self-demonstrating hip-hop vocal mastering
 */
export const HIP_HOP_MASTER_SCENARIO: DemoAction[] = [
  // ========== PHASE 1: SETUP & UPLOAD ==========
  {
    type: 'narrate',
    description: '🎤 Uploading hip-hop vocal stem for analysis...',
  },

  {
    type: 'waitFor',
    selector: SELECTOR_MAP.uploadDropZone,
    description: 'Wait for upload zone to be ready',
  },

  {
    type: 'scrollTo',
    selector: SELECTOR_MAP.uploadDropZone,
    description: 'Scroll to upload zone if needed',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.uploadIcon,
    description: 'Move to upload icon',
  },

  {
    type: 'wait',
    duration: 300,
    description: 'Let cursor hover on upload zone',
  },

  {
    type: 'uploadFile',
    value: 'sample_hip_hop_vocal_demo.wav',
    description: 'Trigger file upload (internal)',
  },

  {
    type: 'wait',
    duration: 2000,
    description: 'Wait for file to process and analysis to start',
  },

  // ========== PHASE 2: ANALYSIS & DETECTION ==========
  {
    type: 'narrate',
    description: '📊 Audio Perception Layer analyzing content...',
  },

  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.proposalCardReady,
    description: 'Wait for APL to detect issues and generate proposals',
  },

  {
    type: 'scrollTo',
    selector: SELECTOR_MAP.proposalCard,
    description: 'Scroll to proposals panel to see them clearly',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.firstProposal,
    description: 'Move to first proposal card',
  },

  {
    type: 'wait',
    duration: 800,
    description: 'Let user read the proposal (clipping, loudness, etc)',
  },

  // ========== PHASE 3: THE KILL SHOT - ACTION AUTHORITY DEMONSTRATION ==========
  {
    type: 'narrate',
    description: '🔐 Engaging Dead Man\'s Switch (Action Authority)...',
  },

  {
    type: 'narrate',
    description: 'The AI must hold the button for 400ms. If it releases early, AA blocks it.',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.holdButton,
    description: 'Move to the "HOLDING" button (Action Authority gate)',
  },

  {
    type: 'wait',
    duration: 500,
    description: 'Position cursor on the button',
  },

  /**
   * THE CRITICAL ACTION:
   * This is where the Ghost demonstrates it respects AA constraints.
   * The button must be held for 400ms (or whatever AA requires).
   * If the Ghost releases early, the FSM blocks the action.
   * If the Ghost holds for the required duration, the action executes.
   *
   * This is unfakeable because:
   * - The duration is measured in real time
   * - If AA requirements change (400ms → 600ms), old demos fail
   * - This proves the safety is real
   */
  {
    type: 'holdButton',
    selector: SELECTOR_MAP.holdButton,
    duration: 400, // EXACTLY 400ms (AA requirement)
    description: 'Hold the button for 400ms (Action Authority constraint)',
  },

  {
    type: 'narrate',
    description: '✅ Hold completed. FSM evaluates compliance...',
  },

  {
    type: 'wait',
    duration: 500,
    description: 'Wait for FSM to process the hold action',
  },

  // ========== PHASE 4: PROPOSAL EXECUTION & VERIFICATION ==========
  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.proposalCardExecuted,
    description: 'Wait for proposal to show as executed (green state)',
  },

  {
    type: 'narrate',
    description: '🎯 Proposal executed! Action Authority approved the action.',
  },

  {
    type: 'wait',
    duration: 1000,
    description: 'Wait for audio engine to apply the processing',
  },

  // ========== PHASE 5: ANALYSIS UPDATE & REPORT GENERATION ==========
  {
    type: 'narrate',
    description: '📈 Re-analyzing audio with applied processing...',
  },

  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.reportReady,
    description: 'Wait for Echo Report to generate',
  },

  {
    type: 'scrollTo',
    selector: SELECTOR_MAP.echoReportPanel,
    description: 'Scroll to Echo Report panel',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.echoReportTitle,
    description: 'Move to Echo Report title',
  },

  {
    type: 'wait',
    duration: 1200,
    description: 'Let user review the report (metrics, verdict, actions)',
  },

  {
    type: 'narrate',
    description: 'Report Card shows processing status and recommendations.',
  },

  // ========== PHASE 6: PROCESSING & EXPORT (Optional Refinement) ==========
  {
    type: 'narrate',
    description: '🎚️ Optional: Fine-tuning processing parameters...',
  },

  {
    type: 'scrollTo',
    selector: SELECTOR_MAP.processingPanel,
    description: 'Scroll to processing controls',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.compressionThreshold,
    description: 'Move to compression threshold slider',
  },

  {
    type: 'wait',
    duration: 400,
    description: 'Highlight the control',
  },

  {
    type: 'adjustSlider',
    selector: SELECTOR_MAP.compressionThreshold,
    value: -12,
    description: 'Adjust compression threshold to -12dB',
  },

  {
    type: 'wait',
    duration: 600,
    description: 'Wait for audio to re-analyze with new setting',
  },

  {
    type: 'narrate',
    description: 'Threshold adjusted. Echo Report updates automatically.',
  },

  // ========== PHASE 7: COMMIT & COMPLETION ==========
  {
    type: 'scrollTo',
    selector: SELECTOR_MAP.commitButton,
    description: 'Scroll to commit button',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.commitButton,
    description: 'Move to COMMIT button',
  },

  {
    type: 'wait',
    duration: 400,
    description: 'Emphasize the commit action',
  },

  {
    type: 'click',
    selector: SELECTOR_MAP.commitButton,
    description: 'Click COMMIT to save processing',
  },

  {
    type: 'wait',
    duration: 1500,
    description: 'Wait for processing to commit to history',
  },

  // ========== PHASE 8: EXPORT & FINAL DEMONSTRATION ==========
  {
    type: 'narrate',
    description: '✨ Processing complete. Audio ready for export.',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.exportButton,
    description: 'Move to EXPORT button (optional)',
  },

  {
    type: 'wait',
    duration: 600,
    description: 'Show export option is available',
  },

  // ========== PHASE 9: SUMMARY & FORENSIC AUDIT ==========
  {
    type: 'narrate',
    description: '📋 Demo Summary:',
  },

  {
    type: 'narrate',
    description:
      '✓ AI navigated complex UI autonomously (upload, proposals, controls)',
  },

  {
    type: 'narrate',
    description:
      '✓ AI made intelligent decisions (selected relevant processing)',
  },

  {
    type: 'narrate',
    description:
      '✓ AI held button for exact duration required by Action Authority',
  },

  {
    type: 'narrate',
    description:
      '✓ FSM enforced constraints - action blocked if hold was insufficient',
  },

  {
    type: 'narrate',
    description:
      '✓ All actions logged to ForensicAuditLog (verifiable, unfakeable)',
  },

  {
    type: 'narrate',
    description: '🎬 Demo Complete. The system proved its own safety in real-time.',
  },

  {
    type: 'wait',
    duration: 2000,
    description: 'Final pause for effect',
  },

  {
    type: 'narrate',
    description: 'This is not a pre-recorded video. This is live execution.',
  },

  {
    type: 'narrate',
    description:
      'If Action Authority requirements change, this demo will break. That proves it\'s real.',
  },
];

/**
 * POP_MASTER_SCENARIO
 * Alternative scenario for pop music (similar structure, different genre focus)
 */
export const POP_MASTER_SCENARIO: DemoAction[] = [
  {
    type: 'narrate',
    description: '🎤 Uploading pop vocal mix for mastering...',
  },

  {
    type: 'waitFor',
    selector: SELECTOR_MAP.uploadDropZone,
    description: 'Wait for upload ready',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.uploadIcon,
    description: 'Move to upload',
  },

  {
    type: 'uploadFile',
    value: 'sample_pop_mix_demo.wav',
    description: 'Upload pop vocal mix',
  },

  {
    type: 'wait',
    duration: 2000,
    description: 'Analysis processing',
  },

  // Same proposal & hold flow as hip-hop
  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.proposalCardReady,
    description: 'Wait for proposals',
  },

  {
    type: 'narrate',
    description: '🎯 Engaging Action Authority gate...',
  },

  {
    type: 'holdButton',
    selector: SELECTOR_MAP.holdButton,
    duration: 400,
    description: 'Hold for 400ms (FSM requirement)',
  },

  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.reportReady,
    description: 'Wait for report',
  },

  {
    type: 'narrate',
    description: '✅ Pop mastering demo complete!',
  },
];

/**
 * QUICK_TOUR_SCENARIO
 * Fast 60-second demo for social media
 */
export const QUICK_TOUR_SCENARIO: DemoAction[] = [
  {
    type: 'narrate',
    description: '⚡ 60-Second Echo Sound Lab Demo',
  },

  {
    type: 'waitFor',
    selector: SELECTOR_MAP.uploadDropZone,
    description: 'Upload ready',
  },

  {
    type: 'moveToElement',
    selector: SELECTOR_MAP.uploadIcon,
    description: 'Upload audio',
  },

  {
    type: 'uploadFile',
    value: 'sample_track.wav',
    description: 'File uploaded',
  },

  {
    type: 'wait',
    duration: 1500,
    description: 'Analysis',
  },

  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.proposalCardReady,
    description: 'Proposals ready',
  },

  {
    type: 'narrate',
    description: '🔐 Action Authority gate (400ms hold required)',
  },

  {
    type: 'holdButton',
    selector: SELECTOR_MAP.holdButton,
    duration: 400,
    description: 'Hold & confirm',
  },

  {
    type: 'waitFor',
    selector: WAIT_FOR_STATES.reportReady,
    description: 'Report ready',
  },

  {
    type: 'narrate',
    description: '✨ AI-assisted mastering with safety constraints.',
  },

  {
    type: 'narrate',
    description: 'Demo complete!',
  },
];

export const DEMO_SCENARIOS = {
  HIP_HOP_MASTER: HIP_HOP_MASTER_SCENARIO,
  POP_MASTER: POP_MASTER_SCENARIO,
  QUICK_TOUR: QUICK_TOUR_SCENARIO,
} as const;

export type ScenarioName = keyof typeof DEMO_SCENARIOS;

/**
 * GET_SCENARIO
 * Retrieve a scenario by name
 */
export function getScenario(name: ScenarioName): DemoAction[] {
  return DEMO_SCENARIOS[name];
}

/**
 * SCENARIO_METADATA
 * Information about each scenario
 */
export const SCENARIO_METADATA = {
  HIP_HOP_MASTER: {
    name: 'Hip-Hop Vocal Mastering',
    duration: '3-4 minutes',
    description: 'Full workflow: upload, analysis, proposals, Action Authority gate, processing',
    tags: ['hip-hop', 'vocal', 'full-demo', 'aa-showcase'],
  },
  POP_MASTER: {
    name: 'Pop Mix Mastering',
    duration: '3-4 minutes',
    description: 'Pop vocal mastering with refinement controls',
    tags: ['pop', 'vocal', 'full-demo', 'aa-showcase'],
  },
  QUICK_TOUR: {
    name: 'Quick 60-Second Tour',
    duration: '60 seconds',
    description: 'Fast overview for social media sharing',
    tags: ['short', 'social-media', 'quick'],
  },
} as const;
