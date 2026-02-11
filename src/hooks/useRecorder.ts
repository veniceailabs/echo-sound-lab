import { useState, useRef, useCallback } from 'react';

export interface RecorderError {
    message: string;
    type: 'permission_denied' | 'not_supported' | 'device_error' | 'unknown';
}

export interface RecorderStartOptions {
    deviceId?: string;
    channelCount?: 1 | 2;
    onLevel?: (level: number) => void;
}

export const useRecorder = () => {
    const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'stopped'>('idle');
    const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [inputLevel, setInputLevel] = useState(0);
    const [error, setError] = useState<RecorderError | null>(null);
    const mediaRecorder = useRef<MediaRecorder | null>(null);
    const chunks = useRef<Blob[]>([]);
    const audioContext = useRef<AudioContext | null>(null);
    const analyser = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const startRecording = useCallback(async (options?: RecorderStartOptions) => {
        setError(null); // Clear previous errors
        setInputLevel(0);

        try {
            // Check if mediaDevices API is supported
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('UNSUPPORTED:Mic recording is not supported in this browser. Try Chrome, Firefox, or Edge.');
            }

            const baseAudioConstraints: MediaTrackConstraints = {
                echoCancellation: false,  // Disable to ensure raw audio comes through
                noiseSuppression: false,
                autoGainControl: false,
                sampleRate: 48000,
            };

            if (options?.deviceId) {
                baseAudioConstraints.deviceId = { exact: options.deviceId };
            }
            if (options?.channelCount) {
                baseAudioConstraints.channelCount = options.channelCount;
            }

            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: baseAudioConstraints });
            } catch (primaryErr) {
                // Browser/device mismatch fallback: drop strict routing constraints.
                const fallbackConstraints: MediaTrackConstraints = {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false,
                    sampleRate: 48000,
                };
                stream = await navigator.mediaDevices.getUserMedia({ audio: fallbackConstraints });
            }

            streamRef.current = stream;

            // Log track details
            stream.getAudioTracks().forEach(track => {
                console.log('[Recorder] Audio track:', track.label, 'Enabled:', track.enabled, 'Settings:', track.getSettings());
            });

            // Try different codecs based on browser support
            let mimeType = 'audio/webm;codecs=opus';
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/webm';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = 'audio/mp4';
            }
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = ''; // Let browser choose
            }

            console.log('[Recorder] Using mime type:', mimeType || 'browser default');

            const options = mimeType ? { mimeType } : undefined;
            mediaRecorder.current = new MediaRecorder(stream, options);
            chunks.current = [];

            console.log('[Recorder] MediaRecorder state:', mediaRecorder.current.state, 'Stream active:', stream.active);

            // Create audio context to monitor input levels AFTER MediaRecorder is created
            audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.current.createMediaStreamSource(stream);
            analyser.current = audioContext.current.createAnalyser();
            analyser.current.fftSize = 2048;
            analyser.current.smoothingTimeConstant = 0.8;
            source.connect(analyser.current);

            // Monitor audio levels continuously
            const dataArray = new Uint8Array(analyser.current.frequencyBinCount);
            let maxLevel = 0;
            const checkAudioLevel = () => {
                if (!analyser.current) return;
                analyser.current.getByteTimeDomainData(dataArray);

                // Calculate RMS level
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    const normalized = (dataArray[i] - 128) / 128;
                    sum += normalized * normalized;
                }
                const rms = Math.sqrt(sum / dataArray.length);
                const level = Math.round(rms * 100);
                const normalizedLevel = Math.max(0, Math.min(1, rms * 6));
                setInputLevel(normalizedLevel);
                options?.onLevel?.(normalizedLevel);

                if (level > maxLevel) {
                    maxLevel = level;
                    if (level > 1) {
                        console.log('[Recorder] Audio level detected:', level + '%');
                    }
                }
            };

            // Check audio every 100ms while recording
            const levelCheckInterval = setInterval(checkAudioLevel, 100);

            // Store interval reference so we can clear it on stop
            (mediaRecorder.current as any).__levelCheckInterval = levelCheckInterval;

            console.log('[Recorder] Audio stream active:', stream.active, 'Monitoring audio levels...');

            mediaRecorder.current.ondataavailable = async (e) => {
                if (e.data.size > 0) {
                    chunks.current.push(e.data);
                    console.log('[Recorder] Data chunk received:', e.data.size, 'bytes');

                    // Analyze the audio data to check if it contains actual sound
                    try {
                        const arrayBuffer = await e.data.arrayBuffer();
                        const dataView = new Uint8Array(arrayBuffer);

                        // Check for non-zero values (actual audio data vs silence)
                        let nonZeroCount = 0;
                        const sampleSize = Math.min(1000, dataView.length);
                        for (let i = 0; i < sampleSize; i++) {
                            if (dataView[i] !== 0 && dataView[i] !== 128) {
                                nonZeroCount++;
                            }
                        }
                        const audioDataPercent = Math.round((nonZeroCount / sampleSize) * 100);
                        console.log('[Recorder] Audio data variance in chunk:', audioDataPercent + '%');
                    } catch (err) {
                        // Silent fail - this is just diagnostics
                    }
                } else {
                    console.warn('[Recorder] Data chunk received but size is 0');
                }
            };

            mediaRecorder.current.onerror = (e: any) => {
                console.error('[Recorder] MediaRecorder error:', e);
                setError({
                    message: 'Recording error occurred. Please try again.',
                    type: 'device_error'
                });
            };

            mediaRecorder.current.onstop = () => {
                console.log('[Recorder] Stop event fired. Chunks collected:', chunks.current.length);

                // Clear the level check interval
                const interval = (mediaRecorder.current as any).__levelCheckInterval;
                if (interval) {
                    clearInterval(interval);
                }

                const blob = new Blob(chunks.current, { type: mimeType || 'audio/webm' });
                console.log('[Recorder] Recording stopped. Total size:', blob.size, 'bytes, Type:', blob.type);
                console.log('[Recorder] Chunks:', chunks.current.map(c => c.size));

                if (blob.size === 0 || blob.size < 100) {
                    setError({
                        message: 'Recording failed - no audio data captured. Please check microphone permissions and try again.',
                        type: 'device_error'
                    });
                    setRecordingState('idle');
                } else {
                    setAudioBlob(blob);
                    setAudioUrl(URL.createObjectURL(blob));
                    setRecordingState('stopped');
                }
                setInputLevel(0);

                // Clean up
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => {
                        console.log('[Recorder] Stopping track:', track.label);
                        track.stop();
                    });
                }
                if (audioContext.current && audioContext.current.state !== 'closed') {
                    audioContext.current.close();
                }
            };

            // Start with 1 second timeslice to get data chunks regularly
            mediaRecorder.current.start(1000);
            console.log('[Recorder] Recording started with 1s timeslice');
            setRecordingState('recording');
        } catch (err: any) {
            console.error("[Recorder] Failed to start recording:", err);
            console.error("[Recorder] Error name:", err.name);
            console.error("[Recorder] Error message:", err.message);
            console.error("[Recorder] Full error:", err);

            // Parse error and set user-friendly message
            let errorType: RecorderError['type'] = 'unknown';
            let errorMessage = 'Failed to start recording. Please try again.';

            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                errorType = 'permission_denied';
                errorMessage = 'Microphone permission denied. Please allow microphone access in your browser settings and try again.';
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                errorType = 'device_error';
                errorMessage = 'No microphone found. Please connect a microphone and try again.';
            } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
                errorType = 'device_error';
                errorMessage = 'Microphone is already in use by another application. Please close other apps using the microphone and try again.';
            } else if (err.message?.includes('UNSUPPORTED:')) {
                errorType = 'not_supported';
                errorMessage = err.message.replace('UNSUPPORTED:', '');
            } else if (err.message?.includes('InvalidStateError')) {
                errorType = 'device_error';
                errorMessage = 'Audio context error. Please refresh the page and try again.';
            }

            setError({ message: errorMessage, type: errorType });
            setRecordingState('idle');
            setInputLevel(0);
        }
    }, []);

    const stopRecording = useCallback(() => {
        console.log('[Recorder] Stop requested. Current state:', mediaRecorder.current?.state);
        if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
            mediaRecorder.current.stop();
            console.log('[Recorder] MediaRecorder.stop() called');
        }
    }, []);

    const resetRecording = useCallback(() => {
        console.log('[Recorder] Reset recording');
        setRecordingState('idle');
        setAudioBlob(null);
        setAudioUrl(null);
        setInputLevel(0);
        setError(null);
        chunks.current = [];

        // Clean up any active streams
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (audioContext.current && audioContext.current.state !== 'closed') {
            audioContext.current.close();
            audioContext.current = null;
        }
    }, []);

    return { startRecording, stopRecording, resetRecording, recordingState, audioBlob, audioUrl, error, inputLevel };
};
