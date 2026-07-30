import type { AnalysisResult, AudioMetrics, ProcessingConfig, ReferenceTrack } from '../../types';
import type { FinishLoopAnalysis } from './finishLoopEngine';
import type { ReferenceDeltaAnalysis } from './referenceDeltaEngine';
import type { SessionFinishAuthorityAnalysis } from './sessionFinishAuthority';

export type EliteReadiness = 'ready' | 'building' | 'needs_work';

export interface EliteMixingLayer {
  title: string;
  readiness: EliteReadiness;
  score: number;
  summary: string;
  evidence: string;
  action: string;
}

export interface EliteMixingAdvisorInput {
  analysisResult: AnalysisResult | null;
  originalMetrics: AudioMetrics | null;
  processedMetrics: AudioMetrics | null;
  currentConfig: ProcessingConfig | null;
  referenceTrack: ReferenceTrack | null;
  referenceDelta: ReferenceDeltaAnalysis | null;
  finishLoop: FinishLoopAnalysis | null;
  sessionFinish: SessionFinishAuthorityAnalysis | null;
  snapshotABActive: boolean;
}

export interface EliteMixingAdvisorOutput {
  headline: string;
  pitchLine: string;
  layers: EliteMixingLayer[];
  overlapNotes: string[];
  nextBestMove: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const scoreToReadiness = (score: number): EliteReadiness => {
  if (score >= 76) return 'ready';
  if (score >= 45) return 'building';
  return 'needs_work';
};

function formatDelta(value: number | undefined, suffix: string): string {
  if (!Number.isFinite(value)) return `n/a ${suffix}`;
  const sign = value! > 0 ? '+' : '';
  return `${sign}${value!.toFixed(1)} ${suffix}`;
}

function analyzeABLayer(input: EliteMixingAdvisorInput): EliteMixingLayer {
  const referenceScore = input.referenceDelta?.matchScore ?? 0;
  const finishScore = input.finishLoop?.finishScore ? input.finishLoop.finishScore * 10 : 0;
  const sessionScore = input.sessionFinish?.authorityScore ?? 0;
  const contrastScore = input.originalMetrics && input.processedMetrics
    ? clamp(100 - Math.abs(input.processedMetrics.crestFactor - input.originalMetrics.crestFactor) * 6, 0, 100)
    : referenceScore;
  const score = Math.round((referenceScore * 0.45) + (finishScore * 0.25) + (sessionScore * 0.15) + (contrastScore * 0.15));
  const readiness = scoreToReadiness(score);

  return {
    title: 'Undeniable A/B',
    readiness,
    score,
    summary: input.snapshotABActive
      ? 'The compare path is live. The contrast should land in one listen.'
      : 'The compare path already exists; this layer only checks whether the contrast is strong enough to sell itself.',
    evidence: input.referenceDelta
      ? `Reference delta: ${input.referenceDelta.matchScore}% match, loudness delta ${formatDelta(input.referenceDelta.loudness.delta, 'LUFS')}.`
      : 'No reference delta loaded yet, so the comparison story is being inferred from the finish signals.',
    action: input.snapshotABActive
      ? 'Keep the A/B contrast obvious and do not blur the before/after.'
      : 'Use the existing A/B toggle. The difference should land in 5 to 10 seconds.',
  };
}

function analyzeSourceLayer(input: EliteMixingAdvisorInput): EliteMixingLayer {
  const conditioning = (input.analysisResult?.intakeConditioning as any)?.report;
  const guardrails = input.analysisResult?.guardrailAnalysis as any;
  const lowEnd = input.analysisResult?.lowEndAnalysis as any;

  let score = 30;
  if (conditioning) {
    if (conditioning.verdict === 'ready') score += 35;
    else if (conditioning.verdict === 'needs_conditioning') score += 14;
    else score -= 8;

    score += clamp(conditioning.gainStaging.headroomDb * 2.5, 0, 18);
    score += clamp(conditioning.dynamics.consistencyScore * 0.25, 0, 20);
    if (!conditioning.gainStaging.clipping) score += 8;
    if (!conditioning.noiseSources.hum50Hz && !conditioning.noiseSources.hum60Hz) score += 4;
    if (conditioning.noiseSources.clicks === 0) score += 4;
  } else if (input.originalMetrics) {
    score += clamp(input.originalMetrics.crestFactor * 2.2, 0, 20);
    if ((input.originalMetrics.lufs?.truePeak ?? -99) <= -1) score += 10;
  }

  if (guardrails && guardrails.score >= 75) score += 8;
  if (lowEnd && (lowEnd.verdict === 'stable' || lowEnd.verdict === 'tight')) score += 8;

  score = Math.round(clamp(score, 0, 100));

  return {
    title: 'Source & Monitoring Discipline',
    readiness: scoreToReadiness(score),
    score,
    summary: conditioning
      ? conditioning.recommendedNextStep
      : 'Source discipline is inferred from the current mix state; clean tracking and consistent monitoring still matter more than extra processing.',
    evidence: conditioning
      ? `Intake verdict: ${conditioning.verdict}. Headroom ${conditioning.gainStaging.headroomDb.toFixed(1)} dB, consistency ${conditioning.dynamics.consistencyScore.toFixed(0)}%.`
      : input.referenceTrack
        ? 'A reference track is loaded, but the intake conditioning report is missing.'
        : 'No source conditioning report or reference track is loaded, so this layer remains advisory only.',
    action: conditioning
      ? 'Keep tracking clean, preserve headroom, and monitor through one consistent playback chain.'
      : 'Load a cleaner source and validate the monitoring chain before chasing more polish.',
  };
}

function analyzeTasteLayer(input: EliteMixingAdvisorInput): EliteMixingLayer {
  const config = input.currentConfig ?? {};
  const reverb = config.motionReverb;
  const delay = config.delay;
  const transient = config.transientShaper;
  const stereo = config.stereoImager;

  let score = 28;
  if (reverb && reverb.mix > 0) {
    score += 24;
    if (reverb.motion && reverb.motion.depth > 0) score += 10;
    if (reverb.preDelay >= 0.01 && reverb.preDelay <= 0.05) score += 8;
  }
  if (delay && delay.mix > 0) {
    score += 14;
    if (delay.time > 0) score += 4;
  }
  if (transient) {
    score += clamp(Math.abs(transient.attack) * 12, 0, 10);
    score += clamp(Math.abs(transient.sustain) * 8, 0, 10);
  }
  if (stereo) {
    score += clamp((stereo.midWidth + stereo.highWidth) / 4, 0, 16);
  }
  if (input.finishLoop?.translationAuthority.verdict === 'pass') score += 10;
  if (input.sessionFinish?.verdict === 'ready') score += 8;

  score = Math.round(clamp(score, 0, 100));

  const hasDepthMoves = !!(reverb?.mix || delay?.mix || stereo);
  return {
    title: 'Taste-Level Automation & Depth',
    readiness: scoreToReadiness(score),
    score,
    summary: hasDepthMoves
      ? 'Depth is controllable instead of flat.'
      : 'Depth is still implied rather than orchestrated.',
    evidence: [
      reverb ? `Motion reverb ${Math.round(reverb.mix * 100)}% mix` : 'No motion reverb engaged',
      delay ? `Delay mix ${Math.round(delay.mix * 100)}% at ${Math.round(delay.time * 1000)}ms` : 'No delay depth layer engaged',
      transient ? `Transient shape attack ${Math.round(transient.attack * 100)} / sustain ${Math.round(transient.sustain * 100)}` : 'No transient contour layer engaged',
    ].join(' · '),
    action: hasDepthMoves
      ? 'Use small, deterministic moves to keep depth musical and invisible.'
      : 'Add selective depth moves, not blanket processing.',
  };
}

function analyzePitchLayer(input: EliteMixingAdvisorInput): EliteMixingLayer {
  const finishScore = input.finishLoop?.finishScore ? input.finishLoop.finishScore * 10 : 0;
  const sessionScore = input.sessionFinish?.authorityScore ?? 0;
  const referenceScore = input.referenceDelta?.matchScore ?? 0;
  const score = Math.round(clamp((finishScore * 0.4) + (sessionScore * 0.35) + (referenceScore * 0.25), 0, 100));

  return {
    title: 'Pitch Proof',
    readiness: scoreToReadiness(score),
    score,
    summary: 'One input. One transformation. One proof moment.',
    evidence: input.sessionFinish?.summary || input.finishLoop?.summary || 'The system already has release-facing proof language in place.',
    action: input.snapshotABActive
      ? 'Show the before/after, then land on the release-ready moment.'
      : 'Keep the demo short: input, transform, proof, invitation.',
  };
}

export function analyzeEliteMixingAdvisor(input: EliteMixingAdvisorInput): EliteMixingAdvisorOutput {
  const layers = [
    analyzeABLayer(input),
    analyzeSourceLayer(input),
    analyzeTasteLayer(input),
    analyzePitchLayer(input),
  ];

  const readyCount = layers.filter((layer) => layer.readiness === 'ready').length;
  const headline = readyCount >= 3
    ? 'This mix is ready.'
    : 'One decisive pass remains.';

  const overlapNotes = [
    'A/B is already covered by the existing snapshot compare path, so this panel only reads the contrast instead of duplicating the control.',
    'Translation authority already exists in the finish loop and reference delta stack, so the new layer reuses those signals.',
    'The demo proof moment is handled by the dedicated showcase modal, so this panel stays focused on mix behavior and pitch evidence.',
  ];

  const pitchLine = input.snapshotABActive
    ? 'The before/after is live. The room should hear it in one listen.'
    : 'The before/after path is available. The proof story is ready to present.';

  const nextBestMove = layers.find((layer) => layer.readiness !== 'ready')?.action
    || 'Keep the contrast obvious and avoid adding unnecessary processing.';

  return {
    headline,
    pitchLine,
    layers,
    overlapNotes,
    nextBestMove,
  };
}
