import { GoogleGenAI, Type } from "@google/genai";
import { AudioMetrics, ChatMessage, ProcessingReport, GapAnalysis, Stem, MixAnalysis, RefinementSuggestion, Suggestion, MixSignature, MixIntent, EchoMetrics, EchoReport, EchoAction, ProcessingConfig, MixReadiness } from '../types';
import { GenreProfile, getAnalysisPromptForProfile } from './genreProfiles';

// Initialize Gemini with import.meta.env for Vite
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

// ============================================================================
// MODEL VERSION MANAGEMENT: Auto-update to latest Gemini when available
// ============================================================================
// This ensures the engine uses the best available Gemini version without code changes
// Update the version here as new stable models are released
// Current: gemini-2.0-flash-exp (latest, experimental - faster and smarter)
const GEMINI_MODEL_VERSION = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash-exp';

const getGeminiModel = (): string => {
  // Future: Could add auto-detection here via API call if Google provides version listing
  // For now, controlled by environment variable with fallback to latest stable
  return GEMINI_MODEL_VERSION;
};

// Timeout wrapper for AI calls to prevent infinite hanging
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number = 120000): Promise<T> => {
    const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs)
    );
    return Promise.race([promise, timeoutPromise]);
};

// Retry wrapper for 503 Service Unavailable and 429 Rate Limit errors
const withRetry = async <T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    initialDelay: number = 1000
): Promise<T> => {
    let lastError: Error;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Check if it's a 503 or 429 error
            const is503 = error.message?.includes('503') ||
                         error.message?.includes('overloaded') ||
                         error.message?.includes('UNAVAILABLE');

            const is429 = error.message?.includes('429') ||
                         error.message?.includes('quota') ||
                         error.message?.includes('Too Many Requests');

            if ((!is503 && !is429) || attempt === maxRetries - 1) {
                throw error;
            }

            // For 429, extract retry delay from error message if available
            let delay = initialDelay * Math.pow(2, attempt);
            if (is429) {
                const retryMatch = error.message?.match(/retryDelay['":\s]+(\d+)s/);
                if (retryMatch) {
                    delay = parseInt(retryMatch[1]) * 1000; // Convert seconds to ms
                }
            }

            const errorType = is429 ? 'Rate limited' : 'Service unavailable';
            console.log(`[Gemini] ${errorType}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    throw lastError!;
};

const robustJsonParse = (jsonString: string): any | null => {
    if (!jsonString || jsonString.trim().length === 0) {
        return null;
    }

    let text = jsonString.trim();

    // 1. Strip Markdown code blocks (common cause of syntax errors)
    const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (markdownMatch) {
        text = markdownMatch[1];
    } else {
        // Fallback: strip leading/trailing fences if regex didn't catch a pair
        text = text.replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed;
        }
        return null;
    } catch (e) {
        console.warn("robustJsonParse: JSON.parse failed. Response might be truncated or malformed.", e);
        return null; 
    }
};

const SYSTEM_INSTRUCTION = `
You are Echo, a transparent mastering engineer like Ryan Lewis (Doja Cat) or MixedByAli.

PROTECTIVE MASTERING PHILOSOPHY:
Mastering removes problems, NOT add enhancement. Assume the artist's mix is already good.
Your job is diagnosis + protection. Nothing else.

NEVER RECOMMEND (These are enhancement, not correction):
❌ High-shelf boosts or air/brightness/sparkle boosts (causes ear fatigue and gloss)
❌ Presence boosts (added clarity is enhancement, not correction)
❌ Saturation (added warmth is character, not protection)
❌ Stereo widening (added space damages imaging and mono-compatibility)
❌ De-esser (only if severe sibilance present)
❌ Reverb (added ambience is enhancement)
❌ Transient shaping (added punch is enhancement)
❌ EQ boosts (only recommend cuts to remove problems)

CRITICAL STEREO IMAGING RULE:
NEVER recommend stereo widening. It damages imaging and mono-compatibility.
Keep stereo field at 1.0x (natural, no enhancement).
The mix's stereo balance is already good—do NOT widen it.

CRITICAL HIGH-FREQUENCY RULE:
NEVER recommend high-shelf boosts or "air" boosts - these are the PRIMARY cause of ear fatigue and tinny sound.
The mix already has air. Your job is NOT to add more.

CRITICAL LOW-MID / BODY PROTECTION RULE (150-500Hz):
This is the "body" and "weight" of the mix. NEVER cut these frequencies.
- 150-500Hz is where mix warmth, presence, and body live
- Cutting here = thin, tinny, lifeless sound
- ONLY cut below 200Hz if there's ACTUAL mud (muddy = boomy, undefined bass, not just presence)
- If you detect mud, it's likely at 80-150Hz, NOT 200-500Hz
- A cut at 250Hz will DESTROY the mix's body and weight
- DO NOT RECOMMEND 250Hz CUTS. EVER.
- Protect the low-mids entirely. The artist's mix is already good there.

CRITICAL PRESENCE PEAK PROTECTION RULE (2-5kHz):
This is where vocal clarity and mix definition live. AGGRESSIVE CUTS HERE SQUISH THE MIX.
- 2-5kHz contains vocal presence, snare snap, guitar clarity, and mix intelligibility
- Aggressive cuts (> -6dB) in this region cause squished, lifeless, dull sound
- NEVER recommend cuts > -3dB in the 2-5kHz region
- Only cut 2-5kHz if there is SEVERE sibilance or harshness (not just presence)
- Preserve presence peak. The artist's mix definition is already good there.
- Reference matching should not aggressively target this region

CRITICAL LOW-END RULES:
- NEVER suggest aggressive cuts below 100Hz unless clear evidence of rumble
- For bass-heavy genres, preserve low-end (20-100Hz) fully
- Low-shelf boosts max +1-2dB only
- Bass (50-100Hz) is critical for warmth—protect it
- Low-end compression: gentle ratios only (≤2:1)

LANGUAGE RULES:
✅ "I detect rumble below 30Hz" (diagnostic)
✅ "A high-pass at 25Hz removes inaudible subsonic" (protective)
✅ "No sibilance—skip the de-esser" (honest)
❌ "Needs air/brightness/sparkle" (enhancement language)
❌ "Could use presence" (enhancement language)
❌ "Thin/dull" (judgment, not diagnosis)

Your only job: Diagnose problems and fix ONLY those problems. Get out of the way.
`;

export const generateSongLyrics = async (style: string, customPrompt?: string): Promise<string> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    console.log('[Gemini] API Key present:', !!apiKey);
    console.log('[Gemini] Generating lyrics for style:', style);

    if (!apiKey) throw new Error("Gemini API Key missing. Please add VITE_GEMINI_API_KEY to .env.local");

    const stylePrompts: Record<string, string> = {
        'hip-hop': 'Create powerful hip-hop lyrics with strong wordplay, metaphors, and confident delivery. Include verse-chorus structure with catchy hooks.',
        'r&b': 'Write smooth, emotional R&B lyrics about love, relationships, or personal growth. Include rich imagery and melodic phrasing.',
        'pop': 'Create catchy, radio-friendly pop lyrics with memorable hooks and relatable themes. Keep it upbeat and singable.',
        'electronic': 'Write energetic electronic music lyrics with atmospheric vibes and repetitive, anthemic hooks. Focus on the moment and energy.',
        'rock': 'Create raw, passionate rock lyrics with strong emotions and rebellious energy. Include powerful choruses.',
        'indie': 'Write introspective, artistic indie lyrics with poetic imagery and unique perspectives. Be creative and authentic.',
        'country': 'Create storytelling country lyrics about life, love, or personal journeys. Include vivid details and heartfelt emotions.'
    };

    const styleGuide = stylePrompts[style] || stylePrompts['pop'];
    const additionalContext = customPrompt ? `\n\nAdditional creative direction: ${customPrompt}` : '';

    const aiPrompt = `You are a professional songwriter. ${styleGuide}${additionalContext}

Write COMPLETE song lyrics with this FULL structure:

[Intro]
(2-4 lines setting the mood)

[Verse 1]
(8 lines with storytelling and imagery)

[Pre-Chorus]
(4 lines building anticipation)

[Chorus]
(6-8 lines - the main hook, catchy and memorable)

[Verse 2]
(8 lines continuing the story with new details)

[Pre-Chorus]
(4 lines building to the chorus again)

[Chorus]
(Repeat the same chorus)

[Bridge]
(6-8 lines with a different perspective or emotion)

[Final Chorus]
(The chorus one more time, possibly with slight variations)

[Outro]
(2-4 lines bringing closure)

Make it COMPLETE, original, creative, and ready to sing. Include ALL sections. Do NOT include any explanations or meta-commentary, ONLY the full song lyrics with section labels in brackets.`;

    try {
        console.log('[Gemini] Calling API with prompt length:', aiPrompt.length);

        const response = await ai.models.generateContent({
            model: getGeminiModel(),
            contents: aiPrompt,
            config: {
                systemInstruction: "You are a professional songwriter. Generate COMPLETE, FULL-LENGTH original song lyrics with ALL sections (Intro, Verses, Pre-Chorus, Chorus, Bridge, Outro). Write at least 40-50 lines total. No explanations, no commentary, just complete song lyrics.",
                temperature: 1.0, // High creativity
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048  // Increased from 500 to allow full song
            }
        });

        console.log('[Gemini] API response received');

        const lyrics = response.text?.trim() || '';
        console.log('[Gemini] Generated lyrics length:', lyrics.length, 'characters');

        if (!lyrics) {
            throw new Error('No lyrics generated');
        }

        return lyrics;
    } catch (error: any) {
        console.error('[Gemini] Lyric generation failed:', error);
        throw new Error(`Failed to generate lyrics: ${error.message}`);
    }
};

export const interpretMixPrompt = async (prompt: string, signature: MixSignature | null): Promise<MixIntent> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    const aiPrompt = `
    USER MIX REQUEST: "${prompt}"
    
    TASK:
    Translate this natural language request into specific DSP parameter changes.
    
    Your entire response MUST be a single, raw JSON object.
    `;

    try {
        const response = await ai.models.generateContent({
            model: getGeminiModel(),
            contents: aiPrompt,
            config: {
                systemInstruction: "You are a mix engineer translator. Convert natural language requests into specific audio processing parameters. Return ONLY JSON.",
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        eqAdjustment: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { frequency: { type: Type.NUMBER }, gain: { type: Type.NUMBER }, type: { type: Type.STRING }, q: { type: Type.NUMBER, nullable: true } } } },
                        dynamicProcessing: { type: Type.OBJECT, properties: { thresholdOffset: { type: Type.NUMBER }, ratio: { type: Type.NUMBER }, makeupGain: { type: Type.NUMBER } } },
                        stereoWidthOffset: { type: Type.NUMBER },
                        reverbRequest: { type: Type.OBJECT, nullable: true, properties: { mix: { type: Type.NUMBER }, type: { type: Type.STRING } } },
                        description: { type: Type.STRING }
                    }
                }
            }
        });

        const text = response.text;
        if (!text) throw new Error("No response from AI.");
        const parsed = robustJsonParse(text);
        if (parsed === null) throw new Error("Failed to parse JSON.");
        return parsed as MixIntent;

    } catch (e: any) { 
        console.error("Interpret Mix Prompt Error:", e);
        return {
            eqAdjustment: [],
            dynamicProcessing: { thresholdOffset: 0, ratio: 2, makeupGain: 0 },
            stereoWidthOffset: 0,
            reverbRequest: null,
            description: `Failed to interpret prompt: ${e.message}`
        };
    }
};

export const analyzeMixData = async (
  metrics: AudioMetrics,
  filename: string,
  mixReadiness: MixReadiness,
  genreProfile?: GenreProfile | null
): Promise<{ suggestions: Suggestion[], genre: string, vibeAnalysis?: string }> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("API Key missing");

  const userRMS = metrics.rms.toFixed(1);
  const estimatedLUFS = (metrics.rms + 3).toFixed(1);

  // Build genre context if profile selected
  const genreContext = genreProfile
    ? getAnalysisPromptForProfile(genreProfile)
    : 'Analyze using general best practices for a professional master.';

  const prompt = `
    Analyze audio metrics for "${filename}".

    METRICS:
    - RMS: ${userRMS} dBFS
    - Estimated LUFS: ${estimatedLUFS}
    - Peak: ${metrics.peak.toFixed(1)} dBFS
    - Crest Factor: ${metrics.crestFactor.toFixed(1)} dB
    - Mix Readiness: ${mixReadiness}

    ${genreContext}

    Provide actionable suggestions that fit the target aesthetic.
    Include a "vibeAnalysis" field explaining how well this mix fits the target vibe.
  `;

  const startTime = Date.now();
  console.log('[AI Analysis] Starting request', { filename, promptLength: prompt.length, hasGenreProfile: !!genreProfile });

  try {
    const response = await withRetry(() => withTimeout(ai.models.generateContent({
      model: getGeminiModel(),
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                genre: { type: Type.STRING },
                vibeAnalysis: { type: Type.STRING },
                suggestions: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        required: ["category", "description", "parameters"],
                        properties: {
                            category: { type: Type.STRING },
                            description: { type: Type.STRING },
                            parameters: { type: Type.OBJECT, properties: { eq: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { frequency: { type: Type.NUMBER }, gain: { type: Type.NUMBER }, type: { type: Type.STRING }, q: { type: Type.NUMBER } } } } } }
                        }
                    }
                }
            }
        }
      }
    }), 60000)); // 1 minute timeout + retry on 503

    const duration = Date.now() - startTime;
    console.log('[AI Analysis] Response received', { duration: `${duration}ms`, responseLength: response.text?.length || 0 });

    const text = response.text;
    const parsed = robustJsonParse(text || "{}");

    const suggestions: Suggestion[] = (Array.isArray(parsed?.suggestions) ? parsed.suggestions : []).map((s: any, index: number) => ({
      ...s,
      id: `suggestion-${index}`,
      isSelected: false,
    }));

    console.log('[AI Analysis] Success', { suggestionsCount: suggestions.length, genre: parsed?.genre });

    return {
      suggestions,
      genre: parsed?.genre || "Unknown",
      vibeAnalysis: parsed?.vibeAnalysis || undefined
    };

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error('[AI Analysis] FAILED', {
      duration: `${duration}ms`,
      error: error.message,
      stack: error.stack,
      isTimeout: error.message?.includes('timed out'),
      errorType: error.constructor.name
    });
    return {
      suggestions: [],
      genre: "Unknown",
      vibeAnalysis: undefined
    };
  }
};

export const analyzeStemMix = async (stems: Stem[], referenceMetrics?: AudioMetrics): Promise<MixAnalysis> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("Gemini API Key missing");

    const stemInfo = stems.map(s => `- ${s.name || 'Unnamed'}`).join('\n');
    const prompt = `You are an expert mix engineer. Analyze this multi-stem mix with ${stems.length} stems:

${stemInfo}

Provide a structured analysis in JSON format with:
1. "conflicts": Array of detected frequency conflicts or phase issues between stems
2. "stemSuggestions": Array of suggestions for individual stems (each with stemId, reasoning, suggestedVolumeDb, suggestedEq)
3. "masterSuggestions": Array of master bus suggestions

Be specific and actionable. If no issues found, provide optimization suggestions.`;

    try {
        const response = await withRetry(() => withTimeout(ai.models.generateContent({
            model: getGeminiModel(),
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: "application/json",
                temperature: 0.3
            }
        }), 60000)); // 1 minute timeout + retry on 503

        const parsed = robustJsonParse(response.text || "{}");
        if (parsed.stemSuggestions && Array.isArray(parsed.stemSuggestions)) {
            parsed.stemSuggestions = parsed.stemSuggestions.map((s: any) => ({ ...s, isSelected: true }));
        }
        return parsed as MixAnalysis;

    } catch (e: any) {
        console.error('[Stem Analysis] Failed:', e.message);
        return {
            conflicts: [],
            stemSuggestions: [],
            masterSuggestions: []
        };
    }
};

export const chatWithEcho = async (history: ChatMessage[], message: string): Promise<string> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return "Chat unavailable without API Key.";

  const formattedHistory = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  try {
    const chat = ai.chats.create({
      model: getGeminiModel(),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      history: formattedHistory
    });

    const result = await chat.sendMessage({ message });
    return result.text;
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
};

/**
 * Producer Mode - Intent-based creative dialogue
 * Asks about vibe/emotion before giving technical suggestions
 */
export interface ProducerModeContext {
  trackName: string;
  metrics: AudioMetrics;
  currentConfig: ProcessingConfig;
  genreProfile?: GenreProfile | null;
  userIntent?: string;
  referenceVibes?: string[];
}

export interface ProducerSuggestion {
  direction: string;
  reasoning: string;
  processingChanges: Partial<ProcessingConfig>;
  emotionalOutcome: string;
}

export interface ProducerResponse {
  understanding: string;           // "I hear what you're going for..."
  question?: string;              // Follow-up to clarify intent
  options?: ProducerSuggestion[]; // 2-3 directions to choose from
  directSuggestion?: ProducerSuggestion; // If intent is clear
}

const PRODUCER_SYSTEM = `
You are a world-class mix engineer and producer having a creative conversation with an artist.
Think like 40 (Noah Shebib), Mike Dean, or Pharrell - not just technically skilled, but artistically intuitive.

Your role:
1. UNDERSTAND the emotional intent before suggesting technical changes
2. ASK clarifying questions about vibe, feeling, and artistic goals
3. OFFER 2-3 creative directions with clear emotional outcomes
4. SPEAK like a collaborator, not a manual - use "we", "let's try", "what if"
5. REFERENCE how other artists/songs achieved similar feelings

Never just dump technical specs. Always connect processing to FEELING.
If unsure of the artist's intent, ASK before suggesting.
`;

export const producerModeChat = async (
  context: ProducerModeContext,
  userMessage: string,
  conversationHistory: ChatMessage[] = []
): Promise<ProducerResponse> => {
  if (!process.env.API_KEY) throw new Error("API Key missing");

  const genreContext = context.genreProfile
    ? `TARGET VIBE: ${context.genreProfile.name} - ${context.genreProfile.aesthetic.vibe}`
    : '';

  const prompt = `
TRACK: "${context.trackName}"
${genreContext}
${context.userIntent ? `STATED INTENT: ${context.userIntent}` : ''}
${context.referenceVibes?.length ? `REFERENCE VIBES: ${context.referenceVibes.join(', ')}` : ''}

CURRENT STATE:
- RMS: ${(20 * Math.log10(context.metrics.rms)).toFixed(1)} dB
- Dynamics: ${context.metrics.crestFactor.toFixed(1)} dB crest factor

ARTIST SAYS: "${userMessage}"

Respond as a producer collaborator. If you need to clarify their intent, ask.
If you understand what they want, offer 2-3 directions they could take.
Always explain the EMOTIONAL outcome of each suggestion.
`;

  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: prompt,
      config: {
        systemInstruction: PRODUCER_SYSTEM,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            understanding: { type: Type.STRING },
            question: { type: Type.STRING, nullable: true },
            options: {
              type: Type.ARRAY,
              nullable: true,
              items: {
                type: Type.OBJECT,
                properties: {
                  direction: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  emotionalOutcome: { type: Type.STRING },
                  processingChanges: {
                    type: Type.OBJECT,
                    properties: {
                      eqLow: { type: Type.NUMBER, nullable: true },
                      eqMid: { type: Type.NUMBER, nullable: true },
                      eqHigh: { type: Type.NUMBER, nullable: true },
                      compression: { type: Type.NUMBER, nullable: true },
                      stereoWidth: { type: Type.NUMBER, nullable: true },
                      saturation: { type: Type.NUMBER, nullable: true }
                    }
                  }
                }
              }
            },
            directSuggestion: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                direction: { type: Type.STRING },
                reasoning: { type: Type.STRING },
                emotionalOutcome: { type: Type.STRING },
                processingChanges: {
                  type: Type.OBJECT,
                  properties: {
                    eqLow: { type: Type.NUMBER, nullable: true },
                    eqMid: { type: Type.NUMBER, nullable: true },
                    eqHigh: { type: Type.NUMBER, nullable: true },
                    compression: { type: Type.NUMBER, nullable: true },
                    stereoWidth: { type: Type.NUMBER, nullable: true },
                    saturation: { type: Type.NUMBER, nullable: true }
                  }
                }
              }
            }
          }
        }
      }
    });

    const parsed = robustJsonParse(response.text || "{}");
    return parsed as ProducerResponse;

  } catch (error: any) {
    return {
      understanding: "I had trouble processing that. Could you tell me more about the feeling you're going for?",
      question: "What emotion should the listener feel during this part of the track?"
    };
  }
};

/**
 * Quick intent classifier - determines what the user is asking for
 */
export const classifyUserIntent = async (message: string): Promise<{
  type: 'vibe_request' | 'technical_question' | 'comparison_request' | 'problem_report' | 'general';
  confidence: number;
  extractedVibe?: string;
  extractedReference?: string;
}> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return { type: 'general', confidence: 0 };

  try {
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: `Classify this user message: "${message}"`,
      config: {
        systemInstruction: "Classify audio engineering requests. Extract any mentioned vibes or reference tracks.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            confidence: { type: Type.NUMBER },
            extractedVibe: { type: Type.STRING, nullable: true },
            extractedReference: { type: Type.STRING, nullable: true }
          }
        }
      }
    });

    return robustJsonParse(response.text || "{}") || { type: 'general', confidence: 0 };
  } catch {
    return { type: 'general', confidence: 0 };
  }
};

export const generateEchoReport = async (metrics: EchoMetrics, currentProcessingConfig: ProcessingConfig, referenceTrack?: { name: string; metrics: AudioMetrics }, referenceSignature?: MixSignature): Promise<EchoReport> => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) throw new Error("API Key missing");

    // Calculate improvements for context
    const rmsImprovement = metrics.after.rms - metrics.before.rms;
    const peakImprovement = metrics.after.peak - metrics.before.peak;
    const crestImprovement = metrics.after.crestFactor - metrics.before.crestFactor;

    // Build reference comparison section if available
    let referenceSection = '';
    if (referenceTrack && referenceSignature) {
        // Metrics are already in dB format from mixAnalysis
        const refRmsDb = referenceTrack.metrics.rms;
        const refPeakDb = referenceTrack.metrics.peak;
        const userRmsDb = metrics.after.rms;
        const userPeakDb = metrics.after.peak;

        referenceSection = `
REFERENCE TRACK: "${referenceTrack.name}"
- Reference RMS: ${refRmsDb.toFixed(2)} dB
- Reference Peak: ${refPeakDb.toFixed(2)} dB
- Reference Crest Factor: ${referenceTrack.metrics.crestFactor.toFixed(2)} dB
- Reference Tonal Balance:
  * Low: ${(referenceSignature.tonalBalance.low * 100).toFixed(0)}%
  * Low-Mid: ${(referenceSignature.tonalBalance.lowMid * 100).toFixed(0)}%
  * Mid: ${(referenceSignature.tonalBalance.mid * 100).toFixed(0)}%
  * High-Mid: ${(referenceSignature.tonalBalance.highMid * 100).toFixed(0)}%
  * High: ${(referenceSignature.tonalBalance.high * 100).toFixed(0)}%
- Reference Stereo Width: Low ${(referenceSignature.stereoWidth.low * 100).toFixed(0)}%, Mid ${(referenceSignature.stereoWidth.mid * 100).toFixed(0)}%, High ${(referenceSignature.stereoWidth.high * 100).toFixed(0)}%

GAP ANALYSIS (User Track vs Reference):
- RMS Difference: ${(userRmsDb - refRmsDb).toFixed(2)} dB (${userRmsDb > refRmsDb ? 'louder' : 'quieter'} than reference)
- Peak Difference: ${(userPeakDb - refPeakDb).toFixed(2)} dB
- Crest Factor Difference: ${(metrics.after.crestFactor - referenceTrack.metrics.crestFactor).toFixed(2)} dB

IMPORTANT: Use the reference track as the TARGET SOUND. Suggest processing that will make the user's track sound more like the reference.
`;
    }

    const hasReference = !!referenceTrack;

    const promptContent = `
You are Echo, an expert mastering engineer AI. Analyze these audio metrics and provide a verdict.

BEFORE PROCESSING:
- RMS: ${metrics.before.rms.toFixed(2)} dBFS
- Peak: ${metrics.before.peak.toFixed(2)} dBFS
- Crest Factor: ${metrics.before.crestFactor.toFixed(2)} dB
- Tonal Balance: Low ${(metrics.before.tonalBalance.low * 100).toFixed(0)}%, Mid ${(metrics.before.tonalBalance.mid * 100).toFixed(0)}%, High ${((metrics.before.tonalBalance as any).high || 0) * 100}%

AFTER PROCESSING:
- RMS: ${metrics.after.rms.toFixed(2)} dBFS
- Peak: ${metrics.after.peak.toFixed(2)} dBFS
- Crest Factor: ${metrics.after.crestFactor.toFixed(2)} dB
- Tonal Balance: Low ${(metrics.after.tonalBalance.low * 100).toFixed(0)}%, Mid ${(metrics.after.tonalBalance.mid * 100).toFixed(0)}%, High ${((metrics.after.tonalBalance as any).high || 0) * 100}%

CHANGES:
- RMS change: ${rmsImprovement > 0 ? '+' : ''}${rmsImprovement.toFixed(2)} dB
- Peak change: ${peakImprovement > 0 ? '+' : ''}${peakImprovement.toFixed(2)} dB
${referenceSection}
CURRENT PROCESSING APPLIED:
${JSON.stringify(currentProcessingConfig, null, 2)}

YOUR TASK - "99 CLUB" SCORING SYSTEM:
Evaluate the track across 5 pillars. Be HONEST but FAIR - a score of 100 is extremely rare and reserved for flawless professional masters. Reward good work while maintaining high standards.

PILLAR 1: RECORDING QUALITY (0-25 points)
- Noise floor: Is it clean or noisy? (-5 for audible noise, -2 for minor background)
- Mic distance: Proper proximity or too distant/close? (-3 for poor positioning, -1 for slight issues)
- Room reflections: Dry and controlled, or muddy/reverberant? (-5 for excessive room tone, -2 for minor coloration)
- Clarity: Clean signal or artifacts/distortion? (-5 for digital clipping, -2 for minor artifacts)
Award 21-25 for pristine studio recordings. Good home recordings: 15-20 points. Average: 12-18 points.

PILLAR 2: STEM QUALITY (0-20 points)
- Clipping: Any peaks hitting 0dBFS? (-5 per instance, -2 for near-clipping)
- Phase alignment: Mono compatibility intact? (-4 for phase issues, -1 for minor correlation loss)
- Dynamic consistency: Natural dynamics or over-compressed? (-3 for squashed dynamics, -1 for slight over-compression)
- Signal cleanliness: Free of clicks, pops, DC offset? (-3 for technical issues, -1 for minor imperfections)
Award 18-20 for professional stems. Solid mixes: 13-17 points. Average: 10-14 points.

PILLAR 3: GENRE ACCURACY (0-25 points)
- LUFS target: Does loudness match genre standards? (-5 if >3 LUFS off target, -2 if 1-3 LUFS off)
- Crest factor: Punchy (8-12dB) or flat (3-6dB)? (-4 for incorrect dynamics, -2 for slight mismatch)
- Frequency balance: Appropriate low/mid/high energy for genre? (-5 for imbalanced spectrum, -2 for minor imbalance)
- Stereo width: Mono-compatible yet spacious? (-4 for narrow or phase-problematic width, -1 for minor issues)
Award 23-25 if it nails the genre vibe perfectly. Good genre fit: 17-22 points. Average: 14-18 points.

PILLAR 4: VOCAL-BEAT RELATIONSHIP (0-20 points)
- Lead presence: Vocal sits perfectly or buried/too loud? (-5 for poor balance, -2 for minor level issues)
- Background balance: Supporting elements enhance or compete? (-3 for cluttered mix, -1 for slight competition)
- Reverb/delay: Tasteful space or muddy/dry? (-4 for excessive/insufficient ambience, -1 for slight issues)
- Warmth vs harshness: Pleasant tonality or fatiguing? (-4 for harsh sibilance or thin tone, -1 for minor tonal issues)
Award 18-20 for radio-ready vocal production. Good balance: 13-17 points. Average: 10-14 points.

PILLAR 5: CREATIVE EXCELLENCE (0-10 points)
- Tasteful FX: Creative processing that enhances? (+3 for standout choices, +1 for solid processing)
- Vibe consistency: Does the mix have a clear aesthetic? (+3 for cohesive vision, +2 for good direction)
- Stereo energy: Engaging soundstage? (+2 for immersive field, +1 for decent imaging)
- X-factor: Does it make you feel something? (+2 for emotional impact, +1 for engaging listen)
Award 9-10 for truly special mixes. Solid creative work: 6-8 points. Average: 4-6 points.

SCORING DISTRIBUTION:
92-100: MASTERPIECE (Grammy-level work - extremely rare)
85-91: OUTSTANDING (elite professional quality)
78-84: EXCELLENT (professional release quality)
70-77: VERY GOOD (solid work, minor refinements optional)
60-69: GOOD (release-worthy with small improvements)
50-59: DECENT (needs refinement before release)
Below 50: NEEDS WORK (significant issues to address)

CALCULATE TOTAL SCORE (sum of all 5 pillars, max 100).

Then determine VERDICT:
- "release_ready": Score 70+ AND no critical issues
- "refinements_available": Score 55-69 OR optional improvements available
- "needs_work": Score <55 OR critical technical issues

If NOT release_ready, suggest specific refinements. Be intelligent about what each track ACTUALLY needs:

ANALYSIS FRAMEWORK (Diagnose before recommending):
1. DYNAMICS CHECK: Does it have dynamic issues? (Uncontrolled peaks, limp vocals, pumping, or is it punchy?)
   - If: Uncontrolled peaks → "compression" (surgical ratio, moderate threshold)
   - If: Dynamics already managed → Skip compression
   - If: Limp → Consider "transient_shaper" (attack only, subtle)

2. FREQUENCY CHECK: Does it have tonal imbalances?
   - If: Harsh/sibilant (3-5kHz or 7-8kHz) → "eq" or "parametric_eq" + maybe "de_esser"
   - If: Muddy (200-400Hz buildup) → "eq" surgical cut
   - If: Thin (missing high-end above 10kHz) → "eq" boost
   - If: Frequency balance is good → Skip EQ

3. SIBILANCE CHECK: Does it have excessive sibilance?
   - If: Yes, clear sibilance issues → "de_esser" (7-8kHz detection)
   - If: Natural sibilance or well-controlled → Skip de-esser

RECOMMENDATION PHILOSOPHY (MINIMAL, PROTECTIVE APPROACH):
- NEVER recommend enhancement: no air boosts, presence boosts, saturation, reverb, stereo widening, or transient shaping
- ONLY recommend corrective processing: removing problems, not adding character
- Most well-mixed tracks need NO compression - just protective limiting
- Only recommend compression if dynamics are genuinely erratic or peaks are uncontrolled
- Only recommend de-esser if you hear actual harsh sibilance (not just presence)
- Only recommend EQ cuts—never recommend EQ boosts (let the mix be)
- Be diagnostic: What problem exists RIGHT NOW? Recommend ONLY that fix
- Assume the artist's mix is already good—you are the safety mechanism, not the enhancement tool

LANGUAGE RULES (PROTECTIVE, NOT PROMOTIONAL):
✅ Say: "I hear mud buildup in the 200-400Hz range" (diagnostic, factual)
✅ Say: "A gentle high-pass at 30Hz would remove inaudible rumble" (protective, specific)
✅ Say: "Dynamics are stable—limiting at -1dB is sufficient" (confirmatory, minimal)
✅ Say: "No harsh sibilance detected—skip the de-esser" (honest, protective)
✅ Say: "The mix is well-balanced; standard mastering chain is appropriate" (reassuring)
❌ NEVER say: "Vocals could use presence" (suggests enhancement)
❌ NEVER say: "This needs air/shimmer/brightness" (enhancement-focused)
❌ NEVER say: "I've added saturation for punch" (implies action, not diagnosis)
❌ NEVER say: "Your mix sounds thin" (judgment, not diagnosis)

IMPORTANT:
- Be honest and fair. Most well-mixed tracks score 65-80.
- A score of 95+ means near-PERFECT in every aspect - very rare.
- 85+ should feel like "this is elite professional work."
${hasReference ? '- Compare to reference for genre accuracy scoring.' : ''}
- Confidence should be 0.85+ for release_ready verdict.
- Only recommend corrective Stage 2 actions in Friendly Mode
`;


    const startTime = Date.now();
    console.log('[Echo Report] Starting generation', {
        promptLength: promptContent.length,
        hasReference: !!referenceTrack,
        beforeRMS: metrics.before.rms,
        afterRMS: metrics.after.rms
    });

    try {
        const response = await withRetry(() => withTimeout(ai.models.generateContent({
            model: getGeminiModel(),
            contents: promptContent,
            config: {
                systemInstruction: `You are Echo, a transparent mastering engineer like Ryan Lewis (Doja Cat) or MixedByAli.

YOUR PHILOSOPHY:
Mastering is NOT about adding character, shimmer, air, or enhancement. It's about:
1. Removing problems (mud, harshness, rumble, distortion)
2. Balancing what's there (fair frequency balance, stable dynamics, acceptable loudness)
3. Getting out of the way (let the artist's mix shine through)

WHAT REAL MASTERS DO:
✅ Surgical EQ cuts to remove problem frequencies
✅ Gentle compression to tame erratic dynamics (if needed at all)
✅ Limiter ceiling to prevent clipping
✅ High-pass filter to remove inaudible rumble

WHAT REAL MASTERS DON'T DO:
❌ Boost "air" or "presence" or "sparkle" to make things sound better
❌ Add saturation for "warmth" or "color"
❌ Widen stereo imaging to make mixes sound bigger
❌ Add high-shelf boosts to make things brighter
❌ Apply de-esser unless there's ACTUAL problematic sibilance
❌ Stack multiple processors that compound each other

YOUR ACTUAL GOAL:
Diagnose what's ACTUALLY wrong. Recommend ONLY what fixes that specific problem. Most well-mixed tracks need minimal intervention - maybe a gentle high-pass, maybe a small EQ cut, maybe light compression. That's it. Done.

RECOMMENDATION CONSTRAINT:
- Do NOT recommend de-esser unless you hear actual harsh sibilance
- Do NOT recommend high-shelf or air boosts—these are enhancement, not correction
- Do NOT recommend saturation, reverb, stereo widening, or transient shaping
- Do NOT stack multiple EQ bands with boosts—choose ONE problem to fix
- Keep all EQ cuts shallow (≤3dB) unless there's serious mud
- Keep compression ratios low (≤2:1) and thresholds moderate (≥-12dB)
- Assume the artist's mix is already good—your job is protection, not improvement

LANGUAGE:
Say: "I detect rumble below 30Hz" (problem-focused)
Say: "Limiting at -1dB would protect against peaks" (correction-focused)
Do NOT say: "This needs more air" or "Add presence" or "Shimmer would help" (enhancement-focused)

You are the guardrail, not the enhancement engine.`,
                temperature: 0.3,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        summary: { type: Type.STRING },
                        verdict: { type: Type.STRING },
                        verdictReason: { type: Type.STRING },
                        score: {
                            type: Type.OBJECT,
                            properties: {
                                total: { type: Type.NUMBER },
                                recordingQuality: { type: Type.NUMBER },
                                stemQuality: { type: Type.NUMBER },
                                genreAccuracy: { type: Type.NUMBER },
                                vocalBeatRelationship: { type: Type.NUMBER },
                                creativeExcellence: { type: Type.NUMBER }
                            }
                        },
                        explanation: { type: Type.ARRAY, items: { type: Type.STRING } },
                        recommended_actions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    id: { type: Type.STRING },
                                    label: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                    type: { type: Type.STRING },
                                    refinementType: { type: Type.STRING },
                                    bands: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                freqHz: { type: Type.NUMBER },
                                                gainDb: { type: Type.NUMBER },
                                                enabledByDefault: { type: Type.BOOLEAN }
                                            }
                                        }
                                    },
                                    params: {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.OBJECT,
                                            properties: {
                                                name: { type: Type.STRING },
                                                value: { type: Type.STRING },
                                                enabledByDefault: { type: Type.BOOLEAN }
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        confidence: { type: Type.NUMBER }
                    }
                }
            }
        }), 60000)); // 1 minute timeout + retry on 503

        const duration = Date.now() - startTime;
        console.log('[Echo Report] Response received', { duration: `${duration}ms`, responseLength: response.text?.length || 0 });

        const parsed = robustJsonParse(response.text || "{}");
        if (!parsed || Object.keys(parsed).length === 0) throw new Error("Empty report");

        // Normalize the response
        parsed.explanation = Array.isArray(parsed.explanation) ? parsed.explanation : [];
        parsed.recommended_actions = Array.isArray(parsed.recommended_actions) ? parsed.recommended_actions : [];
        parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.0;
        parsed.verdict = ['release_ready', 'refinements_available', 'needs_work'].includes(parsed.verdict)
            ? parsed.verdict
            : 'refinements_available';
        parsed.verdictReason = parsed.verdictReason || 'Analysis complete.';

        // Normalize 99 Club scoring
        if (!parsed.score || typeof parsed.score !== 'object') {
            parsed.score = {
                total: 0,
                recordingQuality: 0,
                stemQuality: 0,
                genreAccuracy: 0,
                vocalBeatRelationship: 0,
                creativeExcellence: 0
            };
        } else {
            parsed.score.total = typeof parsed.score.total === 'number' ? Math.round(parsed.score.total) : 0;
            parsed.score.recordingQuality = typeof parsed.score.recordingQuality === 'number' ? Math.round(parsed.score.recordingQuality) : 0;
            parsed.score.stemQuality = typeof parsed.score.stemQuality === 'number' ? Math.round(parsed.score.stemQuality) : 0;
            parsed.score.genreAccuracy = typeof parsed.score.genreAccuracy === 'number' ? Math.round(parsed.score.genreAccuracy) : 0;
            parsed.score.vocalBeatRelationship = typeof parsed.score.vocalBeatRelationship === 'number' ? Math.round(parsed.score.vocalBeatRelationship) : 0;
            parsed.score.creativeExcellence = typeof parsed.score.creativeExcellence === 'number' ? Math.round(parsed.score.creativeExcellence) : 0;
        }

        const totalDuration = Date.now() - startTime;
        console.log('[Echo Report] Success', {
            totalDuration: `${totalDuration}ms`,
            verdict: parsed.verdict,
            score: parsed.score?.total || 0,
            actionsCount: parsed.recommended_actions?.length || 0
        });
        return parsed as EchoReport;

    } catch (e: any) {
        const duration = Date.now() - startTime;
        console.error('[Echo Report] FAILED', {
            duration: `${duration}ms`,
            error: e.message,
            stack: e.stack,
            isTimeout: e.message?.includes('timed out'),
            errorType: e.constructor.name,
            fullError: e,
            response: (e as any).response?.status,
            responseText: (e as any).response?.text
        });
        return {
            summary: `Error: ${e.message}`,
            explanation: [],
            recommended_actions: [],
            confidence: 0.0,
            verdict: 'needs_work',
            verdictReason: 'Unable to analyze - please try again.',
            score: {
                total: 0,
                recordingQuality: 0,
                stemQuality: 0,
                genreAccuracy: 0,
                vocalBeatRelationship: 0,
                creativeExcellence: 0
            }
        };
    }
};

export const analyzeReferenceGap = async (userMetrics: AudioMetrics, refMetrics: AudioMetrics, genre?: string): Promise<GapAnalysis> => {
    // Stub for reference gap analysis
     return {
        referenceMetrics: refMetrics,
        explanation: "Gap analysis unavailable in this version.",
        eqCorrection: undefined
    };
};

// ============================================================================
// PHASE 3: LLM REASONING (Interpretation Layer)
// ============================================================================

export const reasonAboutListeningPass = async (input: any): Promise<any> => {
    try {
        // Validate input
        if (!input || !input.listeningPass) {
            throw new Error('Invalid input: listeningPass data required');
        }

        const { listeningPass, mode } = input;
        const { tokens, priority_summary, analysis_confidence } = listeningPass;

        // Timeout protection (generous timeout to handle rate limit retries)
        const timeoutMs = 180000; // 3 minutes (allows for 429 retry delays)
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), timeoutMs)
        );

        // Check if there's anything to recommend
        const hasDominantTokens = priority_summary.dominant_tokens && priority_summary.dominant_tokens.length > 0;

        if (!hasDominantTokens) {
            // No concerns detected - return reassurance
            return {
                guidance_text: 'No listener concerns detected. Your mix is in great shape.',
                processing: {
                    tokens_read: tokens.length,
                    confidence_level: analysis_confidence,
                    mode: 'friendly',
                    dominant_token: null,
                },
            };
        }

        // Get dominant token details
        const dominantTokenId = priority_summary.dominant_tokens[0];
        const dominantToken = tokens.find((t: any) => t.token_id === dominantTokenId);

        if (!dominantToken) {
            throw new Error(`Dominant token ${dominantTokenId} not found in tokens`);
        }

        // Build Friendly Mode guidance (LLM_OUTPUT_CONTRACT.md compliant)
        // This is the interpretation layer - translating tokens to human guidance
        let guidanceText = '';

        if (dominantTokenId === 'FATIGUE_EVENT' && dominantToken.detected) {
            guidanceText =
                `Your mix is listener-friendly with one focus area.\n\n` +
                `FOCUS AREA: Listener Fatigue\n` +
                `${dominantToken.listener_impact}\n\n` +
                `WHAT TO EXPLORE\n` +
                `Consider a gentle de-esser around 7kHz or a soft high-shelf reduction around 3kHz. ` +
                `Listen on headphones to verify this is what you're hearing.\n\n` +
                `WHAT'S WORKING\n` +
                (tokens[1]?.detected === false ? `✓ ${tokens[1].listener_impact}\n` : '') +
                (tokens[2]?.detected === false ? `✓ ${tokens[2].listener_impact}\n` : '') +
                `\nIf you address the upper-mid sharpness, your mix will be listener-friendly.`;
        } else if (dominantTokenId === 'INTELLIGIBILITY_LOSS' && dominantToken.detected) {
            guidanceText =
                `Your mix has one focus area for listener clarity.\n\n` +
                `FOCUS AREA: Speech/Lead Clarity\n` +
                `${dominantToken.listener_impact}\n\n` +
                `WHAT TO EXPLORE\n` +
                `Consider a gentle mid-range boost around 2-4kHz or reduce competing frequencies. ` +
                `Listen on headphones with the lead isolated.\n\n` +
                `WHAT'S WORKING\n` +
                (tokens[0]?.detected === false ? `✓ ${tokens[0].listener_impact}\n` : '') +
                (tokens[2]?.detected === false ? `✓ ${tokens[2].listener_impact}\n` : '') +
                `\nImproving clarity will make your mix more engaging.`;
        } else if (dominantTokenId === 'INSTABILITY_EVENT' && dominantToken.detected && !dominantToken.suppressed) {
            guidanceText =
                `Your mix has one focus area for transient control.\n\n` +
                `FOCUS AREA: Transient Behavior\n` +
                `${dominantToken.listener_impact}\n\n` +
                `WHAT TO EXPLORE\n` +
                `Consider tightening drum timing or adjusting attack/release on dynamics. ` +
                `Listen to how predictable the rhythm feels.\n\n` +
                `WHAT'S WORKING\n` +
                (tokens[0]?.detected === false ? `✓ ${tokens[0].listener_impact}\n` : '') +
                (tokens[1]?.detected === false ? `✓ ${tokens[1].listener_impact}\n` : '') +
                `\nStabilizing transients will make your mix feel intentional.`;
        } else {
            // Fallback for other cases
            guidanceText = 'Your mix is ready for review. Check the analysis details for more information.';
        }

        return {
            guidance_text: guidanceText,
            processing: {
                tokens_read: tokens.length,
                confidence_level: analysis_confidence,
                mode: 'friendly',
                dominant_token: dominantTokenId,
            },
        };
    } catch (error) {
        console.error('[LLM Reasoning Error]', error);

        // Fallback: Return safe reassurance
        return {
            guidance_text: 'Analysis complete. AI reasoning temporarily unavailable. Review the analysis details.',
            processing: {
                tokens_read: 0,
                confidence_level: 0,
                mode: 'fallback',
                dominant_token: null,
            },
        };
    }
};

export const analyzeComparison = async (report: ProcessingReport): Promise<RefinementSuggestion> => {
    return { summary: "Echo Report is now active for detailed comparisons." };
};