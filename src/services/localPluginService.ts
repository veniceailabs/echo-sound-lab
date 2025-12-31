/**
 * Local Plugin Service - AudioWorklet-based local plugins
 * Plugins: echo-delay, echo-reverb, echo-chorus
 * Real DSP running in AudioWorklet processors
 */

export interface LocalPluginParameter {
  id: string;
  label: string;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  unit?: string;
}

export interface LocalPluginDefinition {
  id: string;
  name: string;
  description: string;
  category: 'delay' | 'reverb' | 'modulation' | 'dynamics' | 'filter';
  parameters: LocalPluginParameter[];
  processorName: string;
  processorUrl: string;
}

export interface LocalPluginInstance {
  id: string;
  pluginId: string;
  workletNode: AudioWorkletNode | null;
  inputNode: GainNode;
  outputNode: GainNode;
  dryNode: GainNode;
  parameters: Record<string, number>;
  isActive: boolean;
}

// Plugin definitions with worklet processor info
const LOCAL_PLUGINS: LocalPluginDefinition[] = [
  {
    id: 'echo-delay',
    name: 'Echo Delay',
    description: 'Tempo-synced delay with feedback and filtering',
    category: 'delay',
    processorName: 'echo-delay-processor',
    processorUrl: '/worklets/echo-delay-processor.js',
    parameters: [
      { id: 'delayTime', label: 'Delay Time', minValue: 0.01, maxValue: 2.0, defaultValue: 0.25, unit: 's' },
      { id: 'feedback', label: 'Feedback', minValue: 0, maxValue: 0.95, defaultValue: 0.4 },
      { id: 'mix', label: 'Wet/Dry', minValue: 0, maxValue: 1, defaultValue: 0.3 },
      { id: 'highCut', label: 'High Cut', minValue: 1000, maxValue: 20000, defaultValue: 8000, unit: 'Hz' },
      { id: 'lowCut', label: 'Low Cut', minValue: 20, maxValue: 2000, defaultValue: 100, unit: 'Hz' },
      { id: 'pingPong', label: 'Ping-Pong', minValue: 0, maxValue: 1, defaultValue: 0 },
    ],
  },
  {
    id: 'echo-reverb',
    name: 'Echo Reverb',
    description: 'Algorithmic reverb with early reflections and tail',
    category: 'reverb',
    processorName: 'echo-reverb-processor',
    processorUrl: '/worklets/echo-reverb-processor.js',
    parameters: [
      { id: 'roomSize', label: 'Room Size', minValue: 0.1, maxValue: 1.0, defaultValue: 0.5 },
      { id: 'decay', label: 'Decay', minValue: 0.1, maxValue: 10.0, defaultValue: 2.0, unit: 's' },
      { id: 'damping', label: 'Damping', minValue: 0, maxValue: 1, defaultValue: 0.5 },
      { id: 'predelay', label: 'Pre-delay', minValue: 0, maxValue: 100, defaultValue: 20, unit: 'ms' },
      { id: 'mix', label: 'Wet/Dry', minValue: 0, maxValue: 1, defaultValue: 0.25 },
      { id: 'width', label: 'Stereo Width', minValue: 0, maxValue: 1, defaultValue: 1 },
    ],
  },
  {
    id: 'echo-chorus',
    name: 'Echo Chorus',
    description: 'Rich stereo chorus with multiple voices',
    category: 'modulation',
    processorName: 'echo-chorus-processor',
    processorUrl: '/worklets/echo-chorus-processor.js',
    parameters: [
      { id: 'rate', label: 'Rate', minValue: 0.1, maxValue: 10.0, defaultValue: 1.0, unit: 'Hz' },
      { id: 'depth', label: 'Depth', minValue: 0, maxValue: 1, defaultValue: 0.5 },
      { id: 'mix', label: 'Wet/Dry', minValue: 0, maxValue: 1, defaultValue: 0.5 },
      { id: 'voices', label: 'Voices', minValue: 1, maxValue: 4, defaultValue: 2 },
      { id: 'spread', label: 'Stereo Spread', minValue: 0, maxValue: 1, defaultValue: 0.7 },
      { id: 'feedback', label: 'Feedback', minValue: 0, maxValue: 0.5, defaultValue: 0 },
    ],
  },
];

class LocalPluginService {
  private audioContext: AudioContext | null = null;
  private instances: Map<string, LocalPluginInstance> = new Map();
  private loadedProcessors: Set<string> = new Set();

  /**
   * Initialize with audio context
   */
  async init(ctx: AudioContext): Promise<void> {
    this.audioContext = ctx;
    console.log('[LocalPluginService] Initialized with AudioContext');
  }

  /**
   * Get all available local plugins
   */
  getAvailablePlugins(): LocalPluginDefinition[] {
    return LOCAL_PLUGINS;
  }

  /**
   * Get plugin definition by ID
   */
  getPluginDefinition(pluginId: string): LocalPluginDefinition | null {
    return LOCAL_PLUGINS.find(p => p.id === pluginId) || null;
  }

  /**
   * Load AudioWorklet processor module
   */
  private async loadProcessor(definition: LocalPluginDefinition): Promise<boolean> {
    if (!this.audioContext) {
      console.error('[LocalPluginService] No audio context');
      return false;
    }

    if (this.loadedProcessors.has(definition.processorName)) {
      return true;
    }

    try {
      await this.audioContext.audioWorklet.addModule(definition.processorUrl);
      this.loadedProcessors.add(definition.processorName);
      console.log(`[LocalPluginService] Loaded processor: ${definition.processorName}`);
      return true;
    } catch (err) {
      console.error(`[LocalPluginService] Failed to load processor ${definition.processorName}:`, err);
      return false;
    }
  }

