import { useEffect, useState } from 'react';

// Safari/iOS has historically surfaced non-standard AudioContext states (e.g. "interrupted").
// Keep the hook tolerant: return the raw string state so callers can handle it defensively.
export type AudioContextRuntimeState = AudioContextState | 'interrupted' | string;

export function useAudioContextState(audioContext: AudioContext | null): AudioContextRuntimeState {
  const [state, setState] = useState<AudioContextRuntimeState>('closed');

  useEffect(() => {
    if (!audioContext) {
      setState('closed');
      return;
    }

    const updateState = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setState(String((audioContext as any).state) as AudioContextRuntimeState);
    };

    updateState();
    audioContext.addEventListener('statechange', updateState);
    return () => audioContext.removeEventListener('statechange', updateState);
  }, [audioContext]);

  return state;
}

