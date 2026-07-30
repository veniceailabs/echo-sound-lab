import { describe, expect, test } from 'vitest';
import { buildAPLAutomationPlan } from '../services/aplAutomationPlanner';

const plan = buildAPLAutomationPlan({
  trackId: 'track-vocal',
  trackName: 'Lead Vocal',
  arrangement: {
    sections: [
      { name: 'verse', startTime: 0, endTime: 8, energy: 0.42, density: 0.48, rmsDb: -17.8, peakDb: -7.1, dynamics: 3.4 },
      { name: 'chorus', startTime: 8, endTime: 16, energy: 0.76, density: 0.7, rmsDb: -13.8, peakDb: -4.0, dynamics: 2.1 },
      { name: 'verse 2', startTime: 16, endTime: 24, energy: 0.45, density: 0.52, rmsDb: -16.9, peakDb: -6.8, dynamics: 3.1 },
      { name: 'bridge', startTime: 24, endTime: 32, energy: 0.58, density: 0.56, rmsDb: -15.2, peakDb: -5.8, dynamics: 2.8 },
    ],
    energyCurve: [0.42, 0.76, 0.45, 0.58],
    dynamicRange: 7.8,
    loudestSection: 'chorus',
    quietestSection: 'verse',
    suggestedFocus: ['hook lift'],
    overallFlow: 'dynamic',
  },
  perceptualField: {
    clarity: 0.64,
    density: 0.73,
    motion: 0.58,
    width: 0.61,
    depth: 0.44,
    punch: 0.77,
    restraint: 0.52,
    lift: 0.68,
    risk: 0.32,
    targetLufs: -12.8,
    targetDynamicRange: 5.7,
    peakCeilingDb: -0.42,
    stabilityScore: 0.71,
    rationale: [],
  },
  hookLift: {
    shouldApply: true,
    overallConfidence: 0.7,
    verseSectionHint: 'verse',
    hookSectionHint: 'chorus',
    amountOfLift: 0.31,
    verseVsHookContrast: {
      verseEnergy: 0.42,
      hookEnergy: 0.76,
      contrastScore: 0.34,
      emotionalLift: 'hook rises',
    },
    tactics: [],
    rationale: 'hook lift',
    riskNotes: [],
    interactionNotes: [],
  },
  adLibPlacement: {
    shouldApply: true,
    overallConfidence: 0.61,
    primaryRecommendation: {
      role: 'supportive',
      triggerHint: 'hook garnish',
      triggerLocationHint: 'behind lead',
      depthShiftDb: -7.2,
      panPosition: 0.24,
      stereoWidth: 0.54,
      delayOffsetMs: 20,
      highPassHz: 220,
      saturationDb: 0.7,
      reverbMix: 0.1,
      confidence: 0.68,
      rationale: 'supportive',
      riskNotes: [],
      interactionNotes: [],
    },
    alternateRecommendations: [],
    rationale: 'supportive',
    riskNotes: [],
    interactionNotes: [],
  },
});

describe('APL automation planner', () => {
  test('builds section-aware gain, width, delay, hook, and ad-lib lanes', () => {
    expect(plan.enabled).toBe(true);
    expect(plan.lanes.length).toBeGreaterThanOrEqual(4);

    const gainLane = plan.lanes.find(lane => lane.parameter === 'track_gain_db');
    const widthLane = plan.lanes.find(lane => lane.parameter === 'stereo_width');
    const delayLane = plan.lanes.find(lane => lane.parameter === 'delay_mix');
    const hookLane = plan.lanes.find(lane => lane.parameter === 'hook_lift');
    const adLibLane = plan.lanes.find(lane => lane.parameter === 'adlib_depth');

    expect(gainLane?.points).toHaveLength(8);
    expect(widthLane?.points).toHaveLength(8);
    expect(delayLane?.points).toHaveLength(8);
    expect(hookLane?.points).toHaveLength(8);
    expect(adLibLane?.points).toHaveLength(8);

    const verseGain = Math.max(...(gainLane?.points.filter(point => point.timeSec < 8).map(point => point.value) || [0]));
    const chorusGain = Math.max(...(gainLane?.points.filter(point => point.timeSec >= 8 && point.timeSec < 16).map(point => point.value) || [0]));
    const verseWidth = Math.max(...(widthLane?.points.filter(point => point.timeSec < 8).map(point => point.value) || [0]));
    const chorusWidth = Math.max(...(widthLane?.points.filter(point => point.timeSec >= 8 && point.timeSec < 16).map(point => point.value) || [0]));

    expect(chorusGain).toBeGreaterThan(verseGain);
    expect(chorusWidth).toBeGreaterThan(verseWidth);
    expect(plan.rationale.join(' ')).toContain('automation lane');
  });
});
