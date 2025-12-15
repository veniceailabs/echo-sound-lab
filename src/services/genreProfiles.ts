/**
 * Genre/Vibe Profiles - Aesthetic targets for mix analysis
 * Each profile defines what "good" means for that style
 */

export interface GenreProfile {
  id: string;
  name: string;
  description: string;
  icon: string;

  // Target values (ranges)
  targets: {
    lufsIntegrated: { min: number; max: number; ideal: number };
    dynamics: { min: number; max: number; description: string };
    lowEnd: { emphasis: 'heavy' | 'balanced' | 'light'; subFreq: number; description: string };
    highEnd: { brightness: 'dark' | 'neutral' | 'bright'; airFreq: number; description: string };
    stereoWidth: { narrow: number; wide: number; description: string };
    vocalPlacement: { forward: boolean; wetness: 'dry' | 'moderate' | 'wet'; description: string };
  };

  // Artistic guidance
  aesthetic: {
    vibe: string;
    space: string;
    energy: string;
    reference: string[];
  };

  // Analysis prompts - how AI should judge this style
  analysisContext: string;

  // Common "mistakes" for this genre
  commonIssues: string[];
}

export const GENRE_PROFILES: GenreProfile[] = [
  {
    id: 'ovo-toronto',
    name: 'OVO / Toronto Sound',
    description: 'Dark, atmospheric, intimate vocals with breathing space',
    icon: 'OVO',
    targets: {
      lufsIntegrated: { min: -12, max: -9, ideal: -10 },
      dynamics: { min: 6, max: 10, description: 'Preserve dynamics, dont crush' },
      lowEnd: { emphasis: 'heavy', subFreq: 55, description: '808s present but controlled, room to breathe' },
      highEnd: { brightness: 'dark', airFreq: 12000, description: 'Rolled off highs, smooth not crispy' },
      stereoWidth: { narrow: 60, wide: 85, description: 'Intimate center, wide atmospherics' },
      vocalPlacement: { forward: true, wetness: 'dry', description: 'Close, intimate, minimal verb' },
    },
    aesthetic: {
      vibe: '3am in the city, emotional but confident',
      space: 'Let silence work. Dont fill every gap.',
      energy: 'Simmering, builds through restraint',
      reference: ['Marvins Room', 'Jungle', 'Passionfruit', 'Chicago Freestyle'],
    },
    analysisContext: `This mix should feel intimate and atmospheric. Vocals should sound
close to the listener, like a late-night confession. 808s need weight but shouldn't
overwhelm - the Toronto sound breathes. Avoid overly bright or aggressive processing.
Space and silence are features, not problems. Judge harshness more critically than
typical - this style values smooth over present.`,
    commonIssues: [
      'Vocals too wet/reverby - kills intimacy',
      'Mix too bright - should feel darker, smoother',
      '808s too aggressive - need more control and space',
      'Too dense - Toronto sound needs room to breathe',
      'Over-compressed - dynamics are essential to the vibe',
    ],
  },
  {
    id: 'atlanta-trap',
    name: 'Atlanta Trap',
    description: 'Hard 808s, aggressive energy, loud and present',
    icon: 'ATL',
    targets: {
      lufsIntegrated: { min: -8, max: -5, ideal: -6 },
      dynamics: { min: 4, max: 7, description: 'Compressed but punchy' },
      lowEnd: { emphasis: 'heavy', subFreq: 45, description: 'Dominant 808, hits hard in the chest' },
      highEnd: { brightness: 'bright', airFreq: 14000, description: 'Crispy hats, present highs' },
      stereoWidth: { narrow: 70, wide: 100, description: 'Wide and aggressive' },
      vocalPlacement: { forward: true, wetness: 'moderate', description: 'Aggressive, in your face' },
    },
    aesthetic: {
      vibe: 'Club energy, aggressive confidence',
      space: 'Fill it up. Energy should feel relentless.',
      energy: 'High intensity throughout, drops hit hard',
      reference: ['Mask Off', 'Bad and Boujee', 'XO Tour Life', 'Savage Mode'],
    },
    analysisContext: `This mix should hit HARD. 808s are the foundation - they should
physically move the listener. Vocals cut through with presence and attitude. Hi-hats
crispy and wide. This style values impact over subtlety. Loudness is expected.
Compression is a feature. Judge low-end impact critically - if the 808 doesn't hit,
the mix fails regardless of other elements.`,
    commonIssues: [
      '808s too quiet or weak - need chest-hitting impact',
      'Mix too dynamic - trap should be consistently loud',
      'Vocals buried - need to cut through the instrumental',
      'Hi-hats too dull - should be crispy and present',
      'Not loud enough - competitive loudness expected',
    ],
  },
  {
    id: 'bedroom-pop',
    name: 'Bedroom Pop / Lo-Fi',
    description: 'Warm, imperfect, nostalgic with analog character',
    icon: 'LO',
    targets: {
      lufsIntegrated: { min: -14, max: -10, ideal: -12 },
      dynamics: { min: 8, max: 14, description: 'Very dynamic, natural feel' },
      lowEnd: { emphasis: 'light', subFreq: 80, description: 'Warm but not heavy, rolled off sub' },
      highEnd: { brightness: 'dark', airFreq: 10000, description: 'Rolled off, tape-like warmth' },
      stereoWidth: { narrow: 50, wide: 75, description: 'Intimate, not too wide' },
      vocalPlacement: { forward: false, wetness: 'wet', description: 'Sits in the mix, dreamy verb' },
    },
    aesthetic: {
      vibe: 'Nostalgic, imperfect, handmade feel',
      space: 'Embrace the lo-fi. Imperfection is character.',
      energy: 'Mellow, wistful, late-night melancholy',
      reference: ['Clairo - Pretty Girl', 'Rex Orange County', 'boy pablo', 'beabadoobee'],
    },
    analysisContext: `This mix should feel warm and imperfect. Pristine clarity is NOT
the goal - character is. Saturation, tape hiss, vinyl crackle are features. Vocals
can sit back in reverb. Low end should be warm, not subby. High frequencies rolled
off like tape. Judge "cleanliness" less harshly - some mud is vibe. Focus on emotional
feel over technical perfection.`,
    commonIssues: [
      'Too clean/polished - needs more character and warmth',
      'Too loud - bedroom pop breathes quietly',
      'Low end too subby - should be warm not boomy',
      'Vocals too dry/present - let them sit in the mix',
      'Too bright/modern sounding - roll off those highs',
    ],
  },
  {
    id: 'classic-hiphop',
    name: 'Classic Hip-Hop',
    description: 'Punchy drums, sample-based warmth, vocal clarity',
    icon: 'HIP',
    targets: {
      lufsIntegrated: { min: -11, max: -8, ideal: -9 },
      dynamics: { min: 6, max: 9, description: 'Punchy but controlled' },
      lowEnd: { emphasis: 'balanced', subFreq: 60, description: 'Kick-focused, tight not boomy' },
      highEnd: { brightness: 'neutral', airFreq: 12000, description: 'Present but not harsh' },
      stereoWidth: { narrow: 60, wide: 80, description: 'Mostly mono-compatible' },
      vocalPlacement: { forward: true, wetness: 'dry', description: 'Upfront and clear, minimal fx' },
    },
    aesthetic: {
      vibe: 'Head-nodding groove, lyrical focus',
      space: 'Tight and punchy. Every hit intentional.',
      energy: 'Confident flow, pocket-focused',
      reference: ['Nas - Illmatic', 'Kendrick - GKMC', 'J Cole - Forest Hills', 'Joey Badass'],
    },
    analysisContext: `This mix should make heads nod. Drums need PUNCH - kick and snare
cut through clearly. Vocals are king - lyrics must be intelligible and upfront.
Sample chops should have warmth. Groove and pocket matter more than loudness.
Judge drum impact and vocal clarity critically. Mono compatibility important -
this should bang on any system.`,
    commonIssues: [
      'Drums lack punch - kick and snare should hit hard',
      'Vocals buried or muddy - lyrics need to be clear',
      'Low end too subby - classic hip-hop is kick-focused',
      'Stereo too wide - needs mono compatibility',
      'Over-processed - should feel natural and groovy',
    ],
  },
  {
    id: 'rnb-ballad',
    name: 'R&B Ballad',
    description: 'Vocal-forward, lush, emotional depth with space',
    icon: 'RnB',
    targets: {
      lufsIntegrated: { min: -12, max: -8, ideal: -10 },
      dynamics: { min: 7, max: 11, description: 'Dynamic, emotional range preserved' },
      lowEnd: { emphasis: 'balanced', subFreq: 50, description: 'Supportive bass, not dominant' },
      highEnd: { brightness: 'neutral', airFreq: 14000, description: 'Airy, silky top end' },
      stereoWidth: { narrow: 70, wide: 95, description: 'Lush and wide, enveloping' },
      vocalPlacement: { forward: true, wetness: 'moderate', description: 'Center stage, tasteful verb' },
    },
    aesthetic: {
      vibe: 'Emotional, sensual, vulnerable',
      space: 'Lush but not cluttered. Vocal is the star.',
      energy: 'Builds emotionally, dynamic peaks matter',
      reference: ['SZA - Good Days', 'Frank Ocean - Thinkin Bout You', 'Summer Walker', 'Daniel Caesar'],
    },
    analysisContext: `This mix lives and dies by the vocal. It must be emotional,
present, and beautifully treated. Harmonies should blend but support lead.
Instrumentation creates space FOR the voice, not competing with it. Reverb and
delay should enhance emotion without washing out intimacy. High end should feel
silky and expensive. Judge vocal treatment critically - it's everything.`,
    commonIssues: [
      'Vocals not emotional enough - need presence and intimacy',
      'Instrumental competing with vocal - should support, not fight',
      'Reverb washing out the vocal - needs to stay intimate',
      'Harmonies too loud - should support, not distract',
      'Mix too flat dynamically - R&B needs emotional peaks',
    ],
  },
  {
    id: 'hyperpop',
    name: 'Hyperpop / Experimental',
    description: 'Maximalist, distorted, genre-bending chaos',
    icon: 'HP',
    targets: {
      lufsIntegrated: { min: -7, max: -4, ideal: -5 },
      dynamics: { min: 2, max: 5, description: 'Crushed, intentionally limited' },
      lowEnd: { emphasis: 'heavy', subFreq: 40, description: '808s distorted and aggressive' },
      highEnd: { brightness: 'bright', airFreq: 16000, description: 'Sparkly, sometimes harsh - intentionally' },
      stereoWidth: { narrow: 80, wide: 120, description: 'Extremely wide, panning automation' },
      vocalPlacement: { forward: true, wetness: 'wet', description: 'Processed, pitched, effected heavily' },
    },
    aesthetic: {
      vibe: 'Chaotic, digital maximalism, future sound',
      space: 'MORE. Layer it. Break conventions.',
      energy: 'Overwhelming in the best way',
      reference: ['100 gecs', 'SOPHIE', 'Charli XCX - Vroom Vroom', 'Bladee'],
    },
    analysisContext: `Rules dont apply here. Distortion is intentional. Clipping can
be a feature. Pitch-shifted vocals are expected. This style embraces what other
genres call "mistakes". Judge by intention and impact, not traditional metrics.
If it sounds broken but exciting, it's probably working. The only failure is
being boring or conventional.`,
    commonIssues: [
      'Too clean/safe - hyperpop should push boundaries',
      'Not loud enough - this genre is LOUD',
      'Vocals too natural - should be processed and manipulated',
      'Mix too conventional - break the rules more',
      'Not enough energy/chaos - should feel overwhelming',
    ],
  },
];

