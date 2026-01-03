/**
 * RecordingManager
 * Captures the demo as it happens using browser MediaRecorder API
 * Records both video and audio output
 *
 * Output: WebM or MP4 blob that can be downloaded or shared
 */

export interface RecordingConfig {
  videoBitrate?: number;
  audioBitrate?: number;
  onProgress?: (progress: { bytesRecorded: number; duration: number }) => void;
  onComplete?: (blob: Blob) => void;
  onError?: (error: Error) => void;
}

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped';

export class RecordingManager {
  private static instance: RecordingManager;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private status: RecordingStatus = 'idle';
  private startTime: number = 0;
  private config: RecordingConfig;

  private constructor(config: RecordingConfig = {}) {
    this.config = {
      videoBitrate: 2500000, // 2.5 Mbps for good quality
      audioBitrate: 128000, // 128 kbps audio
      ...config,
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: RecordingConfig): RecordingManager {
    if (!RecordingManager.instance) {
      RecordingManager.instance = new RecordingManager(config);
    }
    return RecordingManager.instance;
  }

  /**
   * Start recording
   */
  async start(): Promise<void> {
    if (this.status !== 'idle') {
      throw new Error(`Cannot start recording while ${this.status}`);
    }

    try {
      // Get screen capture stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor',
        } as any,
        audio: false,
      });

      // Get audio from system (if available) or use silence
      let audioStream: MediaStream | null = null;
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        // If user denies audio, that's okay - we can record video only
        console.warn('Audio permission denied, recording video only');
      }

      // Combine streams
      const audioTracks = audioStream?.getAudioTracks() || [];
      const videoTracks = screenStream.getVideoTracks();

      const combinedStream = new MediaStream();
      videoTracks.forEach((track) => combinedStream.addTrack(track));
      audioTracks.forEach((track) => combinedStream.addTrack(track));

      this.stream = combinedStream;

      // Create MediaRecorder
      const mimeType = this.getSupportedMimeType();
      const options: MediaRecorderOptions = {
        mimeType,
        videoBitsPerSecond: this.config.videoBitrate,
        audioBitsPerSecond: this.config.audioBitrate,
      };

      this.mediaRecorder = new MediaRecorder(combinedStream, options);

      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);

          if (this.config.onProgress) {
            const totalBytes = this.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
            const duration = Date.now() - this.startTime;
            this.config.onProgress({
              bytesRecorded: totalBytes,
              duration,
            });
          }
        }
      };

      this.mediaRecorder.onerror = (event: MediaRecorderErrorEvent) => {
        const error = new Error(`Recording error: ${event.error}`);
        if (this.config.onError) {
          this.config.onError(error);
        }
      };

      // Start recording
      this.mediaRecorder.start(1000); // Collect data every 1 second
      this.status = 'recording';
      this.startTime = Date.now();
      this.chunks = [];

      console.log(`[RecordingManager] Recording started (${mimeType})`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.config.onError) {
        this.config.onError(err);
      }
      throw err;
    }
  }

  /**
   * Pause recording
   */
  pause(): void {
    if (this.status !== 'recording' || !this.mediaRecorder) {
      throw new Error('Recording is not active');
    }

    this.mediaRecorder.pause();
    this.status = 'paused';
    console.log('[RecordingManager] Recording paused');
  }

  /**
   * Resume recording
   */
  resume(): void {
    if (this.status !== 'paused' || !this.mediaRecorder) {
      throw new Error('Recording is not paused');
    }

    this.mediaRecorder.resume();
    this.status = 'recording';
    console.log('[RecordingManager] Recording resumed');
  }

  /**
   * Stop recording and get blob
   */
  async stop(): Promise<Blob> {
    if (this.status === 'idle') {
      throw new Error('Recording is not active');
    }

    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder not initialized'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        // Stop all tracks
        if (this.stream) {
          this.stream.getTracks().forEach((track) => track.stop());
        }

        // Create blob from chunks
        const blob = new Blob(this.chunks, {
          type: this.mediaRecorder!.mimeType,
        });

        this.status = 'stopped';
        this.chunks = [];
        this.stream = null;
        this.mediaRecorder = null;

        const duration = Date.now() - this.startTime;
        console.log(
          `[RecordingManager] Recording stopped (${blob.size} bytes, ${duration}ms)`
        );

        if (this.config.onComplete) {
          this.config.onComplete(blob);
        }

        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  /**
   * Get current recording status
   */
  getStatus(): RecordingStatus {
    return this.status;
  }

  /**
   * Get recording duration
   */
  getDuration(): number {
    if (this.status === 'idle') return 0;
    return Date.now() - this.startTime;
  }

  /**
   * Get recorded size
   */
  getSize(): number {
    return this.chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  }

  /**
   * Download recording
   */
  async downloadRecording(): Promise<void> {
    const blob = await this.stop();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo-sound-lab-demo-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Share recording blob
   */
  async shareRecording(): Promise<void> {
    const blob = await this.stop();
    const file = new File([blob], `demo-${Date.now()}.webm`, { type: blob.type });

    if (navigator.share) {
      try {
        await navigator.share({
          files: [file],
          title: 'Echo Sound Lab Demo',
          text: 'Check out this autonomous demo of Echo Sound Lab!',
        });
      } catch (error) {
        console.error('Share failed:', error);
      }
    } else {
      // Fallback: download
      await this.downloadRecording();
    }
  }

  /**
   * Get supported MIME type
   * Tries VP9 > VP8 > H264 in order of preference
   */
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    // Fallback
    return 'video/webm';
  }

  /**
   * Check if recording is supported
   */
  static isSupported(): boolean {
    return typeof MediaRecorder !== 'undefined' &&
      navigator.mediaDevices?.getDisplayMedia !== undefined;
  }
}

/**
 * Export singleton accessor
 */
export const getRecordingManager = (config?: RecordingConfig) =>
  RecordingManager.getInstance(config);
