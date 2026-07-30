import type { ArrangementAnalysis } from './arrangementAnalyzer';
import type { VocalIntentAnalysis } from './vocal/vocalIntentDetector';
import type { VocalContextAwarenessAnalysis } from './vocal/contextAwareness';
import type { HookLiftAnalysis } from './vocal/hookLiftLogic';
import type { AdLibPlacementAnalysis } from './vocal/adlibPlacement';
import type { DelayAutomationAnalysis } from './vocal/delayAutomationLogic';
import type { VocalGuardrailAnalysis } from './vocal/guardrails';

export interface APLPerceptualField {
  clarity: number;
  density: number;
  motion: number;
  width: number;
  depth: number;
  punch: number;
  restraint: number;
  lift: number;
  risk: number;
  targetLufs: number;
  targetDynamicRange: number;
  peakCeilingDb: number;
  stabilityScore: number;
  rationale: string[];
}

export interface APLPerceptualFieldContext {
  arrangement?: ArrangementAnalysis | null;
  vocalIntent?: VocalIntentAnalysis | null;
  contextAwareness?: VocalContextAwarenessAnalysis | null;
  hookLift?: HookLiftAnalysis | null;
  adLibPlacement?: AdLibPlacementAnalysis | null;
  delayAutomation?: DelayAutomationAnalysis | null;
  guardrails?: VocalGuardrailAnalysis | null;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp(t, 0, 1);

const weightedAverage = (pairs: Array<[number, number]>): number => {
  const totalWeight = pairs.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (totalWeight <= 0) return 0;
  return pairs.reduce((sum, [value, weight]) => sum + value * Math.max(0, weight), 0) / totalWeight;
};

const arrangementDensity = (arrangement?: ArrangementAnalysis | null): number => {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  return clamp(
    weightedAverage(arrangement.sections.map(section => [section.density, Math.max(section.energy, 0.05)])),
    0,
    1
  );
};

const arrangementLift = (arrangement?: ArrangementAnalysis | null): number => {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  const loudest = arrangement.sections.find(section => section.name === arrangement.loudestSection);
  const quietest = arrangement.sections.find(section => section.name === arrangement.quietestSection);
  const contrast = loudest && quietest
    ? clamp((loudest.energy - quietest.energy + 1) / 2, 0, 1)
    : 0.5;
  return contrast;
};

const intentBias = (vocalIntent?: VocalIntentAnalysis | null): Record<string, number> => {
  if (!vocalIntent) {
    return {
      clarity: 0.5,
      density: 0.5,
      motion: 0.5,
      width: 0.5,
      depth: 0.5,
      punch: 0.5,
      restraint: 0.5,
      lift: 0.5,
      risk: 0.45,
    };
  }

  const i = vocalIntent;
  return {
    clarity: clamp(i.indicators.melodicFocus * 0.48 + (1 - i.indicators.breathing) * 0.18 + 0.16, 0, 1),
    density: clamp(0.35 + i.indicators.dynamicsIntensity * 0.34 + i.indicators.aggression * 0.15, 0, 1),
    motion: clamp(0.25 + i.indicators.breathing * 0.3 + i.indicators.melodicFocus * 0.18, 0, 1),
    width: clamp(0.28 + i.indicators.proximity * 0.12 + i.indicators.melodicFocus * 0.14, 0, 1),
    depth: clamp(0.28 + i.indicators.breathing * 0.2 + (1 - i.indicators.aggression) * 0.12, 0, 1),
    punch: clamp(0.28 + i.indicators.aggression * 0.34 + i.indicators.dynamicsIntensity * 0.2, 0, 1),
    restraint: clamp(0.42 + (1 - i.indicators.aggression) * 0.22 + (1 - i.indicators.dynamicsIntensity) * 0.08, 0, 1),
    lift: clamp(0.3 + i.indicators.melodicFocus * 0.18 + i.indicators.proximity * 0.1, 0, 1),
    risk: clamp(0.22 + i.indicators.aggression * 0.22 + i.indicators.dynamicsIntensity * 0.12, 0, 1),
  };
};

const contextBias = (context?: VocalContextAwarenessAnalysis | null): Record<string, number> => {
  if (!context) {
    return {
      clarity: 0.5,
      density: 0.5,
      motion: 0.5,
      width: 0.5,
      depth: 0.5,
      punch: 0.5,
      restraint: 0.5,
      lift: 0.5,
      risk: 0.45,
    };
  }

  return {
    clarity: clamp(1 - context.frequencyMasking.midRange * 0.7, 0, 1),
    density: clamp(context.densityScore, 0, 1),
    motion: clamp(0.32 + context.delayAdjustment.amount * 0.24 + context.hookLiftAdjustment.amount * 0.08, 0, 1),
    width: clamp(0.4 + context.presenceAdjustment.amount * 0.22, 0, 1),
    depth: clamp(context.adLibAdjustment.direction === 'deepen' ? 0.7 : 0.45, 0, 1),
    punch: clamp(0.32 + context.compressionAdjustment.amount * 0.22 + context.presenceAdjustment.amount * 0.05, 0, 1),
    restraint: clamp(0.55 + context.riskNotes.length * 0.02, 0, 1),
    lift: clamp(context.hookLiftAdjustment.amount, 0, 1),
    risk: clamp(context.riskNotes.length * 0.08 + context.frequencyMasking.midRange * 0.12, 0, 1),
  };
};

const sectionLift = (arrangement?: ArrangementAnalysis | null): number => {
  if (!arrangement || arrangement.sections.length === 0) return 0.5;
  const dynamic = arrangement.dynamicRange;
  return clamp(0.42 + dynamic / 24 + arrangementLift(arrangement) * 0.15, 0, 1);
};

function rationalize(field: APLPerceptualField): string[] {
  return [
    `density=${field.density.toFixed(2)} clarity=${field.clarity.toFixed(2)} motion=${field.motion.toFixed(2)}`,
    `width=${field.width.toFixed(2)} depth=${field.depth.toFixed(2)} punch=${field.punch.toFixed(2)}`,
    `risk=${field.risk.toFixed(2)} restraint=${field.restraint.toFixed(2)} lift=${field.lift.toFixed(2)}`,
  ];
}

export function buildAPLPerceptualField(context: APLPerceptualFieldContext): APLPerceptualField {
  const arrangement = arrangementDensity(context.arrangement);
  const lift = sectionLift(context.arrangement);
  const intent = intentBias(context.vocalIntent);
  const ctx = contextBias(context.contextAwareness);
  const guardrailRisk = context.guardrails ? clamp(1 - context.guardrails.score / 100, 0, 1) : 0.3;
  const delayMotion = context.delayAutomation?.shouldApply ? clamp(context.delayAutomation.overallConfidence * 0.7, 0, 1) : 0.25;
  const hookMotion = context.hookLift?.shouldApply ? clamp(context.hookLift.amountOfLift, 0, 1) : 0.25;
  const adLibWidth = context.adLibPlacement?.shouldApply
    ? clamp(context.adLibPlacement.primaryRecommendation?.stereoWidth ?? 0.5, 0, 1)
    : 0.5;

  const density = clamp(weightedAverage([
    [arrangement, 0.34],
    [intent.density, 0.18],
    [ctx.density, 0.18],
    [guardrailRisk, 0.12],
    [lift, 0.18],
  ]), 0, 1);

  const clarity = clamp(weightedAverage([
    [intent.clarity, 0.26],
    [ctx.clarity, 0.28],
    [1 - density, 0.18],
    [1 - guardrailRisk, 0.12],
    [lift, 0.16],
  ]), 0, 1);

  const motion = clamp(weightedAverage([
    [intent.motion, 0.24],
    [ctx.motion, 0.24],
    [delayMotion, 0.22],
    [hookMotion, 0.18],
    [1 - guardrailRisk, 0.12],
  ]), 0, 1);

  const width = clamp(weightedAverage([
    [intent.width, 0.22],
    [ctx.width, 0.28],
    [adLibWidth, 0.22],
    [1 - density, 0.18],
    [lift, 0.1],
  ]), 0, 1);

  const depth = clamp(weightedAverage([
    [intent.depth, 0.24],
    [ctx.depth, 0.22],
    [1 - density, 0.18],
    [guardrailRisk, 0.12],
    [1 - density * 0.45, 0.1],
    [0.5, 0.14],
  ]), 0, 1);

  const punch = clamp(weightedAverage([
    [intent.punch, 0.26],
    [ctx.punch, 0.24],
    [lift, 0.2],
    [1 - depth, 0.12],
    [1 - guardrailRisk, 0.18],
  ]), 0, 1);

  const restraint = clamp(weightedAverage([
    [intent.restraint, 0.25],
    [ctx.restraint, 0.26],
    [guardrailRisk, 0.24],
    [1 - punch, 0.16],
    [1 - motion, 0.09],
  ]), 0, 1);

  const liftScore = clamp(weightedAverage([
    [lift, 0.3],
    [context.hookLift?.shouldApply ? context.hookLift.amountOfLift : 0.35, 0.24],
    [context.adLibPlacement?.shouldApply ? context.adLibPlacement.primaryRecommendation?.reverbMix ?? 0.25 : 0.25, 0.18],
    [1 - density, 0.16],
    [clarity, 0.12],
  ]), 0, 1);

  const risk = clamp(weightedAverage([
    [guardrailRisk, 0.34],
    [1 - restraint, 0.24],
    [context.contextAwareness?.riskNotes.length ? 0.45 : 0.25, 0.14],
    [context.hookLift?.riskNotes.length ? 0.45 : 0.25, 0.14],
    [context.adLibPlacement?.riskNotes.length ? 0.45 : 0.25, 0.14],
  ]), 0, 1);

  const targetLufs = lerp(-15.2, -11.8, clamp(punch * 0.52 + liftScore * 0.18 + density * 0.12 + motion * 0.12, 0, 1));
  const targetDynamicRange = lerp(8.6, 4.5, clamp(punch * 0.48 + density * 0.26 + risk * 0.2, 0, 1));
  const peakCeilingDb = lerp(-1.0, -0.3, clamp(restraint * 0.55 + risk * 0.18, 0, 1));
  const stabilityScore = clamp(weightedAverage([
    [clarity, 0.22],
    [restraint, 0.22],
    [1 - risk, 0.22],
    [1 - density * 0.3, 0.12],
    [1 - motion * 0.22, 0.12],
    [1 - depth * 0.12, 0.1],
  ]), 0, 1);

  const field: APLPerceptualField = {
    clarity,
    density,
    motion,
    width,
    depth,
    punch,
    restraint,
    lift: liftScore,
    risk,
    targetLufs,
    targetDynamicRange,
    peakCeilingDb,
    stabilityScore,
    rationale: [],
  };

  field.rationale = rationalize(field);
  return field;
}
