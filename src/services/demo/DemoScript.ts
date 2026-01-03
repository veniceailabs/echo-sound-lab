/**
 * DemoScript
 * Parses user intent/prompt and generates a sequence of actions
 * for the GhostUser to execute
 *
 * Uses verified selectors from SelectorMap.ts
 * References real scenarios from HipHopMasterScenario.ts
 *
 * Examples:
 * - "Master a hip-hop vocal"
 * - "Demo the platform with EQ and compression"
 * - "Show how to use multi-stem mastering"
 */

export interface DemoAction {
  type:
    | 'moveToElement'
    | 'click'
    | 'holdButton'
    | 'uploadFile'
    | 'selectCheckbox'
    | 'adjustSlider'
    | 'waitFor'
    | 'wait'
    | 'scrollTo'
    | 'navigate'
    | 'narrate'
    | 'takeScreenshot';
  selector?: string;
  duration?: number;
  delay?: number;
  value?: any;
  description?: string;
}

export interface DemoScriptConfig {
  genre?: string;
  trackType?: string; // 'vocal', 'instrumental', 'mix'
  features?: string[]; // ['eq', 'compression', 'reverb', etc]
  duration?: 'short' | 'medium' | 'long'; // target demo length
  includeMultiStem?: boolean;
  includeVideo?: boolean;
  refinement?: boolean; // show plugin adjustment
}

export class DemoScript {
  private config: DemoScriptConfig;
  private actions: DemoAction[] = [];

  constructor(config: DemoScriptConfig = {}) {
    this.config = {
      duration: 'medium',
      includeMultiStem: false,
      includeVideo: false,
      refinement: true,
      ...config,
    };
  }

  /**
   * Parse user prompt and generate script
   * Examples:
   * - "Master a hip-hop vocal"
   * - "Demo EQ and compression on a pop vocal"
   */
  static fromPrompt(prompt: string): DemoScript {
    const config: DemoScriptConfig = {};

    // Parse genre
    if (prompt.match(/hip[\s-]?hop|rap/i)) config.genre = 'hip-hop';
    else if (prompt.match(/pop/i)) config.genre = 'pop';
    else if (prompt.match(/electronic|edm|techno/i)) config.genre = 'electronic';
    else if (prompt.match(/indie|rock/i)) config.genre = 'indie';

    // Parse track type
    if (prompt.match(/vocal/i)) config.trackType = 'vocal';
    else if (prompt.match(/instrumental/i)) config.trackType = 'instrumental';
    else if (prompt.match(/mix/i)) config.trackType = 'mix';

    // Parse features
    if (prompt.match(/eq/i)) {
      if (!config.features) config.features = [];
      config.features.push('eq');
    }
    if (prompt.match(/compress/i)) {
      if (!config.features) config.features = [];
      config.features.push('compression');
    }
    if (prompt.match(/reverb/i)) {
      if (!config.features) config.features = [];
      config.features.push('reverb');
    }
    if (prompt.match(/multi[\s-]?stem|stem/i)) {
      config.includeMultiStem = true;
    }
    if (prompt.match(/video|eve/i)) {
      config.includeVideo = true;
    }

    // Parse duration
    if (prompt.match(/quick|fast|short/i)) config.duration = 'short';
    else if (prompt.match(/long|detailed|comprehensive/i)) config.duration = 'long';

    return new DemoScript(config);
  }

  /**
   * Generate the action sequence
   */
  generate(): DemoAction[] {
    this.actions = [];

    // Phase 1: Setup & Upload
    this.generateUploadPhase();

    // Phase 2: Analysis
    this.generateAnalysisPhase();

    // Phase 3: Suggestions & Selection
    this.generateSuggestionPhase();

    // Phase 4: Processing
    this.generateProcessingPhase();

    // Phase 5: Refinement (if enabled)
    if (this.config.refinement) {
      this.generateRefinementPhase();
    }

    // Phase 6: Expansion (multi-stem, video)
    if (this.config.includeMultiStem) {
      this.generateMultiStemPhase();
    }
    if (this.config.includeVideo) {
      this.generateVideoPhase();
    }

    // Final: Return to main view
    this.actions.push({
      type: 'navigate',
      value: 'SINGLE',
      description: 'Return to single track view',
    });

    return this.actions;
  }

  private generateUploadPhase(): void {
    this.actions.push({
      type: 'waitFor',
      selector: '#upload-zone',
      description: 'Wait for upload zone to be ready',
    });

    this.actions.push({
      type: 'click',
      selector: '#upload-button',
      description: 'Click upload button',
    });

    this.actions.push({
      type: 'uploadFile',
      value: `sample-${this.config.genre || 'mixed'}-${this.config.trackType || 'mix'}.wav`,
      description: `Upload ${this.config.genre || 'mixed'} ${this.config.trackType || 'mix'}`,
    });

    this.actions.push({
      type: 'wait',
      duration: 2000,
      description: 'Wait for file to load',
    });
  }

