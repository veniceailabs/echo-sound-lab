/**
 * DistroKid Integration — 1-click distribution to all platforms
 *
 * Integrates with DistroKid API for automated distribution:
 * - Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, SoundCloud, Bandcamp
 * - OAuth-based authentication
 * - Real-time distribution status tracking
 */

interface DistroKidUploadParams {
  accessToken: string;
  audioFile: Blob | Uint8Array;
  metadata: {
    title: string;
    artist: string;
    album?: string;
    releaseDate?: string;
    genre?: string;
    isrc?: string;
    iswc?: string;
  };
  platforms?: string[];
}

interface DistroKidResponse {
  releaseId?: string;
  status?: string;
  submittedAt?: string;
  error?: string;
}

export const distrokidService = {
  /**
   * Get DistroKid authorization URL
   */
  async getAuthUrl(): Promise<{ authUrl: string; state: string }> {
    try {
      const response = await fetch('/api/proxy/distrokid/auth', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Failed to get auth URL: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Get auth URL error:', err);
      throw err;
    }
  },

  /**
   * Exchange authorization code for access token
   */
  async exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    try {
      const response = await fetch('/api/proxy/distrokid/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
      });

      if (!response.ok) {
        throw new Error(`Failed to exchange code: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Exchange code error:', err);
      throw err;
    }
  },

  /**
   * Upload and distribute audio
   */
  async upload(params: DistroKidUploadParams): Promise<DistroKidResponse> {
    try {
      const { accessToken, audioFile, metadata, platforms } = params;

      // Convert Blob to base64 if needed
      let audioBuffer: string;
      if (audioFile instanceof Blob) {
        const arrayBuffer = await audioFile.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer).toString('base64');
      } else {
        audioBuffer = Buffer.from(audioFile).toString('base64');
      }

      const response = await fetch('/api/proxy/distrokid/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          title: metadata.title,
          artistName: metadata.artist,
          audioBuffer,
          platforms: platforms || [
            'spotify',
            'apple_music',
            'youtube_music',
            'amazon_music',
            'tidal',
            'soundcloud',
            'bandcamp',
          ],
          releaseDate: metadata.releaseDate,
          metadata: {
            genre: metadata.genre,
            isrc: metadata.isrc,
            iswc: metadata.iswc,
          },
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Distribution failed: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      console.error('DistroKid upload error:', err);
      return {
        error: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  },

  /**
   * Get release status
   */
  async getReleaseStatus(accessToken: string, releaseId: string): Promise<DistroKidResponse> {
    try {
      const params = new URLSearchParams({
        accessToken,
        releaseId,
      });

      const response = await fetch(`/api/proxy/distrokid/status?${params}`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch release: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Get release status error:', err);
      return {
        error: err instanceof Error ? err.message : 'Failed to get status',
      };
    }
  },

  /**
   * Get available platforms
   */
  async getPlatforms(): Promise<Array<{ id: string; name: string; icon: string }>> {
    try {
      const response = await fetch('/api/proxy/distrokid/platforms', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error(`Failed to get platforms: ${response.status}`);
      }

      const data = await response.json();
      return data.platforms || [];
    } catch (err) {
      console.error('Get platforms error:', err);
      // Return default platforms as fallback
      return [
        { id: 'spotify', name: 'Spotify', icon: '🎵' },
        { id: 'apple_music', name: 'Apple Music', icon: '🍎' },
        { id: 'youtube_music', name: 'YouTube Music', icon: '▶️' },
        { id: 'amazon_music', name: 'Amazon Music', icon: '📦' },
        { id: 'tidal', name: 'Tidal', icon: '🌊' },
        { id: 'soundcloud', name: 'SoundCloud', icon: '☁️' },
        { id: 'bandcamp', name: 'Bandcamp', icon: '🎸' },
      ];
    }
  },
};
