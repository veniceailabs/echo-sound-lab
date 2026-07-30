/**
 * DistroKid integration utilities
 *
 * Handles OAuth and distribution to 7 platforms:
 * - Spotify
 * - Apple Music
 * - YouTube Music
 * - Amazon Music
 * - Tidal
 * - SoundCloud
 * - Bandcamp
 */

const DISTROKID_API_BASE = 'https://api.distrokid.com/v2beta1';

/**
 * Generate DistroKid OAuth authorization URL
 */
export function generateAuthUrl(clientId, redirectUri, state) {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state: state || Math.random().toString(36).slice(2),
    scope: 'user:read user:write releases:write',
  });

  return `https://app.distrokid.com/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeAuthCode(clientId, clientSecret, code, redirectUri) {
  const response = await fetch(`${DISTROKID_API_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Failed to exchange auth code: ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(clientId, clientSecret, refreshToken) {
  const response = await fetch(`${DISTROKID_API_BASE}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Failed to refresh token: ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

/**
 * Upload audio to DistroKid for distribution
 */
export async function uploadRelease(accessToken, releaseData) {
  const {
    title,
    artistName,
    audioBuffer,
    platforms,
    releaseDate,
    metadata,
  } = releaseData;

  // Create multipart form data
  const formData = new FormData();
  formData.append('title', title);
  formData.append('artist_name', artistName);
  formData.append('release_date', releaseDate || new Date().toISOString().split('T')[0]);
  formData.append('audio', new Blob([audioBuffer], { type: 'audio/wav' }), 'master.wav');

  // Add platforms
  if (Array.isArray(platforms) && platforms.length > 0) {
    platforms.forEach((platform) => {
      formData.append('platforms[]', platform);
    });
  }

  // Add metadata if provided
  if (metadata) {
    if (metadata.isrc) formData.append('isrc', metadata.isrc);
    if (metadata.iswc) formData.append('iswc', metadata.iswc);
    if (metadata.genre) formData.append('genre', metadata.genre);
  }

  const response = await fetch(`${DISTROKID_API_BASE}/releases`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Upload failed: ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return {
    releaseId: data.id,
    status: data.status,
    submittedAt: new Date(),
  };
}

/**
 * Get release status and distribution progress
 */
export async function getReleaseStatus(accessToken, releaseId) {
  const response = await fetch(`${DISTROKID_API_BASE}/releases/${releaseId}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Failed to get release status: ${err.error || response.statusText}`);
  }

  const data = await response.json();
  return {
    releaseId: data.id,
    status: data.status,
    title: data.title,
    platforms: data.platforms || [],
    submittedAt: data.submitted_at,
    liveDates: data.live_dates || {},
    errors: data.errors || [],
  };
}

/**
 * Get available platforms
 */
export function getPlatforms() {
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

/**
 * Get DistroKid configuration
 */
export function getDistroKidConfig() {
  const hasClientId = !!process.env.DISTROKID_CLIENT_ID;
  const hasClientSecret = !!process.env.DISTROKID_CLIENT_SECRET;
  const hasApiKey = !!process.env.DISTROKID_API_KEY;
  const configured = hasClientId && hasClientSecret;

  return {
    configured,
    hint: !configured ? 'Set DISTROKID_CLIENT_ID and DISTROKID_CLIENT_SECRET env vars' : null,
    clientId: process.env.DISTROKID_CLIENT_ID,
  };
}
