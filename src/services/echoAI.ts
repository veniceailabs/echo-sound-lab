/**
 * echoAI.ts — Persistent Echo assistant engine
 *
 * Routing: Nexus Engine -> Ollama -> local deterministic fallback
 * Context-aware: knows app state, track metrics, current settings
 */

import { AppState } from '../types';
import type { AudioMetrics, ProcessingConfig } from '../types';

const NEXUS_ENGINE_CHAT_URL =
  (import.meta.env.VITE_NEXUS_ENGINE_CHAT_URL as string | undefined)?.trim() ||
  '/api/proxy/nexus/chat';
const NEXUS_ENGINE_SETTINGS_URL =
  (import.meta.env.VITE_NEXUS_ENGINE_SETTINGS_URL as string | undefined)?.trim() ||
  '/api/proxy/nexus/settings';
const NEXUS_ENGINE_MODEL =
  (import.meta.env.VITE_NEXUS_ENGINE_MODEL as string | undefined)?.trim() ||
  'llama3.2:3b';

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const OLLAMA_MODELS = ['qwen2.5-coder:14b', 'llama3.2:3b', 'deepseek-r1:8b', 'deepseek-coder-v2:16b'];

// ─── System prompt ─────────────────────────────────────────────────────────────
const buildSystemPrompt = (ctx: EchoContext): string => {
  const stateDesc = {
    [AppState.IDLE]:       'The user may not have uploaded a track yet. Answer their question directly and help them decide what to do next.',
    [AppState.LOADING]:    'A track is being loaded/uploaded right now. Keep answers useful and calm.',
    [AppState.ANALYZING]:  'The track is being analyzed. If asked, explain what analysis is happening.',
    [AppState.PROCESSING]: 'Audio processing and mastering is actively running. Answer questions and explain the current stage.',
    [AppState.READY]:      'Mastering is complete. The user can now review results, export, or ask follow-up questions.',
    [AppState.ERROR]:      'Something went wrong. Help the user troubleshoot, but still answer the question if you can.',
  }[ctx.appState] ?? '';

  const metricsBlock = ctx.metrics ? `
CURRENT TRACK METRICS:
- Integrated LUFS: ${ctx.metrics.lufs?.integrated?.toFixed(1) ?? 'unknown'}
- True Peak: ${ctx.metrics.lufs?.truePeak?.toFixed(1) ?? 'unknown'} dBTP
- Loudness Range: ${ctx.metrics.lufs?.loudnessRange?.toFixed(1) ?? 'unknown'} LU
- Dynamic Range: ${ctx.metrics.dynamicRange?.toFixed(1) ?? 'unknown'} dB
- Stereo Width: ${((ctx.metrics as any).advancedMetrics?.stereoWidth ?? 'unknown')}
- Track: "${ctx.trackName ?? 'unknown'}"
` : '';

  const configBlock = ctx.config ? `
CURRENT PROCESSING SETTINGS:
- Compression ratio: ${ctx.config.compression?.ratio ?? 'off'}
- Limiter ceiling: ${ctx.config.limiter?.ceiling ?? 'off'} dBTP
- EQ active: ${ctx.config.eq ? 'yes' : 'no'}
- Target LUFS: ${ctx.config.targetLufs ?? 'auto'}
` : '';

  return `You are Echo — a professional, general-purpose assistant embedded inside Echo Sound Lab.

Your personality: Direct, knowledgeable, never condescending. You talk like a real engineer and technical product specialist — not a chatbot. You give real opinions. You're like Rick Rubin meets a software engineer. You have taste.

CURRENT APP STATE: ${ctx.appState}
${stateDesc}
${metricsBlock}
${configBlock}

YOUR RULES:
1. Answer the user's question directly, whether it is about the app, audio, workflow, code, deployment, or general technical help
2. Keep responses SHORT (2-4 sentences max) unless the user asks for detail
3. Be specific to THEIR track when metrics are available — no generic advice
4. You can be honest: if something sounds like a problem, say it
5. You're context-aware — you know what stage they're in and respond accordingly
6. You can ask the user what they're going for (vibe, genre, reference artist) when the question is about audio or creative direction
7. NEVER say "I'm an AI" or apologize. You're Echo. You're the engineer.
8. For IDLE state: answer the question first, then offer a next step
9. For READY state: lead with one specific observation about their track if the question is about audio

APP KNOWLEDGE:
- Echo Sound Lab is a studio for mastering, mixing, timelines, stems, routing, MIDI, and autonomous workflows
- The app has both a simple one-button path and an advanced path
- The assistant should explain how the application works when asked, not just talk about audio
- The assistant can answer technical questions about the app, code, deployment, workflows, and local setup
- If the user asks about the Nexus engine, explain the current connection state plainly and suggest the next step

WHAT YOU KNOW:
- Streaming targets: Spotify = -14 LUFS, Apple Music = -16 LUFS, YouTube = -14 LUFS
- Typical mastered LUFS: -9 to -14 depending on genre
- Hip-hop/trap: -8 to -10 LUFS, heavy limiting, punchy transients
- Lo-fi/acoustic: -14 to -18 LUFS, wide dynamic range
- EDM: -6 to -10 LUFS, maximum loudness
- True Peak should never exceed -1 dBTP for streaming`;
};

