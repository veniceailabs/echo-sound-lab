import { GoogleGenAI, Type } from "@google/genai";
import { AudioMetrics, ChatMessage, ProcessingReport, GapAnalysis, Stem, MixAnalysis, RefinementSuggestion, Suggestion, MixSignature, MixIntent, EchoMetrics, EchoReport, EchoAction, ProcessingConfig, MixReadiness } from '../types';
import { GenreProfile, getAnalysisPromptForProfile } from './genreProfiles';

// Initialize Gemini with import.meta.env for Vite
const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });

// Timeout wrapper for AI calls to prevent infinite hanging
const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number = 30000): Promise<T> => {
    const timeoutPromise = new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`AI request timed out after ${timeoutMs}ms`)), timeoutMs)
    );
    return Promise.race([promise, timeoutPromise]);
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
You are Echo, an expert audio mastering AI assistant. Your goal is to provide structured, actionable processing steps in a specific JSON format to help users create professional, commercially viable masters.

CRITICAL LOW-END PRESERVATION RULES:
- NEVER suggest aggressive cuts below 100Hz unless there is clear evidence of mud or rumble
- For bass-heavy genres (Hip-Hop, Electronic, Pop, R&B), preserve and enhance low-end (20-100Hz)
- Low-shelf boosts should be conservative (+1 to +3dB max) to avoid distortion
- Sub-bass (20-50Hz) should only be cut if explicitly problematic, never by default
- Bass (50-100Hz) is critical for warmth and power - preserve it
- If reducing low-end, explain why it's necessary in the description
- Prefer gentle high-pass filters (12dB/oct at 20-30Hz) to remove only true subsonic content
- For mastering, low-end compression should be gentle (ratios 2:1 to 3:1 max)
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
            model: 'gemini-2.5-flash',
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
            model: 'gemini-2.5-flash',
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
    const response = await withTimeout(ai.models.generateContent({
      model: 'gemini-2.5-flash',
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
    }));

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
    
    const prompt = `Analyze ${stems.length} stems. Identify conflicts and suggest fixes.`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: "application/json"
            }
        });

        const parsed = robustJsonParse(response.text || "{}");
        if (parsed.stemSuggestions && Array.isArray(parsed.stemSuggestions)) {
            parsed.stemSuggestions = parsed.stemSuggestions.map((s: any) => ({ ...s, isSelected: true }));
        }
        return parsed as MixAnalysis;

    } catch (e: any) { 
        return {
            conflicts: ["Analysis unavailable"],
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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
      model: 'gemini-2.5-flash',
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

If NOT release_ready, suggest specific refinements.

IMPORTANT:
- Be honest and fair. Most well-mixed tracks score 65-80.
- A score of 95+ means near-PERFECT in every aspect - very rare.
- 85+ should feel like "this is elite professional work."
${hasReference ? '- Compare to reference for genre accuracy scoring.' : ''}
- Confidence should be 0.85+ for release_ready verdict.
`;

    const startTime = Date.now();
    console.log('[Echo Report] Starting generation', {
        promptLength: promptContent.length,
        hasReference: !!referenceTrack,
        beforeRMS: metrics.before.rms,
        afterRMS: metrics.after.rms
    });

    try {
        const response = await withTimeout(ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: promptContent,
            config: {
                systemInstruction: "You are Echo, a Grammy-winning mastering engineer AI. Be honest and specific. Return ONLY valid JSON.",
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
                                    bands: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { freqHz: { type: Type.NUMBER }, gainDb: { type: Type.NUMBER }, enabledByDefault: { type: Type.BOOLEAN } } } },
                                    params: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, value: { oneOf: [{ type: Type.NUMBER }, { type: Type.STRING }] }, enabledByDefault: { type: Type.BOOLEAN } } } }
                                }
                            }
                        },
                        confidence: { type: Type.NUMBER }
                    }
                }
            }
        }));

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
            errorType: e.constructor.name
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

export const analyzeComparison = async (report: ProcessingReport): Promise<RefinementSuggestion> => {
    return { summary: "Echo Report is now active for detailed comparisons." };
};