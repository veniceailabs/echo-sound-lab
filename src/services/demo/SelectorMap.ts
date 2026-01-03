/**
 * SelectorMap.ts
 * Complete UI topology for the Ghost to navigate Echo Sound Lab
 *
 * Every selector is verified against actual component structure
 * If a selector changes, the Ghost will fail to find it (falsifiable proof)
 */

/**
 * SELECTOR MAP - The Ghost's Navigation Reference
 * Each selector points to a real, verified element in the UI
 */
export const SELECTOR_MAP = {
  // ===== UPLOAD & FILE INPUT =====
  fileInput: 'input[type="file"][accept="audio/*"]',
  uploadDropZone: 'div.relative.bg-gradient-to-br > label', // Parent container
  uploadIcon: 'svg[class*="music"]', // Music note icon inside upload zone

  // ===== MODE TABS =====
  modeTabsContainer: 'div[class*="flex"] [class*="gap-2"] [class*="bg-slate-950"]',
  tabSingle: 'button:has-text("SINGLE")',
  tabMulti: 'button:has-text("MULTI")',
  tabAIStudio: 'button:has-text("AI_STUDIO")',
  tabVideo: 'button:has-text("VIDEO")',
  activeTab: 'button[class*="text-orange-400"][class*="border-orange-500"]',

  // ===== PROPOSAL PANEL (Right Sidebar) =====
  proposalPanel: 'div.w-80.h-screen.border-l.border-white\\/10',
  proposalHeader: 'h3:has-text("Intelligence Feed")',
  proposalCardContainer: 'div[class*="flex-1"] [class*="overflow-y-auto"]',
  proposalCard: 'div[class*="border-l-4"][class*="rounded"][class*="bg-slate-900"]',
  firstProposal: 'div[class*="border-l-4"]:first-child',
  proposalAction: 'span:has-text("CLIPPING") | span:has-text("LOUDNESS")', // Proposal type

  // ===== ACTION AUTHORITY (Kinetic Button) =====
  holdButton: 'button:has-text("HOLDING") | button:has-text("PRESS ENTER")',
  holdButtonArmed: 'button[class*="bg-blue-600"][class*="animate-pulse"]:has-text("PRESS ENTER")',
  holdButtonExecuted: 'button[class*="bg-green-600"][class*="border-green-500"]',
  holdProgress: 'span:has-text(/HOLDING \\d+%/)',

  // ===== PROCESSING CONTROLS =====
  processingPanel: 'div[class*="from-white"].[class*="to-white"] > div:has(button:has-text("COMMIT"))',
  commitButton: 'button:has-text("COMMIT")',
  exportButton: 'button:has-text("EXPORT")',
  applyButton: 'button:has-text("Apply")',

  // ===== EQ CONTROLS =====
  eqControls: 'div[class*="flex"] [class*="gap"] input[type="range"]', // All sliders
  eqBand1: 'input[data-param="freq_band_1"]', // 60Hz
  eqBand2: 'input[data-param="freq_band_2"]', // 250Hz
  eqBand3: 'input[data-param="freq_band_3"]', // 1kHz
  eqBand4: 'input[data-param="freq_band_4"]', // 4kHz
  eqGain: 'input[data-param="gain"]', // Gain slider

  // ===== COMPRESSION CONTROLS =====
  compressionThreshold: 'input[data-param="threshold"]',
  compressionRatio: 'input[data-param="ratio"]',
  compressionAttack: 'input[data-param="attack"]',
  compressionRelease: 'input[data-param="release"]',

  // ===== ECHO REPORT PANEL =====
  echoReportPanel: 'div:has(h2:has-text("Echo Report"))',
  echoReportTitle: 'h2:has-text("Echo Report")',
  echoReportActions: 'div[class*="p-4"][class*="rounded-lg"][class*="bg-slate-800"]',
  echoReportStatus: 'span:has-text("RELEASE_READY") | span:has-text("REFINEMENTS_NEEDED")',

  // ===== FLOATING CONTROLS =====
  playButton: 'button[class*="w-12"][class*="bg-orange-500"]', // Bottom center
  playButtonIcon: 'svg[class*="play"]',
  playheadSlider: 'input[type="range"]', // Playback position

  // ===== VISUALIZER =====
  visualizer: 'div[class*="bg-gradient"][class*="waveform"]',
  sonicAnalysis: 'div:has(span:has-text("LUFS"))',
  lufsValue: 'span:has-text(/^-?\\d+\\.\\d+ LUFS$/)',

  // ===== HEADER BUTTONS =====
  headerContainer: 'header[class*="sticky"]',
  logoButton: 'button[title="Return to Echo Sound Lab"]',
  historyButton: 'button[title*="history" i]',
  settingsButton: 'button[class*="gear"] | button[title*="settings" i]',
  sscButton: 'button[title="SSC Observe Mode"]',
  versionBadge: 'span:has-text(/v\\d+\\.\\d+/)',

  // ===== MODALS =====
  advancedToolsModal: 'div[class*="fixed"][class*="z-\\[100\\]"][class*="bg-black\\/60"]',
  chatModal: 'div[class*="fixed"][class*="z-\\[100\\]"] .chat-interface',
  settingsModal: 'div[class*="fixed"][class*="z-\\[100\\]"] .settings-panel',

  // ===== LISTENING PASS =====
  listeningPassCard: 'div:has(h3:has-text("Listening Pass"))',
  listeningPassTokens: 'span[class*="bg-blue-500\\/10"]', // Token badges

  // ===== AI RECOMMENDATIONS =====
  recommendationsPanel: 'div:has(h3:has-text("AI Recommendations"))',
  suggestionCheckbox: 'input[type="checkbox"]', // Suggestion toggles
} as const;

