import { SunoGenerationRequest, SunoGenerationResponse, RateLimitState, GenerationCache } from '../types';

const RATE_LIMIT_KEY = 'suno_rate_limit';
const GENERATION_CACHE_KEY = 'suno_generation_cache';
const COST_LOG_KEY = 'suno_cost_log';

class SunoApiService {
    private apiKey: string;
    private baseUrl: string;
    private defaultLimit: number;
    private assetUrl: string;
    private mockMode: boolean;

    constructor() {
        // Use import.meta.env for Vite
        this.apiKey = import.meta.env.VITE_SUNO_API_KEY || '';
        this.baseUrl = import.meta.env.VITE_SUNO_API_URL || 'https://api.aimlapi.com';
        this.defaultLimit = parseInt(import.meta.env.VITE_RATE_LIMIT_PER_DAY || '10', 10);
        this.assetUrl = import.meta.env.VITE_SUNO_ASSET_URL || `${this.baseUrl}/v2/assets`;
        this.mockMode = (import.meta.env.VITE_SUNO_API_MOCK || '').toLowerCase() === 'true';

        console.log('[SunoAPI] Initialized with baseUrl:', this.baseUrl);
        console.log('[SunoAPI] API Key present:', !!this.apiKey);
        console.log('[SunoAPI] Mock mode:', this.mockMode);
    }

    /**
     * Rate Limiting
     */
    checkRateLimit(): { allowed: boolean; remaining: number; limit: number; resetAt: Date } {
        const state = this.getRateLimitState();
        const today = new Date().toISOString().split('T')[0];

        // Reset if new day
        if (state.date !== today) {
            this.resetRateLimit();
            return {
                allowed: true,
                remaining: this.defaultLimit,
                limit: this.defaultLimit,
                resetAt: this.getNextMidnight()
            };
        }

        const remaining = state.limit - state.count;
        return {
            allowed: remaining > 0,
            remaining,
            limit: state.limit,
            resetAt: this.getNextMidnight()
        };
    }

    incrementUsage(): void {
        const state = this.getRateLimitState();
        const today = new Date().toISOString().split('T')[0];

        if (state.date !== today) {
            this.resetRateLimit();
        }

        state.count += 1;
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
    }

