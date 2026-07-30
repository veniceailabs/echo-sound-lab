/**
 * StudioCollabPanel ‚ÄReal-time studio session sharing
 *
 * Host: shares a 6-char room code ‚Üguests join ‚ÜWebRTC audio streams to them
 * Guest: types the code ‚Üconnects ‚Ühears host's mix in real time
 * Both: chat via data channel, see playhead + BPM synced
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  StudioCollabSession,
  createHostSession,
  createGuestSession,
  type CollabState,
  type ChatMessage,
} from '../services/studioCollabService';

interface Props {
  audioCtx?: AudioContext | null;
  onStateReceived?: (state: CollabState) => void;
  onClose: () => void;
}

type Panel = 'menu' | 'host' | 'join' | 'active';

export const StudioCollabPanel: React.FC<Props> = ({ audioCtx, onStateReceived, onClose }) => {
  const [panel, setPanel] = useState<Panel>('menu');
  const [session, setSession] = useState<StudioCollabSession | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');
  const [peerCount, setPeerCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [error, setError] = useState('');
  const peerCountRef = useRef(0);
  const sessionRef = useRef<StudioCollabSession | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const setupSessionCallbacks = useCallback((sess: StudioCollabSession) => {
    sess.onConnectionChange = (s) => {
      setStatus(s);
      if (s === 'connected') {
        peerCountRef.current = sess.connectedPeerCount;
        setPeerCount(peerCountRef.current);
      }
    };
    sess.onPeerJoined = (id) => {
      peerCountRef.current++;
      setPeerCount(peerCountRef.current);
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        from: 'System',
        text: `${id.slice(0, 6)} joined the session`,
        ts: Date.now(),
      }]);
    };
    sess.onPeerLeft = (id) => {
      peerCountRef.current = Math.max(0, peerCountRef.current - 1);
      setPeerCount(peerCountRef.current);
      setChatMessages(prev => [...prev, {
        id: `sys-${Date.now()}`,
        from: 'System',
        text: `${id.slice(0, 6)} left the session`,
        ts: Date.now(),
      }]);
    };
    sess.onChatMessage = (msg) => setChatMessages(prev => [...prev, msg]);
    sess.onStateUpdate = (state) => onStateReceived?.(state);
    sess.onRemoteStream = (_stream) => {
      // Audio auto-plays via remoteAudioEl inside the session
    };
  }, [onStateReceived]);

  const handleHost = useCallback(async () => {
    if (!audioCtx) {
      setError('Audio engine must be active before hosting. Play a track first.');
      return;
    }
    setError('');
    setStatus('connecting');
    const { session: sess, roomCode: code } = createHostSession();
    setupSessionCallbacks(sess);
    sessionRef.current = sess;
    setSession(sess);
    setRoomCode(code);
    await sess.hostSession(audioCtx);
    setPanel('active');
    setStatus('idle'); // waiting for guests
  }, [audioCtx, setupSessionCallbacks]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Room code must be 6 characters'); return; }
    setError('');
    setStatus('connecting');
    const sess = createGuestSession(code);
    setupSessionCallbacks(sess);
    sessionRef.current = sess;
    setSession(sess);
    setRoomCode(code);
    await sess.joinSession();
    setPanel('active');
  }, [joinCode, setupSessionCallbacks]);

  const handleLeave = useCallback(() => {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setSession(null);
    setPanel('menu');
    setStatus('idle');
    setPeerCount(0);
    setChatMessages([]);
    setRoomCode('');
    setJoinCode('');
  }, []);

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text || !session) return;
    session.sendChat(text, session.role === 'host' ? 'You (Host)' : 'You (Guest)');
    setChatInput('');
  }, [chatInput, session]);

  const statusColor = status === 'connected' ? 'text-emerald-400' : status === 'connecting' ? 'text-yellow-400' : status === 'disconnected' ? 'text-red-400' : 'text-slate-500';
  const statusLabel = status === 'connected' ? `${peerCount} peer${peerCount !== 1 ? 's' : ''} connected` : status === 'connecting' ? 'Connecting‚Ä¶' : status === 'disconnected' ? 'Disconnected' : 'Waiting‚Ä¶';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      className="bg-slate-950/98 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ width: 340, maxHeight: 520 }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-yellow-400' : 'bg-slate-600'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${status === 'connected' ? 'bg-emerald-400' : status === 'connecting' ? 'bg-yellow-400' : 'bg-slate-600'}`} />
          </span>
        </div>
        <span className="text-xs font-bold text-slate-200 flex-1">Live Session</span>
        {panel === 'active' && (
          <span className={`text-[10px] font-mono ${statusColor}`}>{statusLabel}</span>
        )}
        <button onClick={onClose} className="text-slate-600 hover:text-slate-300 text-xs transition-colors ml-2">‚úï</button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">

          {/* Menu */}
          {panel === 'menu' && (
            <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 flex flex-col gap-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Record, mix, and master together in real time. Host shares your session ‚Äguests hear your mix live as you work.
              </p>
              <motion.button
                onClick={() => setPanel('host')}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30 text-orange-300 font-bold text-sm uppercase tracking-wider hover:border-orange-400/50 transition-all"
              >
                Host a Session
              </motion.button>
              <motion.button
                onClick={() => setPanel('join')}
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-sm uppercase tracking-wider hover:border-cyan-400/50 transition-all"
              >
                Join a Session
              </motion.button>
              <p className="text-[10px] text-slate-700 text-center mt-1">
                Peer-to-peer ¬No latency servers ¬Audio streams directly
              </p>
            </motion.div>
          )}

          {/* Host setup */}
          {panel === 'host' && (
            <motion.div key="host" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 flex flex-col gap-4">
              <p className="text-[11px] text-slate-400">
                You'll get a 6-character room code to share with collaborators. They'll hear your mix in real time and you can chat while recording.
              </p>
              <p className="text-[10px] text-yellow-400/70 bg-yellow-950/30 border border-yellow-500/20 rounded-lg px-3 py-2">
                Tip: Start playing audio before hosting so guests can hear your session immediately.
              </p>
              {error && <p className="text-[10px] text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setPanel('menu')} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-500 text-sm hover:text-slate-300 transition-colors">Back</button>
                <motion.button onClick={handleHost} disabled={status === 'connecting'}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-300 font-bold text-sm disabled:opacity-40 hover:bg-orange-500/30 transition-all">
                  {status === 'connecting' ? 'Starting‚Ä¶' : 'Start Session'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Join setup */}
          {panel === 'join' && (
            <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 flex flex-col gap-4">
              <p className="text-[11px] text-slate-400">Enter the 6-character room code from the session host.</p>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="ABC123"
                maxLength={6}
                className="w-full bg-black/40 border border-white/[0.08] rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold text-cyan-300 tracking-[0.3em] focus:outline-none focus:border-cyan-500/40 placeholder:text-slate-700 placeholder:tracking-[0.3em]"
                autoFocus
              />
              {error && <p className="text-[10px] text-red-400">{error}</p>}
              <div className="flex gap-2">
                <button onClick={() => setPanel('menu')} className="flex-1 py-2.5 rounded-xl border border-white/[0.08] text-slate-500 text-sm hover:text-slate-300 transition-colors">Back</button>
                <motion.button onClick={handleJoin} disabled={status === 'connecting' || joinCode.length !== 6}
                  whileTap={{ scale: 0.97 }}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold text-sm disabled:opacity-40 hover:bg-cyan-500/30 transition-all">
                  {status === 'connecting' ? 'Connecting‚Ä¶' : 'Join'}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* Active session */}
          {panel === 'active' && session && (
            <motion.div key="active" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col h-full">

              {/* Room code */}
              <div className="px-4 py-3 border-b border-white/[0.04] flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-[9px] text-slate-600 uppercase tracking-widest mb-0.5">
                    {session.role === 'host' ? 'Share this code' : 'Joined room'}
                  </p>
                  <p className="text-xl font-mono font-bold tracking-[0.2em] text-white">{roomCode}</p>
                </div>
                {session.role === 'host' && (
                  <button
                    onClick={() => navigator.clipboard?.writeText(roomCode)}
                    className="text-[9px] text-slate-500 hover:text-slate-300 border border-white/[0.06] rounded-lg px-2 py-1 transition-colors"
                  >
                    Copy
                  </button>
                )}
                {session.role === 'guest' && (
                  <div className="text-[9px] text-slate-500">
                    {status === 'connected' ? 'üéReceiving audio' : status === 'connecting' ? '‚èWaiting for host‚Ä¶' : '‚öDisconnected'}
                  </div>
                )}
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-y-auto px-3 py-2 flex flex-col gap-1" style={{ minHeight: 160, maxHeight: 220 }}>
                {chatMessages.length === 0 && (
                  <p className="text-[10px] text-slate-700 text-center mt-4">Chat messages appear here</p>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className="flex gap-1.5 items-start">
                    <span className={`text-[9px] font-semibold flex-shrink-0 ${msg.from === 'System' ? 'text-slate-600 italic' : msg.from.startsWith('You') ? 'text-orange-400' : 'text-cyan-400'}`}>
                      {msg.from}
                    </span>
                    <span className="text-[10px] text-slate-300 flex-1">{msg.text}</span>
                    <span className="text-[8px] text-slate-700 flex-shrink-0">
                      {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="px-3 py-2 border-t border-white/[0.04] flex gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSendChat()}
                  placeholder="Type a message‚Ä¶"
                  className="flex-1 bg-black/30 border border-white/[0.06] rounded-lg px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-white/20 placeholder:text-slate-700"
                />
                <button onClick={handleSendChat}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-slate-400 text-[10px] transition-colors">
                  Send
                </button>
              </div>

              {/* Leave */}
              <div className="px-4 py-2 border-t border-white/[0.04]">
                <button onClick={handleLeave}
                  className="w-full py-2 rounded-xl border border-red-500/20 text-red-400/70 text-[10px] font-semibold uppercase tracking-wider hover:border-red-500/40 hover:text-red-400 transition-all">
                  Leave Session
                </button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </motion.div>
  );
};