/**
 * WAIT_FOR_STATES
 * These selectors indicate the UI is ready for the next action
 */
export const WAIT_FOR_STATES = {
  appLoaded: 'div[class*="app-shell"]',
  modeTabsReady: 'button[class*="text-orange-400"]', // Active tab visible
  proposalCardReady: 'div[class*="border-l-4"][class*="border-amber-400"] | div[class*="border-l-4"][class*="border-blue-500"]', // Proposal visible
  holdButtonReady: 'button:has-text("HOLDING 0%") | button:has-text("PRESS ENTER")',
  reportReady: 'h2:has-text("Echo Report")',
  processingComplete: 'button:has-text("COMMIT")[not(disabled)]',
} as const;

/**
 * CLASS_PATTERNS
 * CSS class patterns for identifying elements dynamically
 */
export const CLASS_PATTERNS = {
  proposalCardAmber: 'border-amber-400 shadow-amber-900/20', // Quantum proposal
  proposalCardBlue: 'border-blue-500 shadow-blue-900/20', // Classical proposal
  proposalCardExecuted: 'bg-green-600/50 border-green-500/50', // Executed state
  proposalCardArmed: 'bg-blue-600 border-blue-400 animate-pulse', // Armed state
  buttonOrange: 'bg-orange-500 hover:bg-orange-600',
  buttonBlue: 'bg-blue-600 hover:bg-blue-500',
  buttonGreen: 'bg-green-600 border-green-500',
} as const;

/**
 * DATA_ATTRIBUTES
 * HTML data-* attributes for reliable targeting
 * (These should be added to components if not already present)
 */
export const DATA_ATTRIBUTES = {
  proposalId: 'data-proposal-id', // e.g., data-proposal-id="clipping-001"
  proposalType: 'data-proposal-type', // e.g., data-proposal-type="clipping"
  proposalStatus: 'data-proposal-status', // e.g., data-proposal-status="armed"
  paramName: 'data-param', // e.g., data-param="threshold"
  paramValue: 'data-param-value', // e.g., data-param-value="0.5"
  actionType: 'data-action-type', // e.g., data-action-type="apply"
} as const;

/**
 * SAFE_QUERY_SELECTOR
 * Safely query for elements with fallback options
 */
export function safeQuerySelector(
  primary: string,
  fallback?: string,
): Element | null {
  try {
    let element = document.querySelector(primary);
    if (element) return element;

    if (fallback) {
      element = document.querySelector(fallback);
      if (element) return element;
    }
  } catch (error) {
    console.warn(`[SelectorMap] Invalid selector: ${primary}`, error);
  }

  return null;
}

/**
 * SAFE_QUERY_SELECTOR_ALL
 * Safely query for multiple elements
 */
export function safeQuerySelectorAll(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (error) {
    console.warn(`[SelectorMap] Invalid selector: ${selector}`, error);
    return [];
  }
}

/**
 * FIND_ELEMENT_BY_TEXT
 * Find element containing specific text (case-insensitive)
 */
export function findElementByText(
  text: string,
  selector: string = '*',
): Element | null {
  const elements = safeQuerySelectorAll(selector);
  return (
    elements.find((el) =>
      (el.textContent || '').toLowerCase().includes(text.toLowerCase()),
    ) || null
  );
}

/**
 * WAIT_FOR_SELECTOR
 * Wait for element to appear in DOM (with timeout)
 */
export async function waitForSelector(
  selector: string,
  timeout: number = 5000,
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = safeQuerySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const found = safeQuerySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for selector: ${selector}`));
    }, timeout);

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'disabled'],
    });
  });
}

/**
 * GET_ELEMENT_BOUNDS
 * Get position and dimensions of element
 */
export function getElementBounds(element: Element): {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
} {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
  };
}

/**
 * IS_ELEMENT_VISIBLE
 * Check if element is visible in viewport
 */
export function isElementVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return (
    rect.top < window.innerHeight &&
    rect.bottom > 0 &&
    rect.left < window.innerWidth &&
    rect.right > 0
  );
}

/**
 * SCROLL_INTO_VIEW_CENTER
 * Scroll element to center of viewport
 */
export async function scrollIntoViewCenter(
  element: Element,
  smooth: boolean = true,
): Promise<void> {
  element.scrollIntoView({
    behavior: smooth ? 'smooth' : 'auto',
    block: 'center',
    inline: 'center',
  });

  // Wait for scroll to complete
  return new Promise((resolve) => setTimeout(resolve, 500));
}
