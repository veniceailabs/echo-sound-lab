import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { analyzeArrangement, type ArrangementAnalysis } from '../services/arrangementAnalyzer';
import { SpectralAnalyzer, type SpectralProfile } from '../services/dsp/SpectralAnalyzer';
import {
  VocalIntakeConditioningService,
  type VocalIntakeBufferLike,
} from '../services/vocal/intakeConditioning';
import { VocalProfiler } from '../services/vocal/vocalProfiler';
import { VocalDeEssingZoneDetector } from '../services/vocal/deEssingZones';
import { VocalCompressionStackLogic } from '../services/vocal/compressionStackLogic';
import { VocalPresenceAirTuning } from '../services/vocal/presenceAirTuning';
import { VocalDelayAutomationLogic } from '../services/vocal/delayAutomationLogic';
import { VocalIntentDetector } from '../services/vocal/vocalIntentDetector';
import { VocalHookLiftLogic } from '../services/vocal/hookLiftLogic';
import { VocalAdLibPlacementLogic } from '../services/vocal/adlibPlacement';
import { VocalGuardrails } from '../services/vocal/guardrails';
import { VocalContextAwareness } from '../services/vocal/contextAwareness';
import { LowEndDiscipline } from '../services/lowend/lowEndDiscipline';
import { PhaseCMastering } from '../services/master/phaseCMastering';
import type { APLSignalMetrics } from '../echo-sound-lab/apl/signal-intelligence';

type RealAudioFixtureReport = {
  file: string;
  durationSec: number;
  vocalIntent: string;
  lowEndVerdict: string;
  masterVerdict: string;
  translationVerdict: string;
  phaseConfidence: number;
  notes: string[];
};

function parseWav(filePath: string): VocalIntakeBufferLike {
  const bytes = fs.readFileSync(filePath);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`Invalid WAV file: ${filePath}`);
  }

  let offset = 12;
  let fmt: {
    audioFormat: number;
    channelCount: number;
    sampleRate: number;
    blockAlign: number;
    bitsPerSample: number;
  } | null = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const chunkId = bytes.toString('ascii', offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkDataOffset = offset + 8;

    if (chunkId === 'fmt ' && chunkSize >= 16) {
      fmt = {
        audioFormat: bytes.readUInt16LE(chunkDataOffset),
        channelCount: bytes.readUInt16LE(chunkDataOffset + 2),
        sampleRate: bytes.readUInt32LE(chunkDataOffset + 4),
        blockAlign: bytes.readUInt16LE(chunkDataOffset + 12),
        bitsPerSample: bytes.readUInt16LE(chunkDataOffset + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
      break;
    }

    offset = chunkDataOffset + chunkSize + (chunkSize % 2);
  }

  if (!fmt || dataOffset < 0 || dataSize <= 0) {
    throw new Error(`Missing fmt/data chunks in WAV: ${filePath}`);
  }

  const frameCount = Math.floor(dataSize / fmt.blockAlign);
  const channelData = Array.from({ length: fmt.channelCount }, () => new Float32Array(frameCount));
  const bytesPerSample = fmt.bitsPerSample / 8;

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const frameOffset = dataOffset + frameIndex * fmt.blockAlign;
    for (let channel = 0; channel < fmt.channelCount; channel += 1) {
      const sampleOffset = frameOffset + channel * bytesPerSample;
      let value = 0;

      if (fmt.audioFormat === 3 && fmt.bitsPerSample === 32) {
        value = bytes.readFloatLE(sampleOffset);
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 16) {
        value = bytes.readInt16LE(sampleOffset) / 32768;
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 24) {
        let sample = bytes[sampleOffset] | (bytes[sampleOffset + 1] << 8) | (bytes[sampleOffset + 2] << 16);
        if (sample & 0x800000) sample |= ~0xffffff;
        value = sample / 8388608;
      } else if (fmt.audioFormat === 1 && fmt.bitsPerSample === 32) {
        value = bytes.readInt32LE(sampleOffset) / 2147483648;
      } else {
        throw new Error(`Unsupported WAV format (${fmt.audioFormat}/${fmt.bitsPerSample}) in ${filePath}`);
      }

      channelData[channel][frameIndex] = value;
    }
  }

  return {
    duration: frameCount / fmt.sampleRate,
    length: frameCount,
    sampleRate: fmt.sampleRate,
    numberOfChannels: fmt.channelCount,
    getChannelData(channel: number): Float32Array {
      return channelData[channel] ?? channelData[0] ?? new Float32Array(frameCount);
    },
  };
}

