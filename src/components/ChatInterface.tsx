import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Internal knowledge base — wired to app context at runtime via props
// (props are optional so it renders safely even without context)
export interface ChatInterfaceProps {
  currentLufs?: number | null;
  currentTruePeak?: number | null;
  currentTrackTitle?: string | null;
  currentPhase?: string | null;
  hasReference?: boolean;
  albumTrackCount?: number | null;
  eliteProfile?: string | null;
}

const SYSTEM_CONTEXT = `You are Echo, the built-in AI assistant inside Echo Sound Lab (ESL) — a professional-grade, browser-based mixing and mastering environment built for independent artists and producers who are serious about achieving Grammy-level results.

You know everything about:
- The ESL signal chain: intake conditioning → dynamic EQ → compression → stereo imaging → saturation → limiting → true-peak control
- Album Mode: sequencing, Authority Engine, Album Fix Queue, DDP Prep export with .cue sheet
- Elite Engineer Profiles: Dr. Dre (Surgical Punch), Noah "40" Shebib (Submerged), Ryan Lewis (Macro-Dynamic), Manny Marroquin (Colorful Depth)
- DSP math: LUFS, true peak (dBTP), crest factor, LUFs integrated, RMS, HPSS stem separation, STFT, Wiener masks
- Workflow: drop audio → analyze → reference match → choose Elite Profile → process → verify → export
- Album workflow: multi-file drop → sequence → Authority Review (Fix Queue) → Batch ZIP export with .cue + DDP prep folder

Your tone: direct, technical, and confident. Think of yourself as Dre's engineer booth — you tell the artist exactly what the track needs, no fluff.

Keep answers under 200 words unless asked to go deeper.`;

function buildPrompt(userMsg: string, props: ChatInterfaceProps): string {
  const ctx: string[] = [];
  if (props.currentTrackTitle) ctx.push(`Active track: "${props.currentTrackTitle}"`);
  if (props.currentLufs != null) ctx.push(`Current LUFS: ${props.currentLufs.toFixed(1)}`);
  if (props.currentTruePeak != null) ctx.push(`True Peak: ${props.currentTruePeak.toFixed(1)} dBTP`);
  if (props.currentPhase) ctx.push(`App phase: ${props.currentPhase}`);
  if (props.hasReference) ctx.push('Reference track: loaded');
  if (props.albumTrackCount) ctx.push(`Album tracks loaded: ${props.albumTrackCount}`);
  if (props.eliteProfile) ctx.push(`Elite profile: ${props.eliteProfile}`);
  
  const ctxStr = ctx.length ? `\n\n[Live Session State]\n${ctx.join('\n')}` : '';
  return `${SYSTEM_CONTEXT}${ctxStr}\n\nUser: ${userMsg}\n\nEcho:`;
}

// Local AI inference using window.ai (Chrome built-in) or fallback to heuristic answers
async function getAIResponse(prompt: string, userMsg: string, props: ChatInterfaceProps): Promise<string> {
  // Try Chrome Built-in AI first (Gemini Nano)
  if ('ai' in window && (window as any).ai?.languageModel) {
    try {
      const session = await (window as any).ai.languageModel.create({
        systemPrompt: SYSTEM_CONTEXT,
      });
      const resp = await session.prompt(userMsg);
      session.destroy();
      return resp;
    } catch (e) {
      // fall through to heuristic
    }
  }

  // Heuristic fallback — knowledge-based response engine
  return heuristicResponse(userMsg.toLowerCase(), props);
}

