import { postJson } from './backendApi';
import { provenanceLedger, ProvenanceLedgerEntry } from './ProvenanceLedger';

export interface RenderManifest {
  schemaVersion: 'esl.render-manifest.v1';
  sessionId: string;
  exportTimestamp: number;
  exportTarget: {
    fileName: string;
    format: string;
  };
  entries: ProvenanceLedgerEntry[];
  c2pa: {
    Creator: string;
    Generator: string;
    Timestamp: string;
    Assertions: Array<{
      label: string;
      proposalId: string;
      actor: string;
      actionType: string;
      timestamp: string;
      signature: string;
      assertions: string[];
    }>;
  };
}

export interface SignedRenderManifest {
  manifest: RenderManifest;
  signature: string;
  signatureAlgorithm: 'hmac-sha256-v1';
  manifestHash: string;
  keyId: string;
  signedAt: number;
}

export interface BuildRenderManifestOptions {
  sessionId: string;
  entries: ProvenanceLedgerEntry[];
  fileName: string;
  format: string;
  exportTimestamp?: number;
  creatorId?: string;
}

function deriveCreator(entries: ProvenanceLedgerEntry[], explicitCreatorId?: string): string {
  if (explicitCreatorId && explicitCreatorId.trim()) return explicitCreatorId.trim();
  const human = entries.find((entry) => entry.actor.type === 'HUMAN');
  if (human) return human.actor.id;
  return 'human:unknown-creator';
}

function deriveGenerator(entries: ProvenanceLedgerEntry[]): string {
  const generators = Array.from(new Set(entries.map((entry) => entry.generator).filter(Boolean)));
  if (generators.length === 0) return 'esl-execution-bridge';
  return generators.join(', ');
}

export function buildRenderManifest(options: BuildRenderManifestOptions): RenderManifest {
  const exportTimestamp = options.exportTimestamp || Date.now();
  const creator = deriveCreator(options.entries, options.creatorId);
  const generator = deriveGenerator(options.entries);

  return {
    schemaVersion: 'esl.render-manifest.v1',
    sessionId: options.sessionId,
    exportTimestamp,
    exportTarget: {
      fileName: options.fileName,
      format: options.format.toLowerCase(),
    },
    entries: options.entries.map((entry) => ({
      ...entry,
      actor: { ...entry.actor },
      assertions: [...entry.assertions],
    })),
    c2pa: {
      Creator: creator,
      Generator: generator,
      Timestamp: new Date(exportTimestamp).toISOString(),
      Assertions: options.entries.map((entry) => ({
        label: 'esl.apl.execution',
        proposalId: entry.proposalId,
        actor: entry.actor.id,
        actionType: entry.actionType,
        timestamp: new Date(entry.timestamp).toISOString(),
        signature: entry.signature,
        assertions: [...entry.assertions],
      })),
    },
  };
}

export async function signRenderManifest(manifest: RenderManifest): Promise<Omit<SignedRenderManifest, 'manifest'>> {
  return postJson<Omit<SignedRenderManifest, 'manifest'>>('/api/proxy/security/sign-manifest', {
    manifest,
  });
}

export async function createSignedRenderManifest(
  fileName: string,
  format: string,
  creatorId?: string
): Promise<SignedRenderManifest> {
  const entries = provenanceLedger.getEntries();
  const manifest = buildRenderManifest({
    sessionId: provenanceLedger.getSessionId(),
    entries,
    fileName,
    format,
    creatorId,
  });
  const signed = await signRenderManifest(manifest);
  return {
    manifest,
    ...signed,
  };
}