// ─── Context type ──────────────────────────────────────────────────────────────
export interface EchoContext {
  appState: AppState;
  trackName?: string;
  metrics?: AudioMetrics | null;
  config?: ProcessingConfig | null;
}

// ─── Contextual proactive messages ────────────────────────────────────────────
export const getProactiveMessage = (ctx: EchoContext): string => {
  switch (ctx.appState) {
    case AppState.IDLE:
      return "Ask me about the app, the audio, or the workflow. If you upload a track, I can diagnose that too.";
    case AppState.LOADING:
      return "Loading your track. You can still ask me a question about the app or the audio setup.";
    case AppState.ANALYZING:
      return "Reading your mix. Ask anything while it analyzes.";
    case AppState.PROCESSING:
      return "Running it through the chain. I can still answer app or technical questions.";
    case AppState.READY: {
      const lufs = ctx.metrics?.lufs?.integrated;
      if (!lufs) return "Done. Ask me anything about your mix, the app, or the workflow.";
      if (lufs > -8) return `Sitting at ${lufs.toFixed(1)} LUFS — that's loud. Let's make sure nothing's clipping.`;
      if (lufs < -18) return `${lufs.toFixed(1)} LUFS is on the quiet side. Want to push it up for streaming?`;
      return `${lufs.toFixed(1)} LUFS — solid. What platform are you targeting?`;
    }
    case AppState.ERROR:
      return "Something broke. Tell me what happened, or ask about the app and I'll help you sort it.";
    default:
      return "I'm here. Ask me anything about the app, the audio, or the workflow.";
  }
};

// ─── Ollama call ───────────────────────────────────────────────────────────────
async function callOllama(prompt: string, system: string, model: string): Promise<string> {
  const resp = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
      options: { temperature: 0.7, num_predict: 300 },
    }),
  });
  if (!resp.ok) throw new Error(`Ollama ${resp.status}`);
  const data = await resp.json();
  return (data.response ?? '').trim();
}

const buildLocalFallbackReply = (message: string, ctx: EchoContext): string => {
  const text = message.trim();
  const lower = text.toLowerCase();
  const trackLabel = ctx.trackName ? ` "${ctx.trackName}"` : '';

  if (lower.includes('what are you working on') || lower.includes('working on')) {
    switch (ctx.appState) {
      case AppState.LOADING:
        return `Loading${trackLabel || ' the track'} right now. Once it finishes, I can break down the workflow or the audio path.`;
      case AppState.ANALYZING:
        return `Analyzing${trackLabel || ' the track'} right now. I’m reading loudness, dynamics, and balance before any decisions get made.`;
      case AppState.PROCESSING:
        return `Processing${trackLabel || ' the track'} right now. The chain is active, so if you want, ask about the current stage or the target sound.`;
      case AppState.READY:
        return `The current pass is ready${trackLabel ? ` for${trackLabel}` : ''}. If you want, I can explain what ESL measured or what to adjust next.`;
      case AppState.ERROR:
        return `The current session hit an error${trackLabel ? ` on${trackLabel}` : ''}. Ask me what broke or what to try next.`;
      default:
        return `Waiting on a track right now. Drop one in, or ask me about the app, the workflow, or the signal path.`;
    }
  }

  if (lower.includes('upload') || lower.includes('how do i start') || lower.includes('how does this work')) {
    return 'Start by dropping in a WAV, MP3, FLAC, or AIFF. ESL will load it, analyze loudness and dynamics, then let you review, process, and export from the same flow.';
  }

  if (lower.includes('lufs') || lower.includes('loudness') || lower.includes('true peak')) {
    const lufs = ctx.metrics?.lufs?.integrated;
    const peak = ctx.metrics?.lufs?.truePeak;
    if (typeof lufs === 'number' || typeof peak === 'number') {
      return `Current read${trackLabel ? ` for${trackLabel}` : ''}: ${typeof lufs === 'number' ? `${lufs.toFixed(1)} LUFS` : 'LUFS unavailable'} and ${typeof peak === 'number' ? `${peak.toFixed(1)} dBTP` : 'true peak unavailable'}.`;
    }
    return 'Once the track is analyzed, I can give you the LUFS, true peak, and the likely streaming target fit.';
  }

  if (lower.includes('nexus') || lower.includes('ollama') || lower.includes('model') || lower.includes('engine')) {
    return 'The live chat path is set up to try the Nexus engine first, then fall back to the Ollama models running on this Mac. If both are unavailable, I stay in a local guidance mode instead of failing outright.';
  }

  if (ctx.appState === AppState.READY && ctx.metrics?.lufs?.integrated) {
    return `${ctx.metrics.lufs.integrated.toFixed(1)} LUFS is the main read I’d look at first${trackLabel ? ` on${trackLabel}` : ''}. If you tell me the target platform or vibe, I can give you the next move.`;
  }

  return 'I can help with the app, the workflow, the audio path, or the current track state. Ask directly and I’ll keep it specific.';
};

