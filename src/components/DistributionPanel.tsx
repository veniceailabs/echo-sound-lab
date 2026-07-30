/**
 * DistributionPanel â€1-click distribution to all platforms
 *
 * After mastering, users can instantly distribute to Spotify, Apple Music, etc.
 * Requires DistroKid OAuth connection.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { distrokidService } from '../services/distrokidService';

interface DistributionPanelProps {
  masterFile: File;
  fileName: string;
  onDistributionStart?: () => void;
  onDistributionComplete?: (releaseId: string) => void;
}

type DistributionStatus = 'idle' | 'checking-auth' | 'needs-auth' | 'uploading' | 'distributing' | 'done' | 'error';

interface Platform {
  id: string;
  name: string;
  icon: string;
}

export const DistributionPanel: React.FC<DistributionPanelProps> = ({
  masterFile,
  fileName,
  onDistributionStart,
  onDistributionComplete,
}) => {
  const [status, setStatus] = useState<DistributionStatus>('checking-auth');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'spotify',
    'apple_music',
    'youtube_music',
    'amazon_music',
    'tidal',
    'soundcloud',
  ]);
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Load platforms and check for stored token on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Load platforms
        const platformList = await distrokidService.getPlatforms();
        setPlatforms(platformList);

        // Check for stored access token in localStorage
        const storedToken = localStorage.getItem('distrokid.accessToken');
        if (storedToken) {
          setAccessToken(storedToken);
          setIsAuthenticated(true);
          setStatus('idle');
        } else {
          // Check URL for callback code
          const params = new URLSearchParams(window.location.search);
          const code = params.get('distrokid_code');
          if (code) {
            await handleCallbackCode(code);
          } else {
            setStatus('needs-auth');
          }
        }
      } catch (err) {
        console.error('Auth init failed:', err);
        setStatus('needs-auth');
      }
    };
    initAuth();
  }, []);

  const handleCallbackCode = async (code: string) => {
    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const tokens = await distrokidService.exchangeCode(code, redirectUri);
      localStorage.setItem('distrokid.accessToken', tokens.accessToken);
      localStorage.setItem('distrokid.refreshToken', tokens.refreshToken);
      setAccessToken(tokens.accessToken);
      setIsAuthenticated(true);
      setStatus('idle');
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (err) {
      console.error('Code exchange failed:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStatus('error');
    }
  };

  const handleAuthenticate = async () => {
    try {
      setStatus('checking-auth');
      const { authUrl } = await distrokidService.getAuthUrl();
      // Redirect to DistroKid OAuth
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get auth URL');
      setStatus('error');
    }
  };

  const handleDistribute = async () => {
    if (!isAuthenticated || !accessToken || !selectedPlatforms.length) return;

    setStatus('uploading');
    setProgress(0);
    setError(null);
    onDistributionStart?.();

    try {
      setProgress(20);

      const trackName = fileName.replace(/\.[^.]+$/, '');
      const response = await distrokidService.upload({
        accessToken,
        audioFile: masterFile,
        metadata: {
          title: trackName,
          artist: 'Independent Artist',
          album: 'Echo Sound Lab Master',
          releaseDate: new Date().toISOString().split('T')[0],
          genre: 'Electronic',
        },
        platforms: selectedPlatforms,
      });

      setProgress(60);

      if (!response.releaseId || response.error) {
        throw new Error(response.error || 'Distribution failed');
      }

      setReleaseId(response.releaseId);
      setProgress(100);
      setStatus('done');

      onDistributionComplete?.(response.releaseId);
    } catch (err) {
      console.error('Distribution error:', err);
      setError(err instanceof Error ? err.message : 'Distribution failed');
      setStatus('error');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] backdrop-blur-xl overflow-hidden shadow-[0_16px_48px_rgba(0,0,0,0.6)]"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.08]">
        <h2 className="text-lg font-semibold text-white">Distribution Suite</h2>
        <p className="text-xs text-white/40 mt-1">Ship to Spotify, Apple Music, YouTube Music, and more</p>
      </div>

      {/* Authentication gate */}
      {!isAuthenticated && (
        <div className="px-6 py-4 border-b border-white/[0.08] bg-orange-500/5">
          <div className="flex items-start gap-3">
            <div className="text-orange-400 text-2xl">ðŸ”—</div>
            <div className="flex-1">
              <p className="text-sm text-orange-200 font-medium mb-3">
                Connect to DistroKid to distribute worldwide
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleAuthenticate}
                className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 transition-colors"
              >
                Connect DistroKid Account
              </motion.button>
            </div>
          </div>
        </div>
      )}

      {/* Platform selection */}
      <AnimatePresence>
        {isAuthenticated && status !== 'done' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-6 py-4 border-b border-white/[0.08]"
          >
            <p className="text-xs font-medium text-white/50 uppercase tracking-wide mb-3">Select Platforms</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {platforms.map((platform) => (
                <motion.button
                  key={platform.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() =>
                    setSelectedPlatforms((s) =>
                      s.includes(platform.id)
                        ? s.filter((p) => p !== platform.id)
                        : [...s, platform.id]
                    )
                  }
                  className={`
                    p-3 rounded-lg transition-all duration-150 border text-sm font-medium
                    ${
                      selectedPlatforms.includes(platform.id)
                        ? 'border-green-500/50 bg-green-500/10 text-green-300'
                        : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]'
                    }
                  `}
                >
                  <div>{platform.icon}</div>
                  <div className="text-xs mt-1">{platform.name}</div>
                </motion.button>
              ))}
            </div>
            <p className="text-xs text-white/50 mt-3">
              Selected: {selectedPlatforms.length}/{platforms.length} platforms
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Distribution status */}
      <div className="px-6 py-4">
        {status === 'idle' && isAuthenticated && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleDistribute}
            disabled={!selectedPlatforms.length}
            className={`
              w-full px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-150 border
              ${
                !selectedPlatforms.length
                  ? 'border-white/10 bg-white/[0.04] text-white/40 cursor-not-allowed'
                  : 'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/15'
              }
            `}
          >
            ðŸšDistribute to {selectedPlatforms.length} Platform{selectedPlatforms.length !== 1 ? 's' : ''}
          </motion.button>
        )}

        {status === 'uploading' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-300">Uploading to DistroKid...</p>
              <p className="text-xs text-amber-400">{progress}%</p>
            </div>
            <div className="w-full h-2 rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                className="h-full rounded-full bg-amber-400"
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {status === 'done' && releaseId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-lg bg-green-500/10 border border-green-500/30 p-4"
          >
            <h3 className="text-sm font-semibold text-green-300 mb-2">âœDistribution queued!</h3>
            <p className="text-xs text-green-200 mb-3">
              Your master will be live on all platforms within 24-72 hours.
            </p>
            <p className="text-xs text-green-200/60">Release ID: {releaseId}</p>
          </motion.div>
        )}

        {status === 'error' && error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-4">
            <p className="text-sm font-semibold text-red-300 mb-2">âœDistribution failed</p>
            <p className="text-xs text-red-200">{error}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default DistributionPanel;
