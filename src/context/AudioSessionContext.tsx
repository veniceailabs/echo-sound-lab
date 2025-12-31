/**
 * CENTRALIZED AUDIO SESSION STATE
 *
 * Replaces scattered useState calls across App.tsx
 * Single source of truth for:
 * - Current audio (original + processed)
 * - Analysis results
 * - Applied actions
 * - Processing state
 */

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { AudioBuffer } from 'web-audio-api';
import { ProcessingAction, AnalysisResult, AudioMetrics } from '../types';

export interface AudioSession {
  // File Info
  fileName: string | null;

  // Audio Buffers
  originalBuffer: AudioBuffer | null;
  processedBuffer: AudioBuffer | null;

  // Analysis
  analysisResult: AnalysisResult | null;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;

  // Actions / Processing
  actions: ProcessingAction[];                    // All recommendations
  appliedActionIds: string[];                     // IDs of applied actions

  // State
  isAnalyzing: boolean;
  isProcessing: boolean;
  error: string | null;
}

export type AudioSessionAction =
  | { type: 'SET_FILE'; fileName: string }
  | { type: 'SET_ORIGINAL_BUFFER'; buffer: AudioBuffer }
  | { type: 'SET_PROCESSED_BUFFER'; buffer: AudioBuffer }
  | { type: 'SET_ANALYSIS'; result: AnalysisResult }
  | { type: 'SET_METRICS'; original: AudioMetrics; processed?: AudioMetrics }
  | { type: 'SET_ACTIONS'; actions: ProcessingAction[] }
  | { type: 'TOGGLE_ACTION_SELECTED'; actionId: string }
  | { type: 'APPLY_ACTION'; actionId: string }
  | { type: 'REMOVE_ACTION'; actionId: string }
  | { type: 'SET_ANALYZING'; isAnalyzing: boolean }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_ERROR'; error: string | null }
  | { type: 'RESET' };

const initialState: AudioSession = {
  fileName: null,
  originalBuffer: null,
  processedBuffer: null,
  analysisResult: null,
  originalMetrics: null,
  processedMetrics: null,
  actions: [],
  appliedActionIds: [],
  isAnalyzing: false,
  isProcessing: false,
  error: null,
};

function audioSessionReducer(state: AudioSession, action: AudioSessionAction): AudioSession {
  switch (action.type) {
    case 'SET_FILE':
      return { ...state, fileName: action.fileName };

    case 'SET_ORIGINAL_BUFFER':
      return { ...state, originalBuffer: action.buffer };

    case 'SET_PROCESSED_BUFFER':
      return { ...state, processedBuffer: action.buffer };

    case 'SET_ANALYSIS':
      return { ...state, analysisResult: action.result, actions: action.result.actions || [] };

    case 'SET_METRICS':
      return {
        ...state,
        originalMetrics: action.original,
        processedMetrics: action.processed || state.processedMetrics,
      };

    case 'SET_ACTIONS':
      return { ...state, actions: action.actions };

    case 'TOGGLE_ACTION_SELECTED': {
      const updatedActions = state.actions.map(a =>
        a.id === action.actionId ? { ...a, isSelected: !a.isSelected } : a
      );
      return { ...state, actions: updatedActions };
    }

    case 'APPLY_ACTION': {
      const appliedIds = new Set(state.appliedActionIds);
      appliedIds.add(action.actionId);
      const updatedActions = state.actions.map(a =>
        a.id === action.actionId ? { ...a, isApplied: true, isSelected: false } : a
      );
      return { ...state, appliedActionIds: Array.from(appliedIds), actions: updatedActions };
    }

    case 'REMOVE_ACTION': {
      const appliedIds = new Set(state.appliedActionIds);
      appliedIds.delete(action.actionId);
      const updatedActions = state.actions.map(a =>
        a.id === action.actionId ? { ...a, isApplied: false } : a
      );
      return { ...state, appliedActionIds: Array.from(appliedIds), actions: updatedActions };
    }

    case 'SET_ANALYZING':
      return { ...state, isAnalyzing: action.isAnalyzing };

    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.isProcessing };

    case 'SET_ERROR':
      return { ...state, error: action.error };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

interface AudioSessionContextType {
  state: AudioSession;
  dispatch: React.Dispatch<AudioSessionAction>;
  // Convenience functions
  setFile: (fileName: string) => void;
  setOriginalBuffer: (buffer: AudioBuffer) => void;
  setProcessedBuffer: (buffer: AudioBuffer) => void;
  setAnalysis: (result: AnalysisResult) => void;
  setMetrics: (original: AudioMetrics, processed?: AudioMetrics) => void;
  toggleActionSelected: (actionId: string) => void;
  applyAction: (actionId: string) => void;
  removeAction: (actionId: string) => void;
  setAnalyzing: (isAnalyzing: boolean) => void;
  setProcessing: (isProcessing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const AudioSessionContext = createContext<AudioSessionContextType | null>(null);

export const AudioSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(audioSessionReducer, initialState);

  const setFile = useCallback((fileName: string) => {
    dispatch({ type: 'SET_FILE', fileName });
  }, []);

  const setOriginalBuffer = useCallback((buffer: AudioBuffer) => {
    dispatch({ type: 'SET_ORIGINAL_BUFFER', buffer });
  }, []);

  const setProcessedBuffer = useCallback((buffer: AudioBuffer) => {
    dispatch({ type: 'SET_PROCESSED_BUFFER', buffer });
  }, []);

  const setAnalysis = useCallback((result: AnalysisResult) => {
    dispatch({ type: 'SET_ANALYSIS', result });
  }, []);

  const setMetrics = useCallback((original: AudioMetrics, processed?: AudioMetrics) => {
    dispatch({ type: 'SET_METRICS', original, processed });
  }, []);

  const toggleActionSelected = useCallback((actionId: string) => {
    dispatch({ type: 'TOGGLE_ACTION_SELECTED', actionId });
  }, []);

  const applyAction = useCallback((actionId: string) => {
    dispatch({ type: 'APPLY_ACTION', actionId });
  }, []);

  const removeAction = useCallback((actionId: string) => {
    dispatch({ type: 'REMOVE_ACTION', actionId });
  }, []);

  const setAnalyzing = useCallback((isAnalyzing: boolean) => {
    dispatch({ type: 'SET_ANALYZING', isAnalyzing });
  }, []);

  const setProcessing = useCallback((isProcessing: boolean) => {
    dispatch({ type: 'SET_PROCESSING', isProcessing });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', error });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const value: AudioSessionContextType = {
    state,
    dispatch,
    setFile,
    setOriginalBuffer,
    setProcessedBuffer,
    setAnalysis,
    setMetrics,
    toggleActionSelected,
    applyAction,
    removeAction,
    setAnalyzing,
    setProcessing,
    setError,
    reset,
  };

  return <AudioSessionContext.Provider value={value}>{children}</AudioSessionContext.Provider>;
};

export const useAudioSession = (): AudioSessionContextType => {
  const context = useContext(AudioSessionContext);
  if (!context) {
    throw new Error('useAudioSession must be used within AudioSessionProvider');
  }
  return context;
};
