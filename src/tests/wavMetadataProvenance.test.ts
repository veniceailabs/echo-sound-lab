import { describe, expect, test } from 'vitest';
import {
  buildEmbeddedProvenanceReference,
  embedProvenanceReferenceInAudio,
  extractEmbeddedProvenanceReference,
  verifyEmbeddedProvenanceReference,
} from '../services/provenanceMetadataService';
import { buildRenderManifest, SignedRenderManifest } from '../services/provenanceManifestService';
import { hashManifestPayload, signManifestPayloadWithSecret } from '../services/provenanceSigning';

function createMinimalWavBlob(): Blob {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);

  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 38, true); // file size - 8
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE

  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 44100, true); // sample rate
  view.setUint32(28, 88200, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample

  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, 2, true); // 1 sample (16-bit mono)
  view.setInt16(44, 0, true); // sample value

  return new Blob([bytes], { type: 'audio/wav' });
}

async function buildSignedManifestFixture(fileName: string): Promise<SignedRenderManifest> {
  const manifest = buildRenderManifest({
    sessionId: 'ledger-session-wav',
    entries: [
      {
        index: 0,
        proposalId: 'proposal-wav-1',
        actor: { id: 'human:producer', type: 'HUMAN' },
        actionType: 'eq_adjustment',
        timestamp: 1_700_000_000_000,
        signature: 'sig_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        sessionId: 'exec-session',
        sourceHash: 'hash-a',
        contextId: 'ctx-a',
        generator: 'human-directed',
        assertions: ['agent.human', 'apl.executed'],
      },
    ],
    fileName,
    format: 'wav',
    exportTimestamp: 1_700_000_100_000,
    creatorId: 'human:producer',
  });

  const signature = await signManifestPayloadWithSecret(manifest, 'wav-test-signing-secret');
  const manifestHash = await hashManifestPayload(manifest);

  return {
    manifest,
    signature,
    signatureAlgorithm: 'hmac-sha256-v1',
    manifestHash,
    keyId: 'wav-key-01',
    signedAt: 1_700_000_100_123,
  };
}

describe('WAV Provenance Metadata Embedding', () => {
  test('embeds and extracts provenance reference from WAV LIST/INFO chunk', async () => {
    const fileName = 'mastered-track.wav';
    const manifestFileName = 'mastered-track.manifest.json';
    const signedManifest = await buildSignedManifestFixture(fileName);
    const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);

    const inputWav = createMinimalWavBlob();
    const embeddedWav = await embedProvenanceReferenceInAudio(inputWav, fileName, reference);
    const extracted = await extractEmbeddedProvenanceReference(embeddedWav, fileName);

    expect(extracted).not.toBeNull();
    expect(extracted?.schemaVersion).toBe('esl.provenance-ref.v1');
    expect(extracted?.manifestFileName).toBe(manifestFileName);
    expect(extracted?.manifestHash).toBe(signedManifest.manifestHash);
    expect(extracted?.signature).toBe(signedManifest.signature);

    const verification = await verifyEmbeddedProvenanceReference(
      embeddedWav,
      fileName,
      signedManifest,
      manifestFileName
    );
    expect(verification.ok).toBe(true);
  });
});