/**
 * Get profile by ID
 */
export const getProfile = (id: string): GenreProfile | null => {
  return GENRE_PROFILES.find(p => p.id === id) || null;
};

/**
 * Get all profiles
 */
export const getAllProfiles = (): GenreProfile[] => {
  return GENRE_PROFILES;
};

/**
 * Generate analysis prompt modifier based on profile
 */
export const getAnalysisPromptForProfile = (profile: GenreProfile): string => {
  return `
GENRE CONTEXT: ${profile.name}
${profile.analysisContext}

TARGET AESTHETICS:
- Vibe: ${profile.aesthetic.vibe}
- Space: ${profile.aesthetic.space}
- Energy: ${profile.aesthetic.energy}
- Reference tracks: ${profile.aesthetic.reference.join(', ')}

TARGET METRICS:
- LUFS: ${profile.targets.lufsIntegrated.ideal} (range: ${profile.targets.lufsIntegrated.min} to ${profile.targets.lufsIntegrated.max})
- Dynamics: ${profile.targets.dynamics.description}
- Low End: ${profile.targets.lowEnd.description}
- High End: ${profile.targets.highEnd.description}
- Stereo: ${profile.targets.stereoWidth.description}
- Vocals: ${profile.targets.vocalPlacement.description}

COMMON ISSUES TO CHECK:
${profile.commonIssues.map(issue => `- ${issue}`).join('\n')}

Judge this mix against ${profile.name} standards, not generic "good mix" rules.
Be specific about how it succeeds or fails for THIS aesthetic.
`;
};

export default GENRE_PROFILES;
