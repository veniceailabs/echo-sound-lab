import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export interface StudioRuntimeServices {
  audioPlaybackEngine: typeof import('../services/AudioPlaybackEngine').audioPlaybackEngine;
  assetRegistry: typeof import('../services/AssetRegistry').assetRegistry;
  aiAgentService: typeof import('../services/AIAgentService').aiAgentService;
  offlineRenderService: typeof import('../services/OfflineRenderService').offlineRenderService;
  executionService: typeof import('../services/ExecutionService').executionService;
  ExecutionBridge: typeof import('../services/ExecutionBridge').ExecutionBridge;
}

interface StudioEngineContextValue {
  services: StudioRuntimeServices | null;
  isReady: boolean;
  isLoading: boolean;
  error: Error | null;
}

const StudioEngineContext = createContext<StudioEngineContextValue | null>(null);

let studioServicesPromise: Promise<StudioRuntimeServices> | null = null;

async function loadStudioRuntimeServices(): Promise<StudioRuntimeServices> {
  if (!studioServicesPromise) {
    studioServicesPromise = (async () => {
      const [
        signatureProviderModule,
        audioPlaybackEngineModule,
        assetRegistryModule,
        aiAgentServiceModule,
        offlineRenderServiceModule,
        executionServiceModule,
        executionBridgeModule,
      ] = await Promise.all([
        import('../../action-authority/src/action-authority/audit/SignatureProvider'),
        import('../services/AudioPlaybackEngine'),
        import('../services/AssetRegistry'),
        import('../services/AIAgentService'),
        import('../services/OfflineRenderService'),
        import('../services/ExecutionService'),
        import('../services/ExecutionBridge'),
      ]);

      signatureProviderModule.initializeSignatureProvider();

      return {
        audioPlaybackEngine: audioPlaybackEngineModule.audioPlaybackEngine,
        assetRegistry: assetRegistryModule.assetRegistry,
        aiAgentService: aiAgentServiceModule.aiAgentService,
        offlineRenderService: offlineRenderServiceModule.offlineRenderService,
        executionService: executionServiceModule.executionService,
        ExecutionBridge: executionBridgeModule.ExecutionBridge,
      };
    })();
  }

  return studioServicesPromise;
}

export const StudioEngineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [services, setServices] = useState<StudioRuntimeServices | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = () => {
      void loadStudioRuntimeServices()
        .then((loaded) => {
          if (cancelled) return;
          setServices(loaded);
        })
        .catch((loadError) => {
          if (cancelled) return;
          setError(loadError instanceof Error ? loadError : new Error(String(loadError)));
        });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const callbackId = window.requestIdleCallback(() => start(), { timeout: 250 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback?.(callbackId);
      };
    }

    const timeoutId = window.setTimeout(start, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

  const value = useMemo<StudioEngineContextValue>(() => ({
    services,
    isReady: services !== null,
    isLoading: services === null && error === null,
    error,
  }), [error, services]);

  return (
    <StudioEngineContext.Provider value={value}>
      {children}
    </StudioEngineContext.Provider>
  );
};

export function useStudioEngine() {
  const context = useContext(StudioEngineContext);
  if (!context) {
    throw new Error('useStudioEngine must be used within a StudioEngineProvider');
  }
  return context;
}
