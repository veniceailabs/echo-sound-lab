/**
 * WAM 2.0 Plugin Service
 * Loads and manages Web Audio Module plugins for professional-grade DSP
 */

import { WebAudioModule, WamNode } from '@webaudiomodules/api';

// Plugin metadata interface
export interface WAMPluginInfo {
  id: string;
  name: string;
  vendor: string;
  category: 'effect' | 'instrument' | 'analyzer';
  description: string;
  thumbnail?: string;
  url: string; // URL to load plugin from
  isLoaded: boolean;
}

// Extended info with availability status
export interface WAMPluginStatus extends WAMPluginInfo {
  availability: 'unknown' | 'available' | 'unavailable' | 'loading';
  error?: string;
}

// WAM Plugin Registry — hosted on Supabase Storage (public bucket: wam-plugins)
// CORS is handled by Supabase Storage public buckets (Access-Control-Allow-Origin: *)
// To add a plugin: upload bundle to https://xaddryqbbfgzjbhwrxyl.supabase.co/storage/v1/object/public/wam-plugins/<id>/index.js
const SUPABASE_WAM_BASE = 'https://xaddryqbbfgzjbhwrxyl.supabase.co/storage/v1/object/public/wam-plugins';

export const WAM_PLUGIN_REGISTRY: WAMPluginInfo[] = [
  {
    id: 'pingpong-delay',
    name: 'PingPong Delay',
    vendor: 'Wimmics',
    category: 'effect',
    description: 'Studio-quality stereo delay with ping-pong effect',
    url: `${SUPABASE_WAM_BASE}/pingpong-delay/index.js`,
    isLoaded: false,
  },
  {
    id: 'microverb',
    name: 'Microverb',
    vendor: 'Burns Audio',
    category: 'effect',
    description: 'High-quality compact reverb for spatial processing',
    url: `${SUPABASE_WAM_BASE}/microverb/index.js`,
    isLoaded: false,
  },
  {
    id: 'graphic-eq',
    name: 'Graphic EQ',
    vendor: 'Wimmics',
    category: 'effect',
    description: 'Visual parametric equalizer for precise frequency control',
    url: `${SUPABASE_WAM_BASE}/graphic-eq/index.js`,
    isLoaded: false,
  },
  {
    id: 'de-esser',
    name: 'De-Esser',
    vendor: 'Echo Sound Lab',
    category: 'effect',
    description: 'Surgical sibilance and sharpness control for vocals & cymbals',
    url: `${SUPABASE_WAM_BASE}/de-esser/index.js`,
    isLoaded: false,
  },
  {
    id: 'nocturne-space',
    name: 'Nocturne Space',
    vendor: 'Echo Sound Lab',
    category: 'effect',
    description: 'Dark, intimate Drake-style vocal reverb. Felt, not heard.',
    url: `${SUPABASE_WAM_BASE}/nocturne-space/index.js`,
    isLoaded: false,
  },
  {
    id: 'gold-reel',
    name: 'Gold Reel',
    vendor: 'Echo Sound Lab',
    category: 'effect',
    description: 'Warm analog tape saturation. Density, not distortion.',
    url: `${SUPABASE_WAM_BASE}/gold-reel/index.js`,
    isLoaded: false,
  },
  {
    id: 'stereo-width',
    name: 'Stereo Width',
    vendor: 'Echo Sound Lab',
    category: 'effect',
    description: 'Phase-coherent stereo widening for mastering. Mono-safe.',
    url: `${SUPABASE_WAM_BASE}/stereo-width/index.js`,
    isLoaded: false,
  },
];

// Loaded plugin instances
interface LoadedPlugin {
  info: WAMPluginInfo;
  module: typeof WebAudioModule;
  instance: WebAudioModule | null;
  node: WamNode | null;
}

class WAMPluginService {
  private audioContext: AudioContext | null = null;
  private hostGroupId: string = 'echo-sound-lab';
  private hostGroupKey: string = '';
  private isInitialized: boolean = false;
  private loadedPlugins: Map<string, LoadedPlugin> = new Map();
  private availabilityCache: Map<string, { status: 'available' | 'unavailable'; error?: string }> = new Map();
  private availabilityTestInProgress: Set<string> = new Set();