  private generateAnalysisPhase(): void {
    this.actions.push({
      type: 'waitFor',
      selector: '.sonic-analysis-panel',
      description: 'Wait for analysis to complete',
    });

    this.actions.push({
      type: 'scrollTo',
      selector: '.sonic-analysis-panel',
      description: 'Scroll to analysis results',
    });

    this.actions.push({
      type: 'wait',
      duration: 1000,
      description: 'Let analysis be visible',
    });
  }

  private generateSuggestionPhase(): void {
    this.actions.push({
      type: 'scrollTo',
      selector: '.ai-recommendations-panel',
      description: 'Scroll to AI recommendations',
    });

    this.actions.push({
      type: 'wait',
      duration: 500,
      description: 'Wait for recommendations to appear',
    });

    // Select specific features based on config
    const featuresToSelect = this.config.features || ['eq', 'compression'];

    for (const feature of featuresToSelect) {
      const selector = `[data-suggestion-type="${feature}"]`;
      this.actions.push({
        type: 'moveToElement',
        selector,
        description: `Move to ${feature} suggestion`,
      });

      this.actions.push({
        type: 'wait',
        duration: 300,
        description: `Highlight ${feature} suggestion`,
      });

      this.actions.push({
        type: 'click',
        selector: `${selector} input[type="checkbox"]`,
        description: `Select ${feature} suggestion`,
      });

      this.actions.push({
        type: 'wait',
        duration: 400,
        description: 'Wait after selection',
      });
    }

    // Intentionally skip one suggestion to show user agency
    this.actions.push({
      type: 'moveToElement',
      selector: '[data-suggestion-type="reverb"]',
      description: 'Move to reverb suggestion (will skip)',
    });

    this.actions.push({
      type: 'wait',
      duration: 300,
      description: 'Show that user can skip suggestions',
    });
  }

  private generateProcessingPhase(): void {
    this.actions.push({
      type: 'scrollTo',
      selector: '#apply-fixes-button',
      description: 'Scroll to apply fixes button',
    });

    this.actions.push({
      type: 'click',
      selector: '#apply-fixes-button',
      description: 'Click apply fixes',
    });

    this.actions.push({
      type: 'wait',
      duration: 3000,
      description: 'Wait for processing to complete',
    });

    this.actions.push({
      type: 'waitFor',
      selector: '.echo-report-panel',
      description: 'Wait for echo report to appear',
    });

    this.actions.push({
      type: 'scrollTo',
      selector: '.echo-report-panel',
      description: 'Scroll to echo report',
    });

    this.actions.push({
      type: 'wait',
      duration: 1000,
      description: 'Let verdict be visible',
    });
  }

  private generateRefinementPhase(): void {
    this.actions.push({
      type: 'click',
      selector: '[data-action="open-plugin-adjustment"]',
      description: 'Open plugin for adjustment',
    });

    this.actions.push({
      type: 'wait',
      duration: 1000,
      description: 'Wait for plugin UI to appear',
    });

    this.actions.push({
      type: 'adjustSlider',
      selector: 'input[data-param="threshold"]',
      value: -12,
      description: 'Adjust compressor threshold',
    });

    this.actions.push({
      type: 'wait',
      duration: 500,
      description: 'Let adjustment take effect',
    });

    this.actions.push({
      type: 'click',
      selector: '[data-action="apply-adjustment"]',
      description: 'Apply adjustment',
    });

    this.actions.push({
      type: 'wait',
      duration: 1500,
      description: 'Wait for re-analysis',
    });
  }

  private generateMultiStemPhase(): void {
    this.actions.push({
      type: 'click',
      selector: '[data-tab="MULTI"]',
      description: 'Click multi-stem tab',
    });

    this.actions.push({
      type: 'wait',
      duration: 1500,
      description: 'Wait for multi-stem workspace to load',
    });

    this.actions.push({
      type: 'scrollTo',
      selector: '.multi-stem-workspace',
      description: 'Show multi-stem interface',
    });

    this.actions.push({
      type: 'wait',
      duration: 1000,
      description: 'Let multi-stem interface be visible',
    });
  }

  private generateVideoPhase(): void {
    this.actions.push({
      type: 'click',
      selector: '[data-tab="VIDEO"]',
      description: 'Click video tab (EVE)',
    });

    this.actions.push({
      type: 'wait',
      duration: 1500,
      description: 'Wait for EVE to load',
    });

    this.actions.push({
      type: 'scrollTo',
      selector: '.eve-interface',
      description: 'Show EVE interface',
    });

    this.actions.push({
      type: 'wait',
      duration: 1000,
      description: 'Let EVE be visible',
    });
  }

  /**
   * Get config for inspection
   */
  getConfig(): DemoScriptConfig {
    return this.config;
  }

  /**
   * Get action count (useful for progress tracking)
   */
  getActionCount(): number {
    return this.actions.length;
  }
}