function heuristicResponse(msg: string, props: ChatInterfaceProps): string {
  const lufs = props.currentLufs;
  const peak = props.currentTruePeak;
  const title = props.currentTrackTitle;

  // Loudness questions
  if (/lufs|loudness|volume|loud/.test(msg)) {
    if (lufs != null) {
      const diff = lufs - (-14);
      if (diff > 2) return `Your integrated LUFS is ${lufs.toFixed(1)} — ${diff.toFixed(1)} LU hot for Spotify/Apple Music target of -14 LUFS. The limiter is catching it. Pull back the input trim or loosen the compression ratio before hitting the ceiling harder.`;
      if (diff < -3) return `You're at ${lufs.toFixed(1)} LUFS — ${Math.abs(diff).toFixed(1)} LU quiet for streaming. Push the output trim or tighten the comp. Don't just slam the limiter.`;
      return `You're sitting at ${lufs.toFixed(1)} LUFS — right in the pocket for streaming. Spotify normalizes to -14, Apple to -16. You have headroom.`;
    }
    return 'Drop a track and I can give you the exact LUFS. Streaming platforms normalize to -14 LUFS (Spotify), -16 (Apple Music), -23 (broadcast).';
  }

  // True peak questions
  if (/peak|clip|clipping|true peak|ceiling/.test(msg)) {
    if (peak != null) {
      if (peak > -1) return `True peak at ${peak.toFixed(1)} dBTP is over the -1 dBTP streaming ceiling. Anything above -1 gets clipped on encode. Tighten the true peak limiter now.`;
      return `True peak at ${peak.toFixed(1)} dBTP — clean. Stays under the -1 dBTP streaming ceiling for MP3/AAC encode.`;
    }
    return 'True peak ceiling for streaming is -1 dBTP. For broadcast it is -3 dBTP. The ESL true peak limiter enforces this at render.';
  }

  // Elite profile questions
  if (/dre|punch|surgical|bass|sub|mono/.test(msg)) {
    return `Dre's "Surgical Punch" profile: sub-bass anchored to mono below 80Hz (locks the low end for clubs), parallel transient expansion on kick/snare attacks, -1.5 dB dynamic pocket carved at 300 Hz so the vocal sits forward, slow-attack VCA glue comp at -4 dB threshold. Select it in the Elite Profile menu.`;
  }
  if (/40|drake|atmospheric|underwater|submerged/.test(msg)) {
    return `"40" Shebib profile: 4kHz low-pass on the instrumental (the classic OVO underwater sound), synthetic sub-harmonic exciter below 40Hz, -3 dB mid-range duck at 1.5kHz on the beat to contrast with an upfront, fast-attack-compressed vocal. Moody and wide.`;
  }
  if (/manny|glue|color|warm|saturat/.test(msg)) {
    return `Manny Marroquin profile: tube saturation pushed into the Side channel for warmth without muddying the mid, SSL-style bus glue at -2.5 dB threshold with 30ms attack/auto release, 60Hz mono anchor on the sub. Makes everything feel like it was mixed through an SSL 4000.`;
  }
  if (/ryan|lewis|macklemore|contrast|dynamic|verse|chorus/.test(msg)) {
    return `Ryan Lewis profile: extreme macro-dynamic contrast. Quiet verse → explosive chorus using mid-high harmonic saturation that only kicks in during loud sections. Side channel gets +2.5 dB extra width. VCA comp at 4:1 with 10ms attack/300ms release for maximum pump on the hook.`;
  }

  // Album mode questions
  if (/album|ddp|cue|sequence|master.*album|album.*master/.test(msg)) {
    return `Album Mode activates when you drop multiple tracks at once. The Authority Engine runs cross-track loudness analysis, flags any outliers more than 2 LU from the album average, and checks phase correlation between adjacent tracks. Export generates a ZIP with mastered WAVs, a frame-accurate .cue sheet with your custom gaps, and a DDP prep folder ready for Disc Makers or digital distribution.`;
  }

  // Stem/mix questions
  if (/stem|vocal|beat|instrumental|separate|hpss/.test(msg)) {
    return `ESL's HPSS stem separator uses Short-Time Fourier Transform with Wiener soft masking to split a 2-track into harmonic (melodic/vocal) and percussive components. It runs entirely in the browser — no server upload. Drop a 2-track and you get 4 stems: vocals, drums, bass, melody.`;
  }

  // Workflow questions
  if (/how|workflow|start|begin|step|process/.test(msg)) {
    const track = title ? `on "${title}"` : 'on your track';
    return `Standard ESL workflow ${track}: 1) Drop audio → intake conditioning scores your gain staging and noise floor. 2) Reference track optional but recommended. 3) Choose an Elite Profile or dial manually. 4) Authority Engine verifies the render. 5) Export WAV or DDP ZIP. For an album: drop all tracks at once to enter Album Mode.`;
  }

  // Generic fallback
  return `Ask me about your LUFS, true peak, the Elite Engineer Profiles (Dre, 40, Ryan Lewis, Manny), Album Mode workflow, stem separation, or anything in the mix chain. Drop a track and I can read the live session state.`;
}

