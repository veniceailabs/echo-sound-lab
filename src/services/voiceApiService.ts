import { VoiceModel } from '../types';

const API_URL = import.meta.env.VITE_VOICE_API_URL || '';
const API_KEY = import.meta.env.VITE_VOICE_API_KEY || '';

const isConfigured = () => Boolean(API_URL && API_KEY);

const normalizeModel = (raw: any): VoiceModel => ({
  id: raw.id || raw.model_id || `vm-${Date.now()}`,
  name: raw.name || 'Voice Model',
  trainedAt: raw.trainedAt || raw.createdAt || Date.now(),
  samples: raw.samples || [],
  apiVoiceId: raw.apiVoiceId || raw.voiceId || raw.id || `voice-${Date.now()}`,
  persona: raw.persona
});

const requestJson = async (path: string, options: RequestInit = {}) => {
  const url = `${API_URL.replace(/\/$/, '')}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Voice API request failed: ${response.status}`);
  }
  return response.json();
};

export const voiceApiService = {
  isConfigured,
  async trainVoiceModel(samples: string[], name: string, persona?: string): Promise<VoiceModel> {
    const payload = await requestJson('/voice-models', {
      method: 'POST',
      body: JSON.stringify({ samples, name, persona })
    });
    return normalizeModel(payload.model || payload);
  },
  async listVoiceModels(): Promise<VoiceModel[]> {
    const payload = await requestJson('/voice-models', { method: 'GET' });
    const items = payload.models || payload.items || payload || [];
    return items.map(normalizeModel);
  },
  async deleteVoiceModel(id: string): Promise<void> {
    await requestJson(`/voice-models/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
};