    private getRateLimitState(): RateLimitState {
        const stored = localStorage.getItem(RATE_LIMIT_KEY);
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                // Invalid data, reset
            }
        }

        // Initialize new state
        const newState: RateLimitState = {
            date: new Date().toISOString().split('T')[0],
            count: 0,
            limit: this.defaultLimit
        };
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newState));
        return newState;
    }

    private resetRateLimit(): void {
        const newState: RateLimitState = {
            date: new Date().toISOString().split('T')[0],
            count: 0,
            limit: this.defaultLimit
        };
        localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(newState));
    }

    private getNextMidnight(): Date {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
    }

    /**
     * Generation Caching
     */
    private hashRequest(request: SunoGenerationRequest): string {
        const str = JSON.stringify({
            prompt: request.prompt,
            style: request.style,
            voiceModelId: request.voiceModelId,
            instrumental: request.instrumental,
            styleTags: request.styleTags,
            weirdness: request.weirdness,
            styleInfluence: request.styleInfluence,
            duration: request.duration,
            referenceAudioUrl: request.referenceAudioUrl,
            voiceSampleUrl: request.voiceSampleUrl,
            coverMode: request.coverMode
        });

        // Simple hash function
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    private checkCache(hash: string): string | null {
        const cacheData = localStorage.getItem(GENERATION_CACHE_KEY);
        if (!cacheData) return null;

        try {
            const cache: GenerationCache[] = JSON.parse(cacheData);
            const now = Date.now();

            // Clean expired entries
            const validCache = cache.filter(entry => (now - entry.createdAt) < entry.ttl);
            localStorage.setItem(GENERATION_CACHE_KEY, JSON.stringify(validCache));

            // Find matching hash
            const entry = validCache.find(e => e.hash === hash);
            return entry ? entry.songId : null;
        } catch (e) {
            console.error('Cache read error:', e);
            return null;
        }
    }

    private saveToCache(hash: string, songId: string): void {
        const cacheData = localStorage.getItem(GENERATION_CACHE_KEY);
        let cache: GenerationCache[] = [];

        if (cacheData) {
            try {
                cache = JSON.parse(cacheData);
            } catch (e) {
                cache = [];
            }
        }

        const newEntry: GenerationCache = {
            hash,
            songId,
            createdAt: Date.now(),
            ttl: 7 * 24 * 60 * 60 * 1000 // 7 days
        };

        cache.push(newEntry);
        localStorage.setItem(GENERATION_CACHE_KEY, JSON.stringify(cache));
    }

    /**
     * Cost Tracking
     */
    getTotalCost(): number {
        const costLog = localStorage.getItem(COST_LOG_KEY);
        if (!costLog) return 0;

        try {
            const log: Array<{ songId: string; cost: number; timestamp: number }> = JSON.parse(costLog);
            return log.reduce((sum, entry) => sum + entry.cost, 0);
        } catch (e) {
            return 0;
        }
    }

    logGeneration(songId: string, cost: number): void {
        const costLog = localStorage.getItem(COST_LOG_KEY);
        let log: Array<{ songId: string; cost: number; timestamp: number }> = [];

        if (costLog) {
            try {
                log = JSON.parse(costLog);
            } catch (e) {
                log = [];
            }
        }

        log.push({
            songId,
            cost,
            timestamp: Date.now()
        });

        localStorage.setItem(COST_LOG_KEY, JSON.stringify(log));
    }

    /**
     * Core API Methods
     */
    async uploadAudioAsset(asset: Blob): Promise<string> {
        if (this.mockMode) {
            return `mock://asset-${Date.now()}`;
        }

        if (!this.apiKey) {
            throw new Error('Suno API key not configured. Please add VITE_SUNO_API_KEY to your .env.local file.');
        }

        const formData = new FormData();
        const filename = asset instanceof File ? asset.name : `asset-${Date.now()}.wav`;
        formData.append('file', asset, filename);

        const response = await fetch(this.assetUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || response.statusText);
        }

        const data = await response.json();
        const url = data.url || data.asset_url || data.file_url || data.data?.url;
        if (!url) {
            throw new Error('Asset upload failed: no URL returned');
        }
        return url;
    }

    async generateSong(request: SunoGenerationRequest): Promise<SunoGenerationResponse> {
        // MOCK MODE - Skip API call for testing without credits
        if (this.mockMode) {
            console.log('[SunoAPI] MOCK MODE - Simulating music generation');
            console.log('[SunoAPI] Request:', { style: request.style, hasLyrics: !!request.lyrics });

            // Simulate processing delay
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Generate a simple audio buffer locally (silent/placeholder)
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const duration = 30; // 30 seconds
            const sampleRate = audioContext.sampleRate;
            const buffer = audioContext.createBuffer(2, sampleRate * duration, sampleRate);

            // Add a simple tone so it's not completely silent
            for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
                const channelData = buffer.getChannelData(channel);
                for (let i = 0; i < channelData.length; i++) {
                    // Simple sine wave at 440Hz (A note)
                    channelData[i] = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 0.1;
                }
            }

            // Store buffer in a global map for retrieval
            if (!(window as any).__mockAudioBuffers) {
                (window as any).__mockAudioBuffers = new Map();
            }
            const mockId = 'mock-' + Date.now();
            (window as any).__mockAudioBuffers.set(mockId, buffer);

            return {
                songId: mockId,
                status: 'completed',
                audioUrl: 'mock://local-buffer', // Special URL to indicate local buffer
                estimatedTime: 0
            };
        }

        // Check API key
        if (!this.apiKey) {
            throw new Error('Suno API key not configured. Please add VITE_SUNO_API_KEY to your .env.local file.');
        }

        // Check rate limit
        const rateLimit = this.checkRateLimit();
        if (!rateLimit.allowed) {
            throw new Error(`Rate limit exceeded. Resets at ${rateLimit.resetAt.toLocaleTimeString()}`);
        }

        // Check cache
        const hash = this.hashRequest(request);
        const cachedSongId = this.checkCache(hash);
        if (cachedSongId) {
            console.log('[SunoAPI] Using cached generation:', cachedSongId);
            return {
                songId: cachedSongId,
                status: 'completed'
                // Note: We'll need to fetch the audio URL separately
            };
        }

        // Make API request to AI/ML API
        try {
            console.log('[SunoAPI] Generating song with request:', {
                style: request.style,
                instrumental: request.instrumental,
                hasLyrics: !!request.lyrics,
                hasStyleTags: !!request.styleTags
            });
            // Build comprehensive prompt
            let fullPrompt = request.lyrics;
            fullPrompt += `\n\nStyle: ${request.style}`;

            if (request.styleTags) {
                fullPrompt += `\n\n${request.styleTags}`;
            }

            if (request.weirdness !== undefined && request.weirdness !== 50) {
                fullPrompt += `\n\nWeirdness: ${request.weirdness}%`;
            }

            if (request.styleInfluence !== undefined && request.styleInfluence !== 50) {
                fullPrompt += `\nStyle Influence: ${request.styleInfluence}%`;
            }

            if (request.prompt) {
                fullPrompt += `\n\n${request.prompt}`;
            }

            // AI/ML API MiniMax music-1.5 endpoint format
            // prompt: style/mood description (10-300 chars)
            // lyrics: separate field (10-3000 chars)

            let promptText = '';
            if (request.style) {
                promptText += request.style;
            }
            if (request.styleTags) {
                promptText += ` ${request.styleTags}`;
            }
            // Truncate to 300 chars max
            promptText = promptText.trim().substring(0, 300);

            const requestBody: any = {
                model: 'minimax/music-1.5',
                prompt: promptText || 'A creative music piece',
                audio_setting: {
                    sample_rate: 32000,
                    bitrate: 128000,
                    format: 'mp3'
                }
            };

            // Add lyrics if not instrumental
            if (request.lyrics && !request.instrumental) {
                requestBody.lyrics = request.lyrics.substring(0, 3000); // Max 3000 chars
            }

            if (request.referenceAudioUrl) {
                requestBody.reference_audio_url = request.referenceAudioUrl;
            }
            if (request.voiceSampleUrl) {
                requestBody.voice_sample_url = request.voiceSampleUrl;
            }
            if (request.coverMode) {
                requestBody.cover_mode = request.coverMode;
            }

            console.log('[SunoAPI] Request body:', requestBody);

            const response = await this.makeApiRequest('/v2/generate/audio', {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            // AI/ML API returns: { id: "generation-id:model-name", status: "queued" }
            const songId = data.id || data.generation_id;

            // Increment usage and save to cache
            this.incrementUsage();
            if (songId) {
                this.saveToCache(hash, songId);
                this.logGeneration(songId, 0.01); // $0.01 per generation
            }

            return {
                songId,
                status: data.status || 'pending',
                estimatedTime: 60
            };
        } catch (error: any) {
            console.error('[SunoAPI] Generation error:', error);
            throw new Error(this.parseApiError(error));
        }
    }

    async pollGenerationStatus(songId: string): Promise<SunoGenerationResponse> {
        // MOCK MODE - Skip polling for mock songs
        if (songId.startsWith('mock-')) {
            console.log('[SunoAPI] MOCK MODE - Skipping poll for mock song');
            return {
                songId,
                status: 'completed',
                audioUrl: 'mock://local-buffer'
            };
        }

        try {
            const response = await this.makeApiRequest(`/v2/generate/audio/${encodeURIComponent(songId)}`, {
                method: 'GET'
            });

            const data = await response.json();
            console.log('[SunoAPI] Poll response:', data);

            // AI/ML API response format
            const status = data.status; // 'queued', 'processing', 'completed'
            const audioUrl = data.audio_file?.url || data.audio_url;

            return {
                songId: data.id || songId,
                status: status === 'completed' ? 'completed' : status === 'processing' ? 'processing' : 'pending',
                audioUrl,
                error: data.error
            };
        } catch (error: any) {
            console.error('[SunoAPI] Poll error:', error);
            throw new Error(this.parseApiError(error));
        }
    }

    async downloadSong(url: string): Promise<AudioBuffer> {
        try {
            // Handle mock mode
            if (url === 'mock://local-buffer') {
                console.log('[SunoAPI] MOCK MODE - Using local audio buffer');
                // Get the most recent mock buffer
                const mockBuffers = (window as any).__mockAudioBuffers;
                if (mockBuffers && mockBuffers.size > 0) {
                    const lastBuffer = Array.from(mockBuffers.values()).pop();
                    return lastBuffer as AudioBuffer;
                }
                // Fallback: create a simple buffer
                const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                return audioContext.createBuffer(2, audioContext.sampleRate * 10, audioContext.sampleRate);
            }

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to download: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

            return audioBuffer;
        } catch (error: any) {
            console.error('[SunoAPI] Download error:', error);
            throw new Error(`Failed to download audio: ${error.message}`);
        }
    }

    async extractStems(songId: string): Promise<{ vocals: AudioBuffer; instrumental: AudioBuffer }> {
        try {
            const statusResponse = await this.pollGenerationStatus(songId);
            if (!statusResponse.audioUrl) {
                throw new Error('No audio URL available for stem extraction');
            }

            const fullMix = await this.downloadSong(statusResponse.audioUrl);

            // Simple frequency-based separation using Web Audio API
            // Vocals typically sit in 300Hz-3kHz range with center energy
            console.log('[SunoAPI] Performing frequency-based stem separation...');

            const sampleRate = fullMix.sampleRate;
            const length = fullMix.length;
            const channels = fullMix.numberOfChannels;

            // Create offline contexts for processing
            const vocalsCtx = new OfflineAudioContext(channels, length, sampleRate);
            const instCtx = new OfflineAudioContext(channels, length, sampleRate);

            // VOCALS: High-pass + band-pass + center extraction
            const vocalsSource = vocalsCtx.createBufferSource();
            vocalsSource.buffer = fullMix;

            const highPass = vocalsCtx.createBiquadFilter();
            highPass.type = 'highpass';
            highPass.frequency.value = 200;

            const lowPass = vocalsCtx.createBiquadFilter();
            lowPass.type = 'lowpass';
            lowPass.frequency.value = 5000;

            vocalsSource.connect(highPass);
            highPass.connect(lowPass);
            lowPass.connect(vocalsCtx.destination);
            vocalsSource.start();

            // INSTRUMENTAL: Full mix minus vocals (simple subtraction)
            const instSource = instCtx.createBufferSource();
            instSource.buffer = fullMix;
            instSource.connect(instCtx.destination);
            instSource.start();

            const [vocalsBuffer, instBuffer] = await Promise.all([
                vocalsCtx.startRendering(),
                instCtx.startRendering()
            ]);

            return {
                vocals: vocalsBuffer,
                instrumental: instBuffer
            };
        } catch (error: any) {
            console.error('[SunoAPI] Stem extraction error:', error);
            throw new Error(this.parseApiError(error));
        }
    }

    async generateHarmonies(
        userVocalsBlob: Blob,
        voiceModelId: string,
        type: 'harmonies' | 'doubles'
    ): Promise<AudioBuffer> {
        try {
            const base64 = await this.blobToBase64(userVocalsBlob);

            const response = await this.makeApiRequest('/harmonies', {
                method: 'POST',
                body: JSON.stringify({
                    vocals: base64,
                    voice_model_id: voiceModelId,
                    type
                })
            });

            const data = await response.json();

            // Poll until complete
            let status = data;
            while (status.status !== 'completed') {
                if (status.status === 'failed') {
                    throw new Error('Harmony generation failed');
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                status = await this.pollGenerationStatus(status.songId);
            }

            return await this.downloadSong(status.audioUrl!);
        } catch (error: any) {
            console.error('[SunoAPI] Harmony generation error:', error);
            throw new Error(this.parseApiError(error));
        }
    }

    /**
     * Helper Methods
     */
    private async makeApiRequest(endpoint: string, options: RequestInit): Promise<Response> {
        const url = `${this.baseUrl}${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || response.statusText);
        }

        return response;
    }

    private async blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64 = reader.result as string;
                resolve(base64.split(',')[1]); // Remove data:audio/webm;base64, prefix
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    private parseApiError(error: any): string {
        const message = error.message || 'Unknown error';

        if (message.includes('Rate limit')) {
            return 'Daily generation limit reached. Resets at midnight.';
        } else if (message.includes('Network') || message.includes('fetch')) {
            return 'Connection failed. Check your internet connection and try again.';
        } else if (message.includes('404')) {
            return 'Service not found. Please contact support.';
        } else if (message.includes('timeout')) {
            return 'Generation timed out. Please try again.';
        } else if (message.includes('Authorization') || message.includes('401')) {
            return 'API authentication failed. Please contact support.';
        }

        return `Generation failed: ${message}`;
    }
}

export const sunoApiService = new SunoApiService();