  /**
   * Initialize the WAM environment
   */
  async initialize(audioContext: AudioContext): Promise<boolean> {
    if (this.isInitialized) return true;

    try {
      this.audioContext = audioContext;
      this.hostGroupKey = performance.now().toString();

      // Import WAM SDK functions
      const { addFunctionModule, initializeWamEnv, initializeWamGroup } = await import('@webaudiomodules/sdk');
      const { VERSION: apiVersion } = await import('@webaudiomodules/api');

      // Initialize WAM environment on audio worklet
      await addFunctionModule(audioContext.audioWorklet, initializeWamEnv, apiVersion);

      // Initialize host group
      await addFunctionModule(
        audioContext.audioWorklet,
        initializeWamGroup,
        this.hostGroupId,
        this.hostGroupKey
      );

      this.isInitialized = true;
      console.log('[WAMPluginService] WAM environment initialized');
      return true;
    } catch (error) {
      console.error('[WAMPluginService] Failed to initialize WAM environment:', error);
      return false;
    }
  }

  /**
   * Get list of available plugins
   */
  getAvailablePlugins(): WAMPluginInfo[] {
    return WAM_PLUGIN_REGISTRY.map(plugin => ({
      ...plugin,
      isLoaded: this.loadedPlugins.has(plugin.id),
    }));
  }

