import { VoiceModel } from '../types';
import { requestJson as backendRequestJson } from './backendApi';
import { INTEGRATION_FLAGS } from '../config/integrationFlags';

const isConfigured = () => INTEGRATION_FLAGS.ENABLE_PREMIUM_VOICE;

const normalizeModel = (raw: any): VoiceModel => ({
  id: raw.id || raw.model_id || `vm-${Date.now()}`,
  name: raw.name || 'Voice Model',
  trainedAt: raw.trainedAt || raw.createdAt || Date.now(),
  samples: raw.samples || [],
  apiVoiceId: raw.apiVoiceId || raw.voiceId || raw.id || `voice-${Date.now()}`,
  persona: raw.persona
});

const requestVoiceApi = async (path: string, options: RequestInit = {}) => {
  return backendRequestJson<any>(`/api/proxy${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
};

export const voiceApiService = {
  isConfigured,
  async trainVoiceModel(samples: string[], name: string, persona?: string): Promise<VoiceModel> {
    if (!isConfigured()) {
      return normalizeModel({
        id: `native-${Date.now()}`,
        name,
        persona,
        samples,
      });
    }
    const payload = await requestVoiceApi('/voice-models', {
      method: 'POST',
      body: JSON.stringify({ samples, name, persona })
    });
    return normalizeModel(payload.model || payload);
  },
  async listVoiceModels(): Promise<VoiceModel[]> {
    if (!isConfigured()) {
      return [];
    }
    const payload = await requestVoiceApi('/voice-models', { method: 'GET' });
    const items = payload.models || payload.items || payload || [];
    return items.map(normalizeModel);
  },
  async deleteVoiceModel(id: string): Promise<void> {
    if (!isConfigured()) return;
    await requestVoiceApi(`/voice-models/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};
