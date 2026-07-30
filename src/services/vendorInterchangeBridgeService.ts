import type { ReplayState } from './deterministicReplayService';
import type { TimelineInterchangeParityReport } from './timelineInterchangeParityService';

export interface VendorBridgeFieldMapping {
  field: string;
  status: 'native' | 'esl-bridged' | 'external';
  notes: string;
}

export interface VendorInterchangeBridgeManifest {
  format: 'ESL-VENDOR-INTERCHANGE-BRIDGE';
  version: 1;
  generatedAt: number;
  sessionId: string;
  workspaceId: string;
  sdkRequired: boolean;
  vendorTargets: Array<'AAF' | 'OMF'>;
  fieldMappings: VendorBridgeFieldMapping[];
  externalDependencies: string[];
  notes: string[];
}

export function buildVendorInterchangeBridgeManifest(
  state: ReplayState,
  parity: TimelineInterchangeParityReport
): VendorInterchangeBridgeManifest {
  const fieldMappings: VendorBridgeFieldMapping[] = [
    {
      field: 'session metadata',
      status: 'esl-bridged',
      notes: 'ESL exports metadata now; native vendor semantics still need SDK-specific serialization.',
    },
    {
      field: 'tempo map',
      status: 'esl-bridged',
      notes: 'Tempo and time signature data are preserved in the ESL adapter layer.',
    },
    {
      field: 'tracks, regions, groups, comp lanes, markers, automation',
      status: 'esl-bridged',
      notes: 'The full ESL state is already serialized for in-app round-trip recovery.',
    },
    {
      field: 'binary vendor file headers',
      status: 'external',
      notes: 'A licensed third-party SDK is required for real Pro Tools/Logic binary parity.',
    },
    {
      field: 'vendor-specific session objects',
      status: 'external',
      notes: 'Object model conversion must be mapped to the target SDK classes and chunk format.',
    },
  ];

  return {
    format: 'ESL-VENDOR-INTERCHANGE-BRIDGE',
    version: 1,
    generatedAt: Date.now(),
    sessionId: state.sessionId,
    workspaceId: state.workspaceId,
    sdkRequired: true,
    vendorTargets: ['AAF', 'OMF'],
    fieldMappings,
    externalDependencies: [
      'Licensed native AAF SDK',
      'Licensed native OMF SDK',
      'Vendor format specification access',
      'Target DAW validation sessions',
    ],
    notes: [
      `Parity score: ${parity.score}%`,
      'ESL can already round-trip its own session model.',
      'This manifest records the remaining external bridge work required for literal vendor parity.',
    ],
  };
}

export function serializeVendorInterchangeBridgeManifestJson(
  manifest: VendorInterchangeBridgeManifest
): string {
  return JSON.stringify(manifest, null, 2);
}
