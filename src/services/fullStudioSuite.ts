import { audioEngine } from './audioEngine';
import { localPluginService } from './localPluginService';

export const FULL_STUDIO_WAM_CHAIN = [
  'de-esser',
  'graphic-eq',
  'gold-reel',
  'stereo-width',
  'pingpong-delay',
  'microverb',
  'nocturne-space'
] as const;
export const FULL_STUDIO_LOCAL_CHAIN = ['echo-chorus', 'echo-delay', 'echo-reverb'] as const;

export type FullStudioStatus = 'idle' | 'loading' | 'ready' | 'error';

const getLoadedLocalIds = () => {
  const instances = localPluginService.getActiveInstances();
  return Array.from(new Set(instances.map(instance => instance.pluginId)));
};

export const getFullStudioState = () => {
  const loadedWam = audioEngine.getWAMPluginChain();
  const loadedLocal = getLoadedLocalIds();
  const suiteLoaded = FULL_STUDIO_WAM_CHAIN.every(id => loadedWam.includes(id))
    && FULL_STUDIO_LOCAL_CHAIN.every(id => loadedLocal.includes(id));
  return { loadedWam, loadedLocal, suiteLoaded };
};

export const loadFullStudioSuite = async (): Promise<{ status: FullStudioStatus; errors: string[] }> => {
  if (!audioEngine.getBuffer()) {
    return { status: 'error', errors: ['Load a track before enabling Full Studio.'] };
  }

  const failures: string[] = [];

  for (const pluginId of audioEngine.getWAMPluginChain()) {
    try {
      await audioEngine.unloadWAMPlugin(pluginId);
    } catch (error) {
      failures.push(`Failed to unload WAM: ${pluginId}`);
    }
  }

  localPluginService.destroyAll();

  for (const pluginId of FULL_STUDIO_LOCAL_CHAIN) {
    const instanceId = await localPluginService.createInstance(pluginId);
    if (!instanceId) {
      failures.push(`Failed to load local FX: ${pluginId}`);
    }
  }

  for (const pluginId of FULL_STUDIO_WAM_CHAIN) {
    const loaded = await audioEngine.loadWAMPlugin(pluginId);
    if (!loaded) {
      failures.push(`Failed to load WAM: ${pluginId}`);
    }
  }

  return { status: failures.length ? 'error' : 'ready', errors: failures };
};

export const clearFullStudioSuite = async (): Promise<{ status: FullStudioStatus; errors: string[] }> => {
  const failures: string[] = [];

  for (const pluginId of audioEngine.getWAMPluginChain()) {
    try {
      await audioEngine.unloadWAMPlugin(pluginId);
    } catch (error) {
      failures.push(`Failed to unload WAM: ${pluginId}`);
    }
  }

  localPluginService.destroyAll();

  return { status: failures.length ? 'error' : 'idle', errors: failures };
};
