import { AnimateArtRequest, HookAsset, HookStatus } from '../types';
import { postJson } from './backendApi';
import { INTEGRATION_FLAGS } from '../config/integrationFlags';

const buildHookId = () => `hook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDefaultTitle = (index: number) => `Hook ${String(index + 1).padStart(2, '0')}`;

class AnimateArtService {
  private hooks: HookAsset[] = [];
  private mockMode: boolean;

  constructor() {
    this.mockMode = (import.meta.env.VITE_ANIMATE_ART_MOCK || '').toLowerCase() === 'true';
  }

  getHooks(): HookAsset[] {
    return [...this.hooks];
  }

  async generateHooks(request: AnimateArtRequest, count: number = 1): Promise<HookAsset[]> {
    if (!this.isConfigured() || this.mockMode) {
      return this.generateHooksMock(request, count);
    }

    try {
      const data = await postJson<any>('/api/proxy/animate-art/hooks', {
          song_id: request.songId,
          source_image_url: request.sourceImageUrl,
          preview_url: request.previewUrl,
          prompt: request.prompt,
          style: request.style,
          count,
          duration_seconds: request.durationSeconds ?? 12
        });
      const hooks = (data.hooks || data.assets || []).map((item: any, index: number) => ({
        id: item.id || buildHookId(),
        title: item.title || getDefaultTitle(this.hooks.length + index),
        status: (item.status as HookStatus) || 'ready',
        createdAt: item.createdAt || new Date().toISOString(),
        durationSeconds: item.durationSeconds || request.durationSeconds || 12,
        previewUrl: item.previewUrl || request.previewUrl,
        imageUrl: item.imageUrl || request.sourceImageUrl
      }));

      if (hooks.length === 0) {
        return this.generateHooksMock(request, count);
      }

      this.hooks = [...hooks, ...this.hooks];
      return hooks;
    } catch (error) {
      console.warn('[AnimateArt] Remote render failed, falling back to mock:', error);
      return this.generateHooksMock(request, count);
    }
  }

  private isConfigured(): boolean {
    return INTEGRATION_FLAGS.ENABLE_ANIMATE_ART;
  }

  private async generateHooksMock(request: AnimateArtRequest, count: number = 1): Promise<HookAsset[]> {
    const duration = request.durationSeconds ?? 12;
    const createdAt = new Date().toISOString();

    const pendingHooks: HookAsset[] = Array.from({ length: count }).map((_, index) => ({
      id: buildHookId(),
      title: getDefaultTitle(this.hooks.length + index),
      status: 'rendering',
      createdAt,
      durationSeconds: duration,
      previewUrl: request.previewUrl,
      imageUrl: request.sourceImageUrl,
    }));

    this.hooks = [...pendingHooks, ...this.hooks];

    await new Promise(resolve => setTimeout(resolve, 550));

    const finalizedHooks = pendingHooks.map(hook => ({
      ...hook,
      status: 'ready' as HookStatus,
    }));

    this.hooks = this.hooks.map(hook => {
      const updated = finalizedHooks.find(item => item.id === hook.id);
      return updated ?? hook;
    });

    return finalizedHooks;
  }
}

export const animateArtService = new AnimateArtService();
