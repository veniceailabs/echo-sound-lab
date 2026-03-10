import { describe, expect, test } from 'vitest';
import {
  buildEmbeddedProvenanceReference,
  embedProvenanceReferenceInAudio,
  extractEmbeddedProvenanceReference,
  verifyEmbeddedProvenanceReference,
} from '../services/provenanceMetadataService';
import { buildRenderManifest, SignedRenderManifest } from '../services/provenanceManifestService';
import { hashManifestPayload, signManifestPayloadWithSecret } from '../services/provenanceSigning';

function createMinimalMp3Blob(): Blob {
  const bytes = new Uint8Array([
    0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00,
    0xff, 0xfb, 0x90, 0x64, 0x11, 0x22, 0x33, 0x44,
  ]);
  return new Blob([bytes], { type: 'audio/mpeg' });
}

async function buildSignedManifestFixture(fileName: string): Promise<SignedRenderManifest> {
  const manifest = buildRenderManifest({
    sessionId: 'ledger-session-mp3',
    entries: [
      {
        index: 0,
        proposalId: 'proposal-mp3-1',
        actor: { id: 'ai:gemini-pro-1.5', type: 'AI' },
        actionType: 'suno_generate',
        timestamp: 1_700_000_000_500,
        signature: 'sig_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        sessionId: 'exec-session-mp3',
        sourceHash: 'hash-b',
        contextId: 'ctx-b',
        generator: 'gemini-pro-1.5',
        assertions: ['agent.ai', 'apl.executed'],
      },
    ],
    fileName,
    format: 'mp3',
    exportTimestamp: 1_700_000_200_000,
    creatorId: 'human:producer',
  });

  const signature = await signManifestPayloadWithSecret(manifest, 'mp3-test-signing-secret');
  const manifestHash = await hashManifestPayload(manifest);

  return {
    manifest,
    signature,
    signatureAlgorithm: 'hmac-sha256-v1',
    manifestHash,
    keyId: 'mp3-key-01',
    signedAt: 1_700_000_200_321,
  };
}

describe('MP3 Provenance Metadata Embedding', () => {
  test('embeds and extracts provenance reference from ID3 TXXX frame', async () => {
    const fileName = 'mastered-track.mp3';
    const manifestFileName = 'mastered-track.manifest.json';
    const signedManifest = await buildSignedManifestFixture(fileName);
    const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);

    const inputMp3 = createMinimalMp3Blob();
    const embeddedMp3 = await embedProvenanceReferenceInAudio(inputMp3, fileName, reference);
    const extracted = await extractEmbeddedProvenanceReference(embeddedMp3, fileName);

    expect(extracted).not.toBeNull();
    expect(extracted?.manifestFileName).toBe(manifestFileName);
    expect(extracted?.manifestHash).toBe(signedManifest.manifestHash);
    expect(extracted?.signature).toBe(signedManifest.signature);
  });

  test('fails verification when manifest payload is tampered after embedding', async () => {
    const fileName = 'mastered-track.mp3';
    const manifestFileName = 'mastered-track.manifest.json';
    const signedManifest = await buildSignedManifestFixture(fileName);
    const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);

    const embeddedMp3 = await embedProvenanceReferenceInAudio(createMinimalMp3Blob(), fileName, reference);

    const tamperedSignedManifest: SignedRenderManifest = {
      ...signedManifest,
      manifest: {
        ...signedManifest.manifest,
        exportTarget: {
          ...signedManifest.manifest.exportTarget,
          fileName: 'mastered-track-tampered.mp3',
        },
      },
    };

    const verification = await verifyEmbeddedProvenanceReference(
      embeddedMp3,
      fileName,
      tamperedSignedManifest,
      manifestFileName
    );

    expect(verification.ok).toBe(false);
    expect(verification.reason).toBe('manifest_hash_mismatch');
  });
});
