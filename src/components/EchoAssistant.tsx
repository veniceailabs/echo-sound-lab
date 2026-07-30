/**
 * EchoAssistant — Persistent floating AI engineer
 *
 * Always visible. Context-aware at every app stage.
 * Like Clippy but with actual taste and mastering knowledge.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppState } from '../types';
import type { AudioMetrics, ProcessingConfig } from '../types';
import { sendToEcho, getProactiveMessage, type EchoMessage, type EchoContext, type EchoResponseSource } from '../services/echoAI';

interface EchoAssistantProps {
  appState: AppState;
  trackName?: string;
  metrics?: AudioMetrics | null;
  config?: ProcessingConfig | null;
  bottomOffset?: number; // px above bottom edge
}

const ECHO_AVATAR = (
  <svg viewBox="0 0 36 36" fill="none" className="w-full h-full">
    {/* Headphone arc */}
    <circle cx="18" cy="18" r="16" fill="currentColor" opacity="0.08" />
    <path d="M8 18 a10 10 0 0 1 20 0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    {/* Left cup */}
    <rect x="5" y="17" width="5" height="8" rx="2.5" fill="currentColor" />
    {/* Right cup */}
    <rect x="26" y="17" width="5" height="8" rx="2.5" fill="currentColor" />
    {/* Center dot */}
    <circle cx="18" cy="22" r="1.5" fill="currentColor" opacity="0.6" />
  </svg>
);