  /**
   * Create a plugin instance
   */
  async createInstance(pluginId: string): Promise<string | null> {
    if (!this.audioContext) {
      console.error('[LocalPluginService] No audio context');
      return null;
    }

    const definition = this.getPluginDefinition(pluginId);
    if (!definition) {
      console.error(`[LocalPluginService] Unknown plugin: ${pluginId}`);
      return null;
    }

    // Load the processor if not already loaded
    const loaded = await this.loadProcessor(definition);
    if (!loaded) {
      console.error(`[LocalPluginService] Failed to load processor for ${pluginId}`);
      return null;
    }

    const instanceId = `${pluginId}-${Date.now()}`;
    const ctx = this.audioContext;

    // Create AudioWorkletNode
    let workletNode: AudioWorkletNode;
    try {
      workletNode = new AudioWorkletNode(ctx, definition.processorName, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });
    } catch (err) {
      console.error(`[LocalPluginService] Failed to create worklet node:`, err);
      return null;
    }

    // Create routing nodes
    const inputNode = ctx.createGain();
    const outputNode = ctx.createGain();
    const dryNode = ctx.createGain();

    // Initialize parameters to defaults
    const parameters: Record<string, number> = {};
    for (const param of definition.parameters) {
      parameters[param.id] = param.defaultValue;

      // Set initial parameter value on worklet
      const workletParam = workletNode.parameters.get(param.id);
      if (workletParam) {
        workletParam.setValueAtTime(param.defaultValue, ctx.currentTime);
      }
    }

    // Connect: input -> worklet -> output
    //          input -> dry -> output (for dry/wet mix handled in worklet)
    inputNode.connect(workletNode);
    workletNode.connect(outputNode);

    // Create instance
    const instance: LocalPluginInstance = {
      id: instanceId,
      pluginId,
      workletNode,
      inputNode,
      outputNode,
      dryNode,
      parameters,
      isActive: true,
    };

    this.instances.set(instanceId, instance);
    console.log(`[LocalPluginService] Created instance: ${instanceId}`);

    return instanceId;
  }

  /**
   * Get instance by ID
   */
  getInstance(instanceId: string): LocalPluginInstance | null {
    return this.instances.get(instanceId) || null;
  }

  /**
   * Get all active instances
   */
  getActiveInstances(): LocalPluginInstance[] {
    return Array.from(this.instances.values()).filter(i => i.isActive);
  }

  /**
   * Set parameter value
   */
  setParameter(instanceId: string, paramId: string, value: number): void {
    const instance = this.instances.get(instanceId);
    if (!instance || !instance.workletNode || !this.audioContext) return;

    instance.parameters[paramId] = value;

    // Update AudioWorklet parameter
    const workletParam = instance.workletNode.parameters.get(paramId);
    if (workletParam) {
      workletParam.setTargetAtTime(value, this.audioContext.currentTime, 0.02);
    }

    console.log(`[LocalPluginService] Set ${paramId}=${value} on ${instanceId}`);
  }

  /**
   * Get parameter value
   */
  getParameter(instanceId: string, paramId: string): number | null {
    const instance = this.instances.get(instanceId);
    return instance?.parameters[paramId] ?? null;
  }

  /**
   * Connect instance to audio graph
   */
  connect(instanceId: string, source: AudioNode, destination: AudioNode): boolean {
    const instance = this.instances.get(instanceId);
    if (!instance) return false;

    source.connect(instance.inputNode);
    instance.outputNode.connect(destination);
    return true;
  }

  /**
   * Disconnect instance from audio graph
   */
  disconnect(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    try {
      instance.inputNode.disconnect();
      instance.outputNode.disconnect();
      if (instance.workletNode) {
        instance.workletNode.disconnect();
      }
    } catch (e) {
      // Ignore disconnect errors
    }
  }

  /**
   * Bypass plugin (pass-through)
   */
  setBypass(instanceId: string, bypass: boolean): void {
    const instance = this.instances.get(instanceId);
    if (!instance || !this.audioContext) return;

    // For bypass, set mix to 0 (all dry)
    if (bypass) {
      const mixParam = instance.workletNode?.parameters.get('mix');
      if (mixParam) {
        mixParam.setTargetAtTime(0, this.audioContext.currentTime, 0.02);
      }
    } else {
      // Restore previous mix value
      const mixParam = instance.workletNode?.parameters.get('mix');
      if (mixParam) {
        mixParam.setTargetAtTime(instance.parameters.mix || 0.5, this.audioContext.currentTime, 0.02);
      }
    }
  }

  /**
   * Destroy a plugin instance
   */
  destroyInstance(instanceId: string): void {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    this.disconnect(instanceId);
    instance.isActive = false;
    this.instances.delete(instanceId);
    console.log(`[LocalPluginService] Destroyed instance: ${instanceId}`);
  }

  /**
   * Destroy all instances
   */
  destroyAll(): void {
    for (const instanceId of this.instances.keys()) {
      this.destroyInstance(instanceId);
    }
  }

  /**
   * Get the input node for connecting to this plugin
   */
  getInputNode(instanceId: string): AudioNode | null {
    return this.instances.get(instanceId)?.inputNode || null;
  }

  /**
   * Get the output node for connecting from this plugin
   */
  getOutputNode(instanceId: string): AudioNode | null {
    return this.instances.get(instanceId)?.outputNode || null;
  }
}

export const localPluginService = new LocalPluginService();