const SUGGESTIONS = [
  'Is my loudness right for Spotify?',
  'Explain the Dre profile',
  'How do I master an album?',
  'What is true peak?',
  'Recommend a profile for hip-hop',
];

export default function ChatInterface(props: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      role: 'assistant',
      content: "I'm Echo — your in-session engineer. Ask me about your LUFS, the mix chain, Elite Profiles, or Album Mode. Drop a track and I can read the live state.",
      timestamp: Date.now(),
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return;
    const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', content: text.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const prompt = buildPrompt(text, props);
      const response = await getAIResponse(prompt, text, props);
      const aMsg: Message = { id: `a_${Date.now()}`, role: 'assistant', content: response, timestamp: Date.now() };
      setMessages(prev => [...prev, aMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: `e_${Date.now()}`, role: 'assistant', content: 'Something went wrong. Try again.', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0d0f14] text-white">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-white/5 bg-[#0a0c10]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-[0_0_12px_rgba(249,115,22,0.4)]">
            <span className="text-xs font-black text-white">E</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-white leading-tight">Echo Assistant</h3>
            <p className="text-[10px] text-white/30 leading-tight">Nexus Engine · Live Session Context</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[10px] text-emerald-400">Active</span>
          </div>
        </div>

        {/* Live state pills */}
        {(props.currentLufs != null || props.currentTrackTitle) && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {props.currentTrackTitle && (
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] text-white/50 truncate max-w-[120px]">
                🎵 {props.currentTrackTitle}
              </span>
            )}
            {props.currentLufs != null && (
              <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 rounded-full text-[10px] text-orange-300">
                {props.currentLufs.toFixed(1)} LUFS
              </span>
            )}
            {props.currentTruePeak != null && (
              <span className={`px-2 py-0.5 border rounded-full text-[10px] ${props.currentTruePeak > -1 ? 'bg-red-500/10 border-red-500/30 text-red-300' : 'bg-white/5 border-white/10 text-white/50'}`}>
                {props.currentTruePeak.toFixed(1)} dBTP
              </span>
            )}
            {props.eliteProfile && props.eliteProfile !== 'none' && (
              <span className="px-2 py-0.5 bg-violet-500/10 border border-violet-500/30 rounded-full text-[10px] text-violet-300">
                ⚡ {props.eliteProfile}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-pink-600 flex-shrink-0 flex items-center justify-center mt-0.5">
                <span className="text-[9px] font-black text-white">E</span>
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-orange-500/20 border border-orange-500/30 text-orange-50 rounded-tr-sm'
                  : 'bg-white/5 border border-white/8 text-slate-200 rounded-tl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-pink-600 flex-shrink-0 flex items-center justify-center mt-0.5">
              <span className="text-[9px] font-black text-white">E</span>
            </div>
            <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-3 py-2">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick suggestions */}
      {messages.length <= 1 && (
        <div className="flex-shrink-0 px-4 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="px-2.5 py-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-orange-500/30 rounded-full text-[11px] text-white/50 hover:text-white transition-all"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 px-3 pb-3">
        <div className="flex items-end gap-2 bg-white/5 border border-white/10 focus-within:border-orange-500/40 rounded-2xl px-3 py-2 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Echo anything about the mix…"
            rows={1}
            className="flex-1 bg-transparent resize-none text-sm text-white placeholder-white/25 outline-none leading-relaxed max-h-28"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-7 h-7 bg-orange-500 hover:bg-orange-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl flex items-center justify-center transition-all shadow-[0_0_10px_rgba(249,115,22,0.3)]"
          >
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-[9px] text-white/15 text-center mt-1.5">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