export const EchoAssistant: React.FC<EchoAssistantProps> = ({
  appState,
  trackName,
  metrics,
  config,
  bottomOffset = 24,
}) => {
  const bubbleBottomOffset = bottomOffset + 236;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<EchoMessage[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [proactive, setProactive] = useState('');
  const [showBubble, setShowBubble] = useState(true);
  const [unread, setUnread] = useState(0);
  const [lastSource, setLastSource] = useState<EchoResponseSource | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevStateRef = useRef<AppState | null>(null);

  const ctx: EchoContext = { appState, trackName, metrics, config };

  // Update proactive message on state change
  useEffect(() => {
    if (prevStateRef.current === appState) return;
    prevStateRef.current = appState;

    const msg = getProactiveMessage(ctx);
    setProactive(msg);
    setShowBubble(true);

    // Auto-add state-change messages to chat history if chat is open
    if (isOpen && appState === AppState.READY && metrics) {
      const echoMsg: EchoMessage = {
        id: `state-${Date.now()}`,
        role: 'echo',
        text: msg,
        ts: Date.now(),
      };
      setMessages(prev => [...prev, echoMsg]);
    }

    // Show unread badge if chat closed
    if (!isOpen && appState !== AppState.IDLE) {
      setUnread(n => n + 1);
    }
  }, [appState]); // eslint-disable-line

  // Initial greeting
  useEffect(() => {
    const greeting: EchoMessage = {
      id: 'init',
      role: 'echo',
      text: "I'm Echo — ask me anything about the app, the audio, the workflow, or the code. If you drop a track in, I can work that too.",
      ts: Date.now(),
    };
    setMessages([greeting]);
    setProactive("Ask me anything about the app, the audio, the workflow, or the code.");
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      setShowBubble(false);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Global Keyboard Shortcut (Command+E / Ctrl+E)
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isTyping) return;

    const userMsg: EchoMessage = { id: `u-${Date.now()}`, role: 'user', text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const response = await sendToEcho(text, [...messages, userMsg], ctx);
      setLastSource(response.source);
      const echoMsg: EchoMessage = { id: `e-${Date.now()}`, role: 'echo', text: response.text, ts: Date.now() };
      setMessages(prev => [...prev, echoMsg]);
    } catch {
      setLastSource(null);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'echo',
        text: "Something went sideways. Try again.", ts: Date.now(),
      }]);
    } finally {
      setIsTyping(false);
    }
  }, [input, isTyping, messages, ctx]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Dismiss speech bubble on click outside
  const handleBubbleClick = () => {
    setIsOpen(true);
    setShowBubble(false);
  };

  const sourceLabel = lastSource === 'nexus'
    ? 'Echo AI'
    : lastSource === 'ollama'
    ? 'Ollama'
    : lastSource === 'local'
    ? 'Local'
    : 'Idle';

  const sourcePillClass = lastSource === 'nexus'
    ? 'bg-[linear-gradient(135deg,rgba(52,211,153,0.1),rgba(16,185,129,0.2))] text-emerald-300 border-emerald-500/30'
    : lastSource === 'ollama'
    ? 'bg-[linear-gradient(135deg,rgba(6,182,212,0.1),rgba(8,145,178,0.2))] text-cyan-300 border-cyan-500/30'
    : lastSource === 'local'
    ? 'bg-[linear-gradient(135deg,rgba(245,158,11,0.1),rgba(217,119,6,0.2))] text-amber-300 border-amber-500/30'
    : 'bg-white/5 text-slate-400 border-white/10';

  return (
    <>
      {/* ── Floating bubble (proactive message) ───────────────────────────── */}
      <AnimatePresence>
        {showBubble && !isOpen && proactive && (
          <motion.div
            key="bubble"
            initial={{ opacity: 0, y: 10, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="esl-floating-chrome fixed z-[200] cursor-pointer"
            style={{ bottom: `calc(${bubbleBottomOffset}px + var(--esl-safe-bottom, 0px))`, right: '20px' }}
            onClick={handleBubbleClick}
          >
            <div className="relative max-w-[260px] bg-black/60 border border-white/10 backdrop-blur-3xl rounded-2xl rounded-br-md px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.6),inset_0_1px_1px_rgba(255,255,255,0.1)]">
              <p className="text-xs text-white/90 leading-relaxed font-medium">{proactive}</p>
              {/* Tail */}
              <div className="absolute -bottom-2 right-4 w-3 h-3 bg-black/60 border-r border-b border-white/10 rotate-45 backdrop-blur-3xl shadow-[0_12px_40px_rgba(0,0,0,0.6)]" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Echo button ────────────────────────────────────────────────────── */}
      <motion.button
        onClick={() => setIsOpen(o => !o)}
        className="esl-floating-chrome fixed z-[200] flex items-center justify-center rounded-full text-orange-400 shadow-[0_12px_32px_rgba(0,0,0,0.6),inset_0_1px_2px_rgba(255,255,255,0.15)] bg-gradient-to-b from-[#2a2d36] to-[#15171b] border border-white/10 transition-all hover:text-orange-300"
        style={{
          width: 56, height: 56,
          bottom: `calc(${bottomOffset}px + var(--esl-safe-bottom, 0px))`,
          right: '24px',
        }}
        whileHover={{ scale: 1.05, filter: 'brightness(1.1)' }}
        whileTap={{ scale: 0.95 }}
        title="Echo AI Engineer"
      >
        <span className="w-8 h-8">{ECHO_AVATAR}</span>
        {unread > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[9px] font-bold text-black flex items-center justify-center">
            {unread}
          </span>
        )}
      </motion.button>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 30, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.94 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="esl-floating-chrome fixed z-[199] flex flex-col bg-black/50 border border-white/10 backdrop-blur-3xl rounded-3xl shadow-[0_32px_80px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.1)] overflow-hidden"
            style={{
              width: 'min(340px, calc(100vw - 32px))',
              height: 'min(420px, calc(100vh - 136px))',
              bottom: `calc(${bottomOffset + 76}px + var(--esl-safe-bottom, 0px))`,
              right: '24px',
            }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08] flex-shrink-0 bg-gradient-to-b from-white/[0.03] to-transparent">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500/20 to-orange-600/5 border border-orange-500/30 flex items-center justify-center text-orange-400 shadow-[inset_0_1px_2px_rgba(255,255,255,0.1)] flex-shrink-0">
                <span className="w-5 h-5">{ECHO_AVATAR}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white tracking-wide shadow-black/50 drop-shadow-sm">Echo Assistant</p>
                <p className="text-[11px] text-white/50 font-medium">
                  {appState === AppState.IDLE && 'Waiting for a track'}
                  {appState === AppState.LOADING && 'Loading...'}
                  {appState === AppState.ANALYZING && 'Analyzing your mix'}
                  {appState === AppState.PROCESSING && 'Processing...'}
                  {appState === AppState.READY && (trackName ? `Working on: ${trackName.slice(0, 24)}` : 'Ready')}
                  {appState === AppState.ERROR && 'Something went wrong'}
                </p>
              </div>
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ${sourcePillClass}`}>
                {sourceLabel}
              </div>
              {/* State pill */}
              <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border flex-shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] ${
                appState === AppState.READY
                  ? 'bg-[linear-gradient(135deg,rgba(52,211,153,0.1),rgba(16,185,129,0.2))] text-emerald-300 border-emerald-500/30'
                  : appState === AppState.IDLE
                  ? 'bg-white/5 text-slate-400 border-white/10'
                  : 'bg-[linear-gradient(135deg,rgba(249,115,22,0.1),rgba(234,88,12,0.2))] text-orange-300 border-orange-500/30'
              }`}>
                {appState}
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full hover:bg-white/10 text-white/40 hover:text-white transition-colors flex items-center justify-center flex-shrink-0 ml-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'echo' && (
                    <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center flex-shrink-0 mt-1 mr-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                      <span className="w-3.5 h-3.5">{ECHO_AVATAR}</span>
                    </div>
                  )}
                  <div className={`max-w-[88%] px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed shadow-sm font-medium ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-orange-500 to-orange-600 text-white border border-orange-400/50 rounded-tr-sm shadow-[0_2px_8px_rgba(249,115,22,0.25)]'
                      : 'bg-white/10 text-white/90 border border-white/10 rounded-tl-sm backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.2)]'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start">
                  <div className="w-6 h-6 rounded-lg bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center flex-shrink-0 mt-1 mr-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]">
                    <span className="w-3.5 h-3.5">{ECHO_AVATAR}</span>
                  </div>
                  <div className="bg-white/10 border border-white/10 rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center backdrop-blur-md shadow-[0_2px_8px_rgba(0,0,0,0.2)]">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 bg-white/60 rounded-full"
                        animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }}
                        transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Suggested prompts when READY */}
            {appState === AppState.READY && messages.length <= 2 && (
              <div className="px-4 pb-2 flex gap-1.5 flex-wrap flex-shrink-0">
                {[
                  'What platform should I target?',
                  "Is my low end too heavy?",
                  'Compare to Spotify standards',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50); }}
                    className="text-[10px] px-2.5 py-1 rounded-full border border-white/[0.08] text-slate-500 hover:text-slate-300 hover:border-white/20 transition-all bg-white/[0.02]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="p-4 pt-1 flex-shrink-0">
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2.5 shadow-[inset_0_2px_4px_rgba(0,0,0,0.2)] focus-within:bg-white/10 focus-within:border-white/20 transition-all">
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder={
                    appState === AppState.IDLE
                      ? "What are you working on?"
                      : appState === AppState.READY
                      ? "Ask about your track..."
                      : "Ask Echo anything..."
                  }
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-white/40 font-medium focus:outline-none"
                />
                <motion.button
                  onClick={handleSend}
                  disabled={!input.trim() || isTyping}
                  whileTap={{ scale: 0.9 }}
                  className="w-8 h-8 rounded-xl bg-gradient-to-b from-orange-400 to-orange-600 text-white shadow-[0_2px_8px_rgba(249,115,22,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] disabled:from-white/10 disabled:to-white/5 disabled:text-white/30 disabled:shadow-none disabled:cursor-not-allowed transition-all flex items-center justify-center flex-shrink-0"
                >
                  <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