// ─── Main chat function ────────────────────────────────────────────────────────
export interface EchoMessage {
  id: string;
  role: 'user' | 'echo';
  text: string;
  ts: number;
}

export type EchoResponseSource = 'nexus' | 'ollama' | 'local';

export interface EchoResponse {
  text: string;
  source: EchoResponseSource;
}

type NexusMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const pickNexusModel = (settings: unknown): string => {
  if (!settings || typeof settings !== 'object') return NEXUS_ENGINE_MODEL;
  const record = settings as Record<string, unknown>;
  const candidates = [
    record.model_path,
    record.model,
    typeof record.settings === 'object' && record.settings
      ? (record.settings as Record<string, unknown>).model_path
      : '',
    typeof record.settings === 'object' && record.settings
      ? (record.settings as Record<string, unknown>).model
      : '',
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return NEXUS_ENGINE_MODEL;
};

const normalizeChatText = (value: unknown): string => {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const candidates = [
    record.text,
    record.content,
    record.message,
    record.response,
    record.output,
    record?.message && typeof record.message === 'object'
      ? (record.message as Record<string, unknown>).content
      : '',
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return '';
};

async function callNexus(
  prompt: string,
  system: string,
  history: EchoMessage[],
  model: string,
): Promise<string> {
  const geminiHistory = history.slice(-10).map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }],
  }));

  const response = await fetch('/api/proxy/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-3.1-pro-preview',
      history: geminiHistory,
      message: prompt,
      config: {
        systemInstruction: {
          parts: [{ text: system }]
        }
      }
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini proxy failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.text) return data.text;
  
  throw new Error('Empty response from Gemini proxy');
}

export async function sendToEcho(
  message: string,
  history: EchoMessage[],
  ctx: EchoContext
): Promise<EchoResponse> {
  const system = buildSystemPrompt(ctx);

  // Build conversation string for Ollama (used as fallback)
  const conversationHistory = history
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'User' : 'Echo'}: ${m.text}`)
    .join('\n');

  const fullPrompt = conversationHistory
    ? `${conversationHistory}\nUser: ${message}\nEcho:`
    : `User: ${message}\nEcho:`;

  // 1. Primary: Wire directly to Nexus Engine
  try {
    const response = await callNexus(message, system, history, 'gemini-3.1-pro-preview');
    
    if (response && response.length > 0) return { text: response, source: 'nexus' };
  } catch (err) {
    console.warn('Nexus Engine failed, falling back...', err);
  }

  // 2. Fallback: Window.ai
  try {
    if ('ai' in window && 'languageModel' in (window as any).ai) {
      const capabilities = await (window as any).ai.languageModel.capabilities();
      if (capabilities.available !== 'no') {
        const session = await (window as any).ai.languageModel.create({
          systemPrompt: system,
          temperature: 0.7,
        });
        const result = await session.prompt(fullPrompt);
        session.destroy();
        if (result && result.length > 0) return { text: result, source: 'window.ai' as any };
      }
    }
  } catch (err) {
    console.warn('window.ai fallback failed', err);
  }

  // 3. Fallback: Ollama (Only if on localhost)
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    try {
      for (const model of OLLAMA_MODELS) {
        const response = await Promise.race([
          callOllama(fullPrompt, system, model),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        if (response && response.length > 5) return { text: response, source: 'ollama' };
      }
    } catch {
      // fall through to deterministic local guidance.
    }
  }

  // 4. Last resort: Deterministic local fallback
  return { text: buildLocalFallbackReply(message, ctx), source: 'local' };
}
