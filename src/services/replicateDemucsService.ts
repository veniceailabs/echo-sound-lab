/**
 * REPLICATE DEMUCS SERVICE
 *
 * Cloud stem separation via Replicate's hosted Demucs model.
 * Model: meta/demucs — htdemucs_ft (fine-tuned 4-stem separation)
 * Stems: vocals, drums, bass, other
 *
 * Usage: requires VITE_REPLICATE_API_KEY in .env.local
 *
 * Version: 1.0.0
 */

const REPLICATE_API_URL = 'https://api.replicate.com/v1/predictions';
const DEMUCS_MODEL = 'meta/demucs:819c6fd02896d6fd73ab3ed5c7c7bc9a24c8f40b0d6c2e5f49c56e93de7f8c3';

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 120_000;

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: {
    vocals?: string;
    drums?: string;
    bass?: string;
    other?: string;
    // Replicate may also return an array of URLs ordered [bass, drums, other, vocals]
    [key: string]: string | undefined;
  } | string[];
  error?: string;
  urls?: {
    get: string;
  };
}

/**
 * Resolve the Replicate API key from Vite env.
 * Throws a clear error if not configured.
 */
function resolveApiKey(): string {
  const key = import.meta.env.VITE_REPLICATE_API_KEY as string | undefined;
  if (!key || key.trim() === '') {
    throw new Error(
      '[ReplicateDemucs] VITE_REPLICATE_API_KEY is not set. ' +
      'Add it to .env.local:\n  VITE_REPLICATE_API_KEY=r8_your_key_here'
    );
  }
  return key.trim();
}

/**
 * Convert a Blob to a base64-encoded data URI.
 */
async function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read audio blob as data URI'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Decode audio from a URL into an AudioBuffer.
 */
async function decodeAudioUrl(url: string, audioContext: AudioContext): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch stem audio from Replicate: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Parse the Replicate output into named stem URLs.
 *
 * Replicate's Demucs model may return either:
 *   - An object: { vocals, drums, bass, other }
 *   - An array of 4 URLs (order: bass, drums, other, vocals per model card)
 */
function parseStemUrls(output: ReplicatePrediction['output']): {
  vocals: string;
  drums: string;
  bass: string;
  other: string;
} {
  if (!output) {
    throw new Error('[ReplicateDemucs] Prediction succeeded but returned no output');
  }

  if (Array.isArray(output)) {
    // Array order per meta/demucs model card: [bass, drums, other, vocals]
    if (output.length < 4) {
      throw new Error(`[ReplicateDemucs] Expected 4 stem URLs in output array, got ${output.length}`);
    }
    return {
      bass: output[0],
      drums: output[1],
      other: output[2],
      vocals: output[3],
    };
  }

  const vocals = output.vocals;
  const drums = output.drums;
  const bass = output.bass;
  const other = output.other;

  if (!vocals || !drums || !bass || !other) {
    throw new Error(
      `[ReplicateDemucs] Incomplete stem set in output. Got keys: ${Object.keys(output).join(', ')}`
    );
  }

  return { vocals, drums, bass, other };
}

/**
 * Separate audio into 4 stems via Replicate's hosted Demucs model.
 *
 * @param audioBlob   - Raw audio blob (wav, mp3, etc.)
 * @param apiKey      - Replicate API key (r8_...)
 * @param onProgress  - Optional human-readable status callback
 * @param audioContext - Web AudioContext for decoding stem buffers
 * @returns Promise resolving to 4 decoded AudioBuffers
 */
export async function separateStemsViaReplicate(
  audioBlob: Blob,
  apiKey: string,
  onProgress?: (status: string) => void,
  audioContext?: AudioContext
): Promise<{
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  other: AudioBuffer;
}> {
  const ctx = audioContext ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

  // --- Step 1: Encode audio as data URI ---
  onProgress?.('Uploading audio to Replicate...');
  const dataUri = await blobToDataUri(audioBlob);

  // --- Step 2: Create prediction ---
  onProgress?.('Starting Demucs stem separation...');
  const createResponse = await fetch(REPLICATE_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: DEMUCS_MODEL.split(':')[1],
      input: {
        audio: dataUri,
        model: 'htdemucs_ft',
        stem: null, // separate all 4 stems
        mp3: false,
        mp3_bitrate: 320,
        float32: false,
        clip_mode: 'rescale',
        shifts: 1,
        overlap: 0.25,
        jobs: 0,
      },
    }),
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text().catch(() => '');
    throw new Error(
      `[ReplicateDemucs] Failed to create prediction: ${createResponse.status} ${createResponse.statusText}. ${errText}`
    );
  }

  const prediction: ReplicatePrediction = await createResponse.json();
  const pollUrl = prediction.urls?.get ?? `${REPLICATE_API_URL}/${prediction.id}`;

  console.log(`[ReplicateDemucs] Prediction created: ${prediction.id}`);

  // --- Step 3: Poll until succeeded ---
  onProgress?.('Separating stems... (this takes 1-3 minutes for most tracks)');

  const startTime = Date.now();
  let lastStatus = '';

  while (true) {
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_POLL_MS) {
      throw new Error(
        `[ReplicateDemucs] Timed out after ${MAX_POLL_MS / 1000}s waiting for separation to complete`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const pollResponse = await fetch(pollUrl, {
      headers: { Authorization: `Token ${apiKey}` },
    });

    if (!pollResponse.ok) {
      throw new Error(`[ReplicateDemucs] Poll request failed: ${pollResponse.status}`);
    }

    const pollData: ReplicatePrediction = await pollResponse.json();

    if (pollData.status !== lastStatus) {
      lastStatus = pollData.status;
      const elapsedSec = Math.round(elapsed / 1000);
      onProgress?.(`Separating stems... (${pollData.status}, ${elapsedSec}s elapsed)`);
      console.log(`[ReplicateDemucs] Status: ${pollData.status} at ${elapsedSec}s`);
    }

    if (pollData.status === 'failed' || pollData.status === 'canceled') {
      throw new Error(
        `[ReplicateDemucs] Prediction ${pollData.status}: ${pollData.error ?? 'Unknown error'}`
      );
    }

    if (pollData.status === 'succeeded') {
      // --- Step 4: Parse stem URLs ---
      const stemUrls = parseStemUrls(pollData.output);

      // --- Step 5: Download and decode each stem ---
      onProgress?.('Downloading vocals...');
      const vocalsBuffer = await decodeAudioUrl(stemUrls.vocals, ctx);

      onProgress?.('Downloading drums...');
      const drumsBuffer = await decodeAudioUrl(stemUrls.drums, ctx);

      onProgress?.('Downloading bass...');
      const bassBuffer = await decodeAudioUrl(stemUrls.bass, ctx);

      onProgress?.('Downloading other instruments...');
      const otherBuffer = await decodeAudioUrl(stemUrls.other, ctx);

      onProgress?.('Stem separation complete.');
      console.log(`[ReplicateDemucs] All stems decoded successfully.`);

      return {
        vocals: vocalsBuffer,
        drums: drumsBuffer,
        bass: bassBuffer,
        other: otherBuffer,
      };
    }
  }
}

/**
 * Convenience wrapper that resolves the API key from env automatically.
 */
export async function separateStemsViaReplicateWithEnvKey(
  audioBlob: Blob,
  onProgress?: (status: string) => void,
  audioContext?: AudioContext
): Promise<{
  vocals: AudioBuffer;
  drums: AudioBuffer;
  bass: AudioBuffer;
  other: AudioBuffer;
}> {
  const apiKey = resolveApiKey();
  return separateStemsViaReplicate(audioBlob, apiKey, onProgress, audioContext);
}