  /**
   * Load a plugin by ID
   */
  async loadPlugin(pluginId: string): Promise<WebAudioModule | null> {
    if (!this.audioContext || !this.isInitialized) {
      console.error('[WAMPluginService] Not initialized');
      return null;
    }

    const pluginInfo = WAM_PLUGIN_REGISTRY.find(p => p.id === pluginId);
    if (!pluginInfo) {
      console.error(`[WAMPluginService] Plugin not found: ${pluginId}`);
      return null;
    }

    // Check if already loaded
    const existing = this.loadedPlugins.get(pluginId);
    if (existing?.instance) {
      return existing.instance;
    }

    try {
      console.log(`[WAMPluginService] Loading plugin: ${pluginInfo.name}`);

      // Fetch the WAM plugin module as text
      const response = await fetch(pluginInfo.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch plugin: HTTP ${response.status}`);
      }

      const pluginCode = await response.text();

      // Create a module using dynamic import from a blob URL
      const blob = new Blob([pluginCode], { type: 'application/javascript' });
      const moduleUrl = URL.createObjectURL(blob);

      // Import the module from the blob URL
      const imported = await import(/* @vite-ignore */ moduleUrl);
      const WAMClass = imported.default as typeof WebAudioModule;

      // Clean up the blob URL
      URL.revokeObjectURL(moduleUrl);

      // Verify it's a valid WAM
      if (!WAMClass || typeof WAMClass !== 'function') {
        throw new Error('Invalid WAM module - must export WebAudioModule class as default');
      }

      // Create instance
      const instance = await WAMClass.createInstance(
        this.hostGroupId,
        this.audioContext,
        {}
      );

      // Store loaded plugin
      this.loadedPlugins.set(pluginId, {
        info: pluginInfo,
        module: WAMClass,
        instance,
        node: instance.audioNode as WamNode,
      });

      console.log(`[WAMPluginService] Plugin loaded: ${pluginInfo.name}`);
      return instance;
    } catch (error) {
      console.error(`[WAMPluginService] Failed to load plugin ${pluginId}:`, error);
      return null;
    }
  }

  /**
   * Get audio node for a loaded plugin
   */
  getPluginNode(pluginId: string): AudioNode | null {
    const plugin = this.loadedPlugins.get(pluginId);
    return plugin?.node || null;
  }

  /**
   * Get plugin instance
   */
  getPluginInstance(pluginId: string): WebAudioModule | null {
    return this.loadedPlugins.get(pluginId)?.instance || null;
  }

  /**
   * Set a parameter on a loaded plugin
   */
  async setPluginParameter(pluginId: string, paramId: string, value: number): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return false;

    try {
      const paramInfo = await plugin.instance.audioNode.getParameterInfo(paramId);
      if (paramInfo) {
        // Use type assertion for WAM parameter API
        await (plugin.instance.audioNode as any).setParameterValues({ [paramId]: { value } });
        return true;
      }
    } catch (error) {
      console.error(`[WAMPluginService] Failed to set parameter:`, error);
    }
    return false;
  }

  /**
   * Get all parameters for a loaded plugin
   */
  async getPluginParameters(pluginId: string): Promise<Record<string, any> | null> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return null;

    try {
      const paramInfo = await plugin.instance.audioNode.getParameterInfo();
      const paramValues = await plugin.instance.audioNode.getParameterValues();
      return { info: paramInfo, values: paramValues };
    } catch (error) {
      console.error(`[WAMPluginService] Failed to get parameters:`, error);
      return null;
    }
  }

  /**
   * Open plugin GUI (if available)
   */
  async openPluginGUI(pluginId: string, container: HTMLElement): Promise<HTMLElement | null> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return null;

    try {
      const gui = await plugin.instance.createGui();
      if (gui) {
        container.appendChild(gui);
        return gui as HTMLElement;
      }
    } catch (error) {
      console.error(`[WAMPluginService] Failed to open GUI:`, error);
    }
    return null;
  }

  /**
   * Unload a plugin
   */
  async unloadPlugin(pluginId: string): Promise<void> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (plugin?.instance) {
      try {
        plugin.node?.disconnect();
        // WAM 2.0 uses destroyGui() or cleanup via audioNode
        if ((plugin.instance as any).destroyGui) {
          await (plugin.instance as any).destroyGui();
        }
      } catch (error) {
        console.error(`[WAMPluginService] Error unloading plugin:`, error);
      }
    }
    this.loadedPlugins.delete(pluginId);
  }

  /**
   * Connect plugin to audio chain
   */
  connectPlugin(pluginId: string, source: AudioNode, destination: AudioNode): boolean {
    const node = this.getPluginNode(pluginId);
    if (!node) return false;

    try {
      source.connect(node);
      node.connect(destination);
      return true;
    } catch (error) {
      console.error(`[WAMPluginService] Failed to connect plugin:`, error);
      return false;
    }
  }

  /**
   * Disconnect plugin from audio chain
   */
  disconnectPlugin(pluginId: string): boolean {
    const node = this.getPluginNode(pluginId);
    if (!node) return false;

    try {
      node.disconnect();
      return true;
    } catch (error) {
      console.error(`[WAMPluginService] Failed to disconnect plugin:`, error);
      return false;
    }
  }

  /**
   * Create a plugin chain (multiple plugins in series)
   */
  async createPluginChain(
    pluginIds: string[],
    source: AudioNode,
    destination: AudioNode
  ): Promise<AudioNode[]> {
    const nodes: AudioNode[] = [];

    let currentSource = source;
    for (const pluginId of pluginIds) {
      const node = this.getPluginNode(pluginId);
      if (node) {
        currentSource.connect(node);
        nodes.push(node);
        currentSource = node;
      }
    }

    // Connect last node to destination
    if (nodes.length > 0) {
      nodes[nodes.length - 1].connect(destination);
    } else {
      source.connect(destination);
    }

    return nodes;
  }

  /**
   * Get preset list for a plugin
   */
  async getPluginPresets(pluginId: string): Promise<string[]> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return [];

    try {
      // WAM presets are stored in state
      const state = await plugin.instance.audioNode.getState();
      return state?.presets || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Save current plugin state as preset
   */
  async savePluginPreset(pluginId: string, presetName: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return false;

    try {
      const state = await plugin.instance.audioNode.getState();
      // Store in localStorage for persistence
      const key = `wam_preset_${pluginId}_${presetName}`;
      localStorage.setItem(key, JSON.stringify(state));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Load a saved preset
   */
  async loadPluginPreset(pluginId: string, presetName: string): Promise<boolean> {
    const plugin = this.loadedPlugins.get(pluginId);
    if (!plugin?.instance) return false;

    try {
      const key = `wam_preset_${pluginId}_${presetName}`;
      const stateJson = localStorage.getItem(key);
      if (stateJson) {
        const state = JSON.parse(stateJson);
        await plugin.instance.audioNode.setState(state);
        return true;
      }
    } catch (error) {
      console.error(`[WAMPluginService] Failed to load preset:`, error);
    }
    return false;
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    for (const [pluginId] of this.loadedPlugins) {
      await this.unloadPlugin(pluginId);
    }
    this.loadedPlugins.clear();
    this.isInitialized = false;
    this.audioContext = null;
  }

  /**
   * Test if a plugin URL is reachable (HEAD request with timeout)
   */
  async testPluginAvailability(pluginId: string): Promise<{ available: boolean; error?: string }> {
    // Check cache first
    const cached = this.availabilityCache.get(pluginId);
    if (cached) {
      return { available: cached.status === 'available', error: cached.error };
    }

    // Prevent duplicate tests
    if (this.availabilityTestInProgress.has(pluginId)) {
      return { available: false, error: 'Test in progress' };
    }

    const pluginInfo = WAM_PLUGIN_REGISTRY.find(p => p.id === pluginId);
    if (!pluginInfo) {
      return { available: false, error: 'Plugin not in registry' };
    }

    this.availabilityTestInProgress.add(pluginId);

    try {
      // Use fetch with timeout to test URL reachability
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(pluginInfo.url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors',
      });

      clearTimeout(timeout);

      if (response.ok) {
        this.availabilityCache.set(pluginId, { status: 'available' });
        return { available: true };
      } else {
        const error = `HTTP ${response.status}`;
        this.availabilityCache.set(pluginId, { status: 'unavailable', error });
        return { available: false, error };
      }
    } catch (err: any) {
      // CORS errors show up as TypeError, network errors as AbortError
      const error = err.name === 'AbortError' ? 'Timeout' : (err.message || 'Network error');
      this.availabilityCache.set(pluginId, { status: 'unavailable', error });
      return { available: false, error };
    } finally {
      this.availabilityTestInProgress.delete(pluginId);
    }
  }

  /**
   * Get plugins with availability status
   */
  getPluginsWithStatus(): WAMPluginStatus[] {
    return WAM_PLUGIN_REGISTRY.map(plugin => {
      const cached = this.availabilityCache.get(plugin.id);
      const isLoaded = this.loadedPlugins.has(plugin.id);
      const isTestingNow = this.availabilityTestInProgress.has(plugin.id);

      let availability: WAMPluginStatus['availability'] = 'unknown';
      if (isTestingNow) {
        availability = 'loading';
      } else if (cached) {
        availability = cached.status;
      }

      return {
        ...plugin,
        isLoaded,
        availability,
        error: cached?.error,
      };
    });
  }

  /**
   * Test all plugins availability (lazy, non-blocking)
   */
  async testAllPluginsAvailability(): Promise<void> {
    // Test plugins one by one to avoid hammering servers
    for (const plugin of WAM_PLUGIN_REGISTRY) {
      if (!this.availabilityCache.has(plugin.id)) {
        await this.testPluginAvailability(plugin.id);
      }
    }
  }

  /**
   * Clear availability cache (useful for retry)
   */
  clearAvailabilityCache(): void {
    this.availabilityCache.clear();
  }

  /**
   * Check if WAM is initialized
   */
  isWAMInitialized(): boolean {
    return this.isInitialized;
  }
}

// Export singleton instance
export const wamPluginService = new WAMPluginService();

// ============================================================
// WAM Slot Manager — Sprint 4E
// 3 master slots + per-stem insert slots
// ============================================================

export type StemName = 'vocals' | 'drums' | 'bass' | 'other';

export interface WAMSlot {
  pluginId: string | null;
  instance: any | null;
  parameters: Record<string, number>;
  bypassed: boolean;
}

function emptySlot(): WAMSlot {
  return { pluginId: null, instance: null, parameters: {}, bypassed: false };
}

const SLOT_STORAGE_KEY = 'echo.wamSlots.v1';

interface SlotState {
  masterSlots: [WAMSlot, WAMSlot, WAMSlot];
  stemInserts: Record<StemName, WAMSlot>;
}

function loadSlotState(): SlotState {
  try {
    const raw = localStorage.getItem(SLOT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        masterSlots: parsed.masterSlots ?? [emptySlot(), emptySlot(), emptySlot()],
        stemInserts: parsed.stemInserts ?? {
          vocals: emptySlot(),
          drums: emptySlot(),
          bass: emptySlot(),
          other: emptySlot(),
        },
      };
    }
  } catch { /* ignore */ }
  return {
    masterSlots: [emptySlot(), emptySlot(), emptySlot()],
    stemInserts: {
      vocals: emptySlot(),
      drums: emptySlot(),
      bass: emptySlot(),
      other: emptySlot(),
    },
  };
}

function persistSlotState(state: SlotState): void {
  try {
    // Strip non-serializable instance refs before saving
    const serializable: SlotState = {
      masterSlots: state.masterSlots.map(s => ({
        ...s,
        instance: null,
      })) as SlotState['masterSlots'],
      stemInserts: Object.fromEntries(
        Object.entries(state.stemInserts).map(([k, v]) => [k, { ...v, instance: null }])
      ) as Record<StemName, WAMSlot>,
    };
    localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(serializable));
  } catch { /* ignore */ }
}

class WAMSlotManagerClass {
  private state: SlotState = loadSlotState();

  getState(): SlotState {
    return { ...this.state };
  }

  getMasterSlots(): [WAMSlot, WAMSlot, WAMSlot] {
    return [...this.state.masterSlots] as [WAMSlot, WAMSlot, WAMSlot];
  }

  getStemInserts(): Record<StemName, WAMSlot> {
    return { ...this.state.stemInserts };
  }

  /** Load a plugin into a master slot (0-2) */
  async loadPluginIntoMasterSlot(slotIndex: 0 | 1 | 2, pluginId: string): Promise<boolean> {
    // Unload existing if present
    const existing = this.state.masterSlots[slotIndex];
    if (existing.pluginId) {
      await this.unloadMasterSlot(slotIndex);
    }

    const instance = await wamPluginService.loadPlugin(pluginId);
    if (!instance) return false;

    this.state.masterSlots[slotIndex] = {
      pluginId,
      instance,
      parameters: {},
      bypassed: false,
    };
    persistSlotState(this.state);
    return true;
  }

  /** Unload a master slot */
  async unloadMasterSlot(slotIndex: 0 | 1 | 2): Promise<void> {
    const slot = this.state.masterSlots[slotIndex];
    if (slot.pluginId) {
      await wamPluginService.unloadPlugin(slot.pluginId);
    }
    this.state.masterSlots[slotIndex] = emptySlot();
    persistSlotState(this.state);
  }

  /** Load a plugin into a stem insert slot */
  async loadPluginIntoStemInsert(stem: StemName, pluginId: string): Promise<boolean> {
    const existing = this.state.stemInserts[stem];
    if (existing.pluginId) {
      await this.unloadStemInsert(stem);
    }

    const instance = await wamPluginService.loadPlugin(pluginId);
    if (!instance) return false;

    this.state.stemInserts[stem] = {
      pluginId,
      instance,
      parameters: {},
      bypassed: false,
    };
    persistSlotState(this.state);
    return true;
  }

  /** Unload a stem insert slot */
  async unloadStemInsert(stem: StemName): Promise<void> {
    const slot = this.state.stemInserts[stem];
    if (slot.pluginId) {
      await wamPluginService.unloadPlugin(slot.pluginId);
    }
    this.state.stemInserts[stem] = emptySlot();
    persistSlotState(this.state);
  }

  /** Set a parameter on a master slot */
  async setMasterSlotParameter(slotIndex: 0 | 1 | 2, paramId: string, value: number): Promise<void> {
    const slot = this.state.masterSlots[slotIndex];
    if (!slot.pluginId) return;
    await wamPluginService.setPluginParameter(slot.pluginId, paramId, value);
    this.state.masterSlots[slotIndex].parameters[paramId] = value;
    persistSlotState(this.state);
  }

  /** Bypass / un-bypass a master slot */
  bypassMasterSlot(slotIndex: 0 | 1 | 2, bypassed: boolean): void {
    this.state.masterSlots[slotIndex].bypassed = bypassed;
    persistSlotState(this.state);
  }

  /** Bypass / un-bypass a stem insert */
  bypassStemInsert(stem: StemName, bypassed: boolean): void {
    this.state.stemInserts[stem].bypassed = bypassed;
    persistSlotState(this.state);
  }
}

export const wamSlotManager = new WAMSlotManagerClass();
