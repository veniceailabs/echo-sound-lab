import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_BUILD_META } from '../generated/buildMeta';

type BuildMetaResponse = {
  buildId: string;
  version?: string;
  createdAt?: string;
};

type UseBuildUpdateNotifierResult = {
  currentBuildId: string;
  latestBuild: BuildMetaResponse | null;
  updateAvailable: boolean;
  showPrompt: boolean;
  delayUpdatePrompt: (minutes?: number) => void;
  dismissPrompt: () => void;
  updateNow: () => void;
  checkNow: () => Promise<void>;
};

const POLL_INTERVAL_MS = 120000;
const DEFAULT_DELAY_MINUTES = 45;
const DELAY_UNTIL_KEY = 'echo.updatePrompt.delayUntilMs.v1';
const DELAY_BUILD_KEY = 'echo.updatePrompt.delayBuildId.v1';

function readNumber(key: string): number {
  if (typeof window === 'undefined') return 0;
  const value = window.localStorage.getItem(key);
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(key: string): string {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(key) || '';
}

function parseBuildMeta(payload: unknown): BuildMetaResponse | null {
  if (!payload || typeof payload !== 'object') return null;
  const maybe = payload as Record<string, unknown>;
  if (typeof maybe.buildId !== 'string' || !maybe.buildId) return null;
  return {
    buildId: maybe.buildId,
    version: typeof maybe.version === 'string' ? maybe.version : undefined,
    createdAt: typeof maybe.createdAt === 'string' ? maybe.createdAt : undefined,
  };
}

export function useBuildUpdateNotifier(): UseBuildUpdateNotifierResult {
  const currentBuildId = APP_BUILD_META.buildId;
  const [latestBuild, setLatestBuild] = useState<BuildMetaResponse | null>(null);
  const [promptDismissedForSession, setPromptDismissedForSession] = useState(false);
  const [delayUntilMs, setDelayUntilMs] = useState<number>(() => readNumber(DELAY_UNTIL_KEY));
  const [delayedBuildId, setDelayedBuildId] = useState<string>(() => readString(DELAY_BUILD_KEY));

  const checkNow = useCallback(async () => {
    try {
      const response = await fetch(`/build-meta.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const json = await response.json();
      const parsed = parseBuildMeta(json);
      if (!parsed) return;
      setLatestBuild((previous) => {
        if (previous?.buildId !== parsed.buildId) {
          setPromptDismissedForSession(false);
        }
        return parsed;
      });
    } catch {
      // Silent by design: update polling should never interrupt audio workflows.
    }
  }, []);

  useEffect(() => {
    void checkNow();
    const poller = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkNow();
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(poller);
  }, [checkNow]);

  const updateAvailable = useMemo(() => {
    return !!latestBuild && latestBuild.buildId !== currentBuildId;
  }, [latestBuild, currentBuildId]);

  const isDelayActive = useMemo(() => {
    if (!updateAvailable || !latestBuild) return false;
    const now = Date.now();
    return delayedBuildId === latestBuild.buildId && delayUntilMs > now;
  }, [updateAvailable, latestBuild, delayedBuildId, delayUntilMs]);

  const showPrompt = updateAvailable && !promptDismissedForSession && !isDelayActive;

  const delayUpdatePrompt = useCallback((minutes = DEFAULT_DELAY_MINUTES) => {
    if (!latestBuild) return;
    const until = Date.now() + minutes * 60 * 1000;
    setDelayUntilMs(until);
    setDelayedBuildId(latestBuild.buildId);
    setPromptDismissedForSession(true);
    window.localStorage.setItem(DELAY_UNTIL_KEY, String(until));
    window.localStorage.setItem(DELAY_BUILD_KEY, latestBuild.buildId);
  }, [latestBuild]);

  const dismissPrompt = useCallback(() => {
    setPromptDismissedForSession(true);
  }, []);

  const updateNow = useCallback(() => {
    window.location.reload();
  }, []);

  return {
    currentBuildId,
    latestBuild,
    updateAvailable,
    showPrompt,
    delayUpdatePrompt,
    dismissPrompt,
    updateNow,
    checkNow,
  };
}
