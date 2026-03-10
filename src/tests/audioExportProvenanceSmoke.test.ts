import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { downloadAudioWithManifest } from '../services/audioExportService';
import { extractEmbeddedProvenanceReference } from '../services/provenanceMetadataService';
import { hashManifestPayload, signManifestPayloadWithSecret } from '../services/provenanceSigning';
import { provenanceLedger } from '../services/ProvenanceLedger';

function createMinimalWavBlob(): Blob {
  const bytes = new Uint8Array(46);
  const view = new DataView(bytes.buffer);

  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  view.setUint32(4, 38, true); // file size - 8
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 88200, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // data
  view.setUint32(40, 2, true);
  view.setInt16(44, 0, true);

  return new Blob([bytes], { type: 'audio/wav' });
}

describe('Audio Export Provenance Smoke', () => {
  beforeEach(() => {
    provenanceLedger.resetForTest();
    const objectUrlToBlob = new Map<string, Blob>();
    const downloads: Array<{ fileName: string; blob: Blob }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('/api/proxy/security/sign-manifest')) {
        return new Response(JSON.stringify({ error: 'unexpected_url' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const manifest = body?.manifest;
      const signature = await signManifestPayloadWithSecret(manifest, 'export-smoke-signing-secret');
      const manifestHash = await hashManifestPayload(manifest);
      return new Response(
        JSON.stringify({
          signature,
          signatureAlgorithm: 'hmac-sha256-v1',
          manifestHash,
          keyId: 'smoke-key-01',
          signedAt: Date.now(),
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }));

    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => {
        const id = `blob:mock-${Math.random().toString(36).slice(2)}`;
        objectUrlToBlob.set(id, blob);
        return id;
      },
      revokeObjectURL: (_url: string) => undefined,
    });

    vi.stubGlobal('document', {
      createElement: (_tag: string) => ({
        href: '',
        download: '',
        click() {
          const blob = objectUrlToBlob.get(this.href);
          if (blob) {
            downloads.push({ fileName: this.download, blob });
          }
        },
      }),
    });

    (globalThis as any).__eslSmokeDownloads = downloads;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (globalThis as any).__eslSmokeDownloads;
  });

  test('exports audio + sidecar manifest and embeds provenance metadata in audio', async () => {
    provenanceLedger.append({
      proposalId: 'smoke-proposal-1',
      actor: { id: 'human:producer', type: 'HUMAN' },
      actionType: 'eq_adjustment',
      timestamp: 1_700_000_000_000,
      signature: 'sig_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      sessionId: 'smoke-session',
      sourceHash: 'smoke-source',
      contextId: 'smoke-context',
      generator: 'human-directed',
      assertions: ['agent.human', 'apl.executed'],
    });

    const audioFileName = 'export-smoke.wav';
    const result = await downloadAudioWithManifest({
      audioBlob: createMinimalWavBlob(),
      audioFileName,
      creatorId: 'human:producer',
    });

    expect(result.embeddedMetadata).toBe(true);
    expect(result.manifestFileName).toBe('export-smoke.manifest.json');

    const downloads = (globalThis as any).__eslSmokeDownloads as Array<{ fileName: string; blob: Blob }>;
    expect(downloads.length).toBe(2);

    const audioDownload = downloads.find((d) => d.fileName === audioFileName);
    const manifestDownload = downloads.find((d) => d.fileName === result.manifestFileName);
    expect(audioDownload).toBeTruthy();
    expect(manifestDownload).toBeTruthy();

    const embeddedRef = await extractEmbeddedProvenanceReference(audioDownload!.blob, audioFileName);
    expect(embeddedRef).not.toBeNull();
    expect(embeddedRef?.manifestFileName).toBe(result.manifestFileName);

    const manifestText = await manifestDownload!.blob.text();
    const parsed = JSON.parse(manifestText);
    expect(parsed.manifest?.schemaVersion).toBe('esl.render-manifest.v1');
    expect(parsed.signature).toBeTruthy();
  });
});
