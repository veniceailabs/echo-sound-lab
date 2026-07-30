import type { ArrangementAnalysis, SectionAnalysis } from './arrangementAnalyzer';
import type { APLPerceptualField } from './aplPerceptualField';
import type { ReplayAutomationLane, ReplayAutomationPoint } from './deterministicReplayService';
import type { HookLiftAnalysis } from './vocal/hookLiftLogic';
import type { AdLibPlacementAnalysis } from './vocal/adlibPlacement';
import { deterministicId } from './deterministicJson';

export interface APLAutomationPlanLane extends ReplayAutomationLane {
  rationale: string;
}

export interface APLAutomationPlan {
  enabled: boolean;
  rationale: string[];
  lanes: APLAutomationPlanLane[];
  sectionMap: Array<{
    sectionName: string;
    startTimeSec: number;
    endTimeSec: number;
    energy: number;
    density: number;
  }>;
}

export interface APLAutomationPlannerInput {
  trackId: string;
  trackName: string;
  arrangement?: ArrangementAnalysis | null;
  perceptualField?: APLPerceptualField | null;
  hookLift?: HookLiftAnalysis | null;
  adLibPlacement?: AdLibPlacementAnalysis | null;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const sectionMatches = (section: SectionAnalysis, tokens: string[]): boolean => {
  const name = section.name.toLowerCase();
  return tokens.some(token => name.includes(token));
};

const sortSections = (arrangement?: ArrangementAnalysis | null): SectionAnalysis[] => {
  if (!arrangement?.sections?.length) return [];
  return [...arrangement.sections].sort((a, b) => a.startTime - b.startTime);
};

const getSectionType = (section: SectionAnalysis): 'verse' | 'hook' | 'bridge' | 'intro' | 'outro' | 'other' => {
  if (sectionMatches(section, ['chorus', 'hook', 'drop'])) return 'hook';
  if (sectionMatches(section, ['verse'])) return 'verse';
  if (sectionMatches(section, ['bridge'])) return 'bridge';
  if (sectionMatches(section, ['intro'])) return 'intro';
  if (sectionMatches(section, ['outro'])) return 'outro';
  return 'other';
};

function sectionEnergyLift(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  const fieldLift = field?.lift ?? 0.5;
  const fieldDensity = field?.density ?? 0.5;
  const sectionType = getSectionType(section);
  if (sectionType === 'hook') {
    return clamp(0.08 + fieldLift * 0.08 + section.energy * 0.06, 0.04, 0.22);
  }
  if (sectionType === 'verse') {
    return clamp(-(0.04 + fieldDensity * 0.05), -0.18, -0.02);
  }
  if (sectionType === 'bridge') {
    return clamp(0.02 + fieldLift * 0.03, -0.04, 0.08);
  }
  return 0;
}

function gainValueForSection(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  return clamp(sectionEnergyLift(section, field) * 12, -4.5, 3.5);
}

function sectionWidthLift(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  const fieldWidth = field?.width ?? 0.5;
  const sectionType = getSectionType(section);
  if (sectionType === 'hook') return clamp(0.05 + fieldWidth * 0.08, 0.03, 0.18);
  if (sectionType === 'verse') return clamp(-0.03 - (field?.density ?? 0.5) * 0.04, -0.12, -0.01);
  if (sectionType === 'bridge') return clamp(0.02 + fieldWidth * 0.03, -0.02, 0.07);
  return 0;
}

function widthValueForSection(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  return clamp(1 + sectionWidthLift(section, field) * 1.5, 0.82, 1.22);
}

function sectionDelayLift(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  const sectionType = getSectionType(section);
  const motion = field?.motion ?? 0.5;
  if (sectionType === 'hook') return clamp(0.04 + motion * 0.08, 0.03, 0.16);
  if (sectionType === 'verse') return clamp(-0.02 - (field?.restraint ?? 0.5) * 0.03, -0.08, -0.01);
  return clamp(0.01 + motion * 0.02, -0.03, 0.05);
}

function delayMixValueForSection(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  return clamp(0.03 + sectionDelayLift(section, field) * 1.5, 0, 0.38);
}

function hookLiftValueForSection(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  const sectionType = getSectionType(section);
  if (sectionType === 'hook') return clamp(0.58 + (field?.lift ?? 0.5) * 0.22, 0.6, 0.88);
  if (sectionType === 'verse') return clamp(0.28 - (field?.restraint ?? 0.5) * 0.16, 0.06, 0.32);
  return clamp(0.42 + (field?.motion ?? 0.5) * 0.1, 0.24, 0.62);
}

function adlibDepthValueForSection(section: SectionAnalysis, field?: APLPerceptualField | null): number {
  const sectionType = getSectionType(section);
  if (sectionType === 'hook') return clamp(-6.5 - (field?.depth ?? 0.5) * 6, -18, -6);
  if (sectionType === 'verse') return clamp(-10.5 - (field?.density ?? 0.5) * 7, -20, -8);
  return clamp(-8.5 - (field?.depth ?? 0.5) * 5, -16, -6);
}

function buildPoints(
  trackId: string,
  parameter: string,
  sections: SectionAnalysis[],
  computeValue: (section: SectionAnalysis) => number,
  curve: ReplayAutomationPoint['curve'] = 'linear'
): ReplayAutomationPoint[] {
  const points: ReplayAutomationPoint[] = [];
  for (const section of sections) {
    points.push({
      pointId: deterministicId('apl-auto-pt', {
        trackId,
        parameter,
        section: section.name,
        startTime: section.startTime,
        endTime: section.endTime,
        value: computeValue(section),
      }),
      timeSec: section.startTime,
      value: computeValue(section),
      curve,
    });
    points.push({
      pointId: deterministicId('apl-auto-pt', {
        trackId,
        parameter,
        section: section.name,
        startTime: section.endTime,
        endTime: section.endTime,
        value: computeValue(section),
        endPoint: true,
      }),
      timeSec: section.endTime,
      value: computeValue(section),
      curve,
    });
  }
  return points.sort((a, b) => a.timeSec - b.timeSec || a.pointId.localeCompare(b.pointId));
}

export function buildAPLAutomationPlan(input: APLAutomationPlannerInput): APLAutomationPlan {
  const sections = sortSections(input.arrangement);
  if (sections.length === 0) {
    return {
      enabled: false,
      rationale: ['No arrangement sections were available, so section automation was skipped.'],
      lanes: [],
      sectionMap: [],
    };
  }

  const sectionMap = sections.map(section => ({
    sectionName: section.name,
    startTimeSec: section.startTime,
    endTimeSec: section.endTime,
    energy: section.energy,
    density: section.density,
  }));

  const lanes: APLAutomationPlanLane[] = [];
  const field = input.perceptualField;
  const hookLift = input.hookLift;
  const adLib = input.adLibPlacement;

  const gainLane: APLAutomationPlanLane = {
    laneId: deterministicId('apl-auto-lane', {
      trackId: input.trackId,
      parameter: 'track_gain_db',
      sections: sectionMap,
    }),
    trackId: input.trackId,
    parameter: 'track_gain_db',
    points: buildPoints(input.trackId, 'track_gain_db', sections, (section) => gainValueForSection(section, field), 'linear'),
    rationale: 'Shape the vocal or master lane so hooks step forward and verses pull back.',
  };
  lanes.push(gainLane);

  const widthLane: APLAutomationPlanLane = {
    laneId: deterministicId('apl-auto-lane', {
      trackId: input.trackId,
      parameter: 'stereo_width',
      sections: sectionMap,
    }),
    trackId: input.trackId,
    parameter: 'stereo_width',
    points: buildPoints(input.trackId, 'stereo_width', sections, (section) => widthValueForSection(section, field), 'linear'),
    rationale: 'Give the hook more width while keeping verses centered and dependable.',
  };
  lanes.push(widthLane);

  const delayLane: APLAutomationPlanLane = {
    laneId: deterministicId('apl-auto-lane', {
      trackId: input.trackId,
      parameter: 'delay_mix',
      sections: sectionMap,
    }),
    trackId: input.trackId,
    parameter: 'delay_mix',
    points: buildPoints(input.trackId, 'delay_mix', sections, (section) => delayMixValueForSection(section, field), 'step'),
    rationale: 'Let delay motion land in hooks and tails, then back off in verses so the pocket stays clear.',
  };
  lanes.push(delayLane);

  if (hookLift?.shouldApply) {
    lanes.push({
      laneId: deterministicId('apl-auto-lane', {
        trackId: input.trackId,
        parameter: 'hook_lift',
        sections: sectionMap,
      }),
      trackId: input.trackId,
      parameter: 'hook_lift',
      points: buildPoints(input.trackId, 'hook_lift', sections, (section) => hookLiftValueForSection(section, field)),
      rationale: 'Translate verse-to-hook contrast into explicit automation rather than relying on static processing alone.',
    });
  }

  if (adLib?.shouldApply) {
    lanes.push({
      laneId: deterministicId('apl-auto-lane', {
        trackId: input.trackId,
        parameter: 'adlib_depth',
        sections: sectionMap,
      }),
      trackId: input.trackId,
      parameter: 'adlib_depth',
      points: buildPoints(input.trackId, 'adlib_depth', sections, (section) => adlibDepthValueForSection(section, field)),
      rationale: 'Keep support vocals behind the lead while still giving the hook a distinct energy signature.',
    });
  }

  const rationale = [
    `Built ${lanes.length} automation lane(s) from ${sections.length} arrangement section(s).`,
    `Field density ${field?.density.toFixed(2) ?? '0.50'} / lift ${field?.lift.toFixed(2) ?? '0.50'} / motion ${field?.motion.toFixed(2) ?? '0.50'}.`,
  ];

  return {
    enabled: true,
    rationale,
    lanes,
    sectionMap,
  };
}
