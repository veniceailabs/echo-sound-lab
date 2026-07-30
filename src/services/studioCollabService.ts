/**
 * studioCollabService — Real-time Studio Collaboration
 *
 * Architecture:
 *   - Supabase Realtime channels act as the WebRTC signaling server
 *   - Host creates a session, gets a 6-char room code
 *   - Guests join via room code; both do SDP offer/answer + ICE exchange
 *   - Once connected, host streams their AudioContext output to guests via WebRTC
 *   - Data channel carries: playhead position, track mutes, BPM, chat messages
 *
 * No server needed — all signaling goes through Supabase pub/sub.
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type CollabRole = 'host' | 'guest';

export interface CollabMessage {
  type: 'offer' | 'answer' | 'ice' | 'state' | 'chat';
  from: string;
  to?: string; // undefined = broadcast
  payload: unknown;
}

export interface CollabState {
  playheadSec: number;
  bpm: number;
  isPlaying: boolean;
  trackMutes: Record<string, boolean>;
}

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
}

const STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

function makeRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function makePeerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ─── Session ────────────────────────────────────────────────────────────────────

export class StudioCollabSession {
  readonly roomCode: string;
  readonly peerId: string;
  readonly role: CollabRole;

  private channel: RealtimeChannel | null = null;
  private peers: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private audioDestination: MediaStream | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;

  // Callbacks
  onChatMessage: ((msg: ChatMessage) => void) | null = null;
  onStateUpdate: ((state: CollabState) => void) | null = null;
  onPeerJoined: ((peerId: string) => void) | null = null;
  onPeerLeft: ((peerId: string) => void) | null = null;
  onConnectionChange: ((status: 'connecting' | 'connected' | 'disconnected') => void) | null = null;
  onRemoteStream: ((stream: MediaStream) => void) | null = null;

  constructor(roomCode: string, role: CollabRole) {
    this.roomCode = roomCode;
    this.peerId = makePeerId();
    this.role = role;
  }

  /** Host: create room and wait for guests */
  async hostSession(audioCtx: AudioContext): Promise<void> {
    // Create a MediaStreamDestination to capture the host's output
    const dest = audioCtx.createMediaStreamDestination();
    this.audioDestination = dest.stream;
    // Caller must connect their master output to dest; expose via getHostCapture()
    this._hostCapture = dest;

    await this._joinChannel();
  }

  private _hostCapture: MediaStreamAudioDestinationNode | null = null;

  /** Returns the node the host should connect their master bus to */
  getHostCapture(): MediaStreamAudioDestinationNode | null {
    return this._hostCapture;
  }

  /** Guest: join an existing room */
  async joinSession(): Promise<void> {
    await this._joinChannel();
  }

  private async _joinChannel(): Promise<void> {
    const channelName = `studio-collab-${this.roomCode}`;
    this.channel = supabase.channel(channelName, {
      config: { presence: { key: this.peerId } },
    });

    this.channel
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        for (const presence of newPresences) {
          const joinedId = presence.key;
          if (joinedId === this.peerId) continue;
          this.onPeerJoined?.(joinedId);
          if (this.role === 'host') {
            // Host initiates offer to new guest
            this._createOffer(joinedId);
          }
        }
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const presence of leftPresences) {
          const leftId = presence.key;
          this.peers.get(leftId)?.close();
          this.peers.delete(leftId);
          this.dataChannels.delete(leftId);
          this.onPeerLeft?.(leftId);
        }
      })
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: CollabMessage }) => {
        if (payload.to && payload.to !== this.peerId) return;
        this._handleSignal(payload);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await this.channel!.track({ role: this.role });
        }
      });
  }

  private _createPeer(remotePeerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: STUN_SERVERS });
    this.peers.set(remotePeerId, pc);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this._broadcast({
          type: 'ice',
          from: this.peerId,
          to: remotePeerId,
          payload: e.candidate.toJSON(),
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') this.onConnectionChange?.('connected');
      if (state === 'disconnected' || state === 'failed') this.onConnectionChange?.('disconnected');
    };

    // Guest receives host's audio stream
    pc.ontrack = (e) => {
      if (this.role === 'guest' && e.streams[0]) {
        this.onRemoteStream?.(e.streams[0]);
        if (!this.remoteAudioEl) {
          this.remoteAudioEl = new Audio();
          this.remoteAudioEl.autoplay = true;
        }
        this.remoteAudioEl.srcObject = e.streams[0];
      }
    };

    return pc;
  }

  private async _createOffer(remotePeerId: string): Promise<void> {
    const pc = this._createPeer(remotePeerId);

    // Host adds data channel (for state sync + chat)
    const dc = pc.createDataChannel('studio');
    this._setupDataChannel(dc, remotePeerId);

    // Host adds audio track
    if (this.audioDestination) {
      for (const track of this.audioDestination.getTracks()) {
        pc.addTrack(track, this.audioDestination);
      }
    }

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this._broadcast({ type: 'offer', from: this.peerId, to: remotePeerId, payload: offer });
  }

  private async _handleSignal(msg: CollabMessage): Promise<void> {
    if (msg.type === 'offer') {
      const pc = this._createPeer(msg.from);

      pc.ondatachannel = (e) => {
        this._setupDataChannel(e.channel, msg.from);
      };

      await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this._broadcast({ type: 'answer', from: this.peerId, to: msg.from, payload: answer });
      this.onConnectionChange?.('connecting');
    }

    if (msg.type === 'answer') {
      const pc = this.peers.get(msg.from);
      if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));
    }

    if (msg.type === 'ice') {
      const pc = this.peers.get(msg.from);
      if (pc) await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
    }
  }

  private _setupDataChannel(dc: RTCDataChannel, remotePeerId: string): void {
    this.dataChannels.set(remotePeerId, dc);
    dc.onopen = () => this.onConnectionChange?.('connected');
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; payload: unknown };
        if (msg.type === 'state') this.onStateUpdate?.(msg.payload as CollabState);
        if (msg.type === 'chat') this.onChatMessage?.(msg.payload as ChatMessage);
      } catch {}
    };
  }

  private _broadcast(msg: CollabMessage): void {
    this.channel?.send({ type: 'broadcast', event: 'signal', payload: msg });
  }

  /** Send state update to all connected guests (host only) */
  broadcastState(state: CollabState): void {
    const data = JSON.stringify({ type: 'state', payload: state });
    this.dataChannels.forEach(dc => {
      if (dc.readyState === 'open') dc.send(data);
    });
  }

  /** Send a chat message to all peers */
  sendChat(text: string, fromLabel: string): void {
    const msg: ChatMessage = { id: `chat-${Date.now()}`, from: fromLabel, text, ts: Date.now() };
    const data = JSON.stringify({ type: 'chat', payload: msg });
    this.dataChannels.forEach(dc => {
      if (dc.readyState === 'open') dc.send(data);
    });
    // Also notify self
    this.onChatMessage?.(msg);
  }

  get connectedPeerCount(): number {
    return Array.from(this.peers.values()).filter(pc => pc.connectionState === 'connected').length;
  }

  destroy(): void {
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
    this.dataChannels.clear();
    this.channel?.unsubscribe();
    this.channel = null;
    this.remoteAudioEl?.pause();
    this.remoteAudioEl = null;
  }
}

/** Create a new hosted session and return it with the room code */
export function createHostSession(): { session: StudioCollabSession; roomCode: string } {
  const roomCode = makeRoomCode();
  const session = new StudioCollabSession(roomCode, 'host');
  return { session, roomCode };
}

/** Join an existing session as guest */
export function createGuestSession(roomCode: string): StudioCollabSession {
  return new StudioCollabSession(roomCode.toUpperCase(), 'guest');
}
