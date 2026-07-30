declare global {
  interface Window {
    electronAPI?: {
      showOpenDialog: (options: any) => Promise<any>;
      showSaveDialog: (options: any) => Promise<any>;
      readFile: (filePath: string, encoding?: string) => Promise<any>;
      writeFile: (filePath: string, data: any) => Promise<void>;
      mkdir: (dirPath: string) => Promise<void>;
      copyFile: (src: string, dest: string) => Promise<void>;
      readDir: (dirPath: string) => Promise<{ name: string; isDirectory: boolean }[]>;
      stat: (filePath: string) => Promise<{ isDirectory: boolean; isFile: boolean; size: number; mtime: Date }>;
      getPath: (name: string) => Promise<string>;
      runOfflineLab: (command: string, cwd?: string) => Promise<{ stdout: string, stderr: string }>;
      requestMicrophoneAccess: () => Promise<boolean>;
    };

    /**
     * Native C++ audio core. Desktop-only: it is a compiled .node addon that
     * talks to the audio hardware directly, so it is absent in the browser
     * build. Always gate on isNativeAudio / isAvailable() before use.
     */
    eslNative?: {
      isAvailable: () => Promise<boolean>;
      listInputDevices: () => Promise<NativeInputDevice[]>;
      startRecording: (options: NativeRecordOptions) => Promise<NativeRecordSession>;
      recordingStatus: () => Promise<NativeRecordStatus>;
      stopRecording: () => Promise<{ frames: number; seconds: number; overruns: number }>;
      masterFile: (options: NativeMasterOptions) => Promise<NativeMasterResult>;
      processVocal: (options: NativeVocalOptions) => Promise<{ output: string; sampleRate: number; channels: number; seconds: number }>;
    };
  }
}

export interface NativeInputDevice {
  index: number;
  name: string;
  maxInputChannels: number;
  defaultSampleRate: number;
  lowInputLatencyMs: number;
  isDefaultInput: boolean;
  hostApi: string;
}

export interface NativeRecordOptions {
  path: string;
  device?: number;
  channels?: number;
  sampleRate?: number;
  framesPerBuffer?: number;
}

export interface NativeRecordSession {
  device: string;
  channels: number;
  sampleRate: number;
  inputLatencyMs: number;
  path: string;
}

export interface NativeRecordStatus {
  recording: boolean;
  frames?: number;
  seconds?: number;
  overruns?: number;
  peakDbfs?: number[];
}

export interface NativeMasterOptions {
  input: string;
  output: string;
  targetLufs?: number;
  ceiling?: number;
  saturation?: number;
  bits?: 16 | 24;
}

export interface NativeMasterResult {
  output: string;
  sampleRate: number;
  channels: number;
  seconds: number;
  integratedLufs: number;
  truePeakDbfs: number;
  loudnessRange: number;
}

export interface NativeVocalOptions {
  input: string;
  output: string;
  settings?: Record<string, number | boolean>;
  bits?: 16 | 24;
}

/** True only in the desktop build with the native addon compiled and loadable. */
export const isNativeAudio = !!window.eslNative;

export const nativeAudio = window.eslNative;

export const isDesktop = !!window.electronAPI;

export const desktopAPI = window.electronAPI || {
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true, filePath: null }),
  readFile: async () => { throw new Error('Not supported in browser'); },
  writeFile: async () => { throw new Error('Not supported in browser'); },
  mkdir: async () => { throw new Error('Not supported in browser'); },
  copyFile: async () => { throw new Error('Not supported in browser'); },
  readDir: async () => { throw new Error('Not supported in browser'); },
  stat: async () => { throw new Error('Not supported in browser'); },
  getPath: async () => { throw new Error('Not supported in browser'); },
  runOfflineLab: async () => { throw new Error('Not supported in browser'); },
  requestMicrophoneAccess: async () => true // Assume browser handles its own permissions via standard Web APIs
};