function buildMetrics(profile: SpectralProfile): APLSignalMetrics {
  return {
    loudnessLUFS: profile.loudnessLUFS,
    loudnessRange: 0,
    truePeakDB: profile.truePeakDB,
    peakLevel: profile.peakLevel,
    crestFactor: profile.crestFactor,
    spectralCentroid: profile.spectralCentroid,
    spectralSpread: 0,
    clippingDetected: profile.clippingDetected,
    dcOffsetDetected: profile.dcOffsetDetected,
    silenceDetected: profile.silenceDetected,
    duration: profile.duration,
    sampleRate: profile.sampleRate,
    bitDepth: 24,
  };
}

function analyzeFixture(filePath: string): RealAudioFixtureReport {
  const input = parseWav(filePath);
  const conditioning = VocalIntakeConditioningService.condition(input);
  const profile = VocalProfiler.profile(conditioning.conditionedBuffer, conditioning.report);
  const deEssing = VocalDeEssingZoneDetector.analyze(conditioning.conditionedBuffer, profile, conditioning.report);
  const compressionStack = VocalCompressionStackLogic.analyze(profile, conditioning.report, deEssing);
  const presenceAir = VocalPresenceAirTuning.analyze(profile, conditioning.report, deEssing, compressionStack);
  const delayAutomation = VocalDelayAutomationLogic.analyze(profile, compressionStack, presenceAir);
  const vocalIntent = VocalIntentDetector.analyze(profile, conditioning.report, compressionStack, presenceAir, delayAutomation);
  const arrangement = analyzeArrangement(conditioning.conditionedBuffer as unknown as AudioBuffer);
  const context = VocalContextAwareness.analyze(
    profile,
    compressionStack,
    presenceAir,
    delayAutomation,
    arrangement,
    vocalIntent
  );
  const hookLift = VocalHookLiftLogic.analyze(
    profile,
    compressionStack,
    presenceAir,
    delayAutomation,
    arrangement,
    vocalIntent,
    context
  );
  const adLib = VocalAdLibPlacementLogic.analyze(
    profile,
    compressionStack,
    presenceAir,
    delayAutomation,
    hookLift,
    arrangement,
    vocalIntent,
    context
  );
  const guardrails = VocalGuardrails.analyze(
    profile,
    deEssing,
    compressionStack,
    presenceAir,
    delayAutomation,
    hookLift,
    adLib,
    arrangement
  );
  const lowEnd = LowEndDiscipline.analyze(conditioning.conditionedBuffer, arrangement, context);
  const spectralProfile = SpectralAnalyzer.analyze(conditioning.conditionedBuffer);
  const metrics = buildMetrics(spectralProfile);
  const phaseC = PhaseCMastering.analyze(
    metrics,
    spectralProfile,
    arrangement,
    lowEnd,
    profile,
    vocalIntent
  );

  const notes = [
    conditioning.report.recommendedNextStep,
    lowEnd.rationale,
    phaseC.rationale,
    ...(guardrails.checks.filter((check) => check.detected).map((check) => check.message)),
  ].filter(Boolean);

  return {
    file: path.basename(filePath),
    durationSec: Number(input.duration.toFixed(2)),
    vocalIntent: vocalIntent.intent,
    lowEndVerdict: lowEnd.verdict,
    masterVerdict: phaseC.verdict,
    translationVerdict: phaseC.finalTranslation.verdict,
    phaseConfidence: Number(phaseC.overallConfidence.toFixed(3)),
    notes: notes.slice(0, 6),
  };
}

describe('real audio phase validation', () => {
  test('runs Phase A/B/C over real WAV fixtures and writes a short validation report', () => {
    const fixtureNames = [
      'structure_test.wav',
      'beta_final_smoke.wav',
      'defender_verify.wav',
    ];

    const reports = fixtureNames.map((fileName) => {
      const filePath = path.resolve(process.cwd(), fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      return analyzeFixture(filePath);
    });

    const reportPath = path.resolve(process.cwd(), 'artifacts/qa/real-audio-phase-validation.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(reports, null, 2));

    expect(reports).toHaveLength(3);
    expect(reports.every((report) => report.phaseConfidence > 0)).toBe(true);
    expect(reports.every((report) => report.notes.length > 0)).toBe(true);
    expect(reports.every((report) => typeof report.vocalIntent === 'string')).toBe(true);
  });
});
