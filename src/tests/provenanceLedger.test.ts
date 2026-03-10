import { describe, expect, test } from 'vitest';
import { ProvenanceLedger } from '../services/ProvenanceLedger';
import { buildRenderManifest } from '../services/provenanceManifestService';
import {
  hashManifestPayload,
  signManifestPayloadWithSecret,
  verifyManifestSignatureWithSecret,
} from '../services/provenanceSigning';

describe('Provenance Ledger', () => {
  test('rejects unsigned and out-of-order insertions', () => {
    const ledger = new ProvenanceLedger('ledger-test-session');

    ledger.append({
      proposalId: 'proposal-1',
      actor: { id: 'human:user-1', type: 'HUMAN' },
      actionType: 'eq_adjustment',
      timestamp: 1_700_000_000_000,
      signature: 'sig_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sessionId: 'exec-session-1',
      sourceHash: 'src-hash-1',
      contextId: 'ctx-1',
    });

    expect(() =>
      ledger.append({
        proposalId: 'proposal-unsigned',
        actor: { id: 'ai:gemini-pro-1.5', type: 'AI' },
        actionType: 'suno_generate',
        timestamp: 1_700_000_000_001,
        signature: '',
        sessionId: 'exec-session-1',
        sourceHash: 'src-hash-2',
        contextId: 'ctx-2',
      })
    ).toThrow('unsigned insertion');

    expect(() =>
      ledger.append({
        proposalId: 'proposal-out-of-order',
        actor: { id: 'ai:gemini-pro-1.5', type: 'AI' },
        actionType: 'suno_generate',
        timestamp: 1_699_999_999_999,
        signature: 'sig_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        sessionId: 'exec-session-1',
        sourceHash: 'src-hash-3',
        contextId: 'ctx-3',
      })
    ).toThrow('out-of-order insertion');
  });

  test('builds C2PA-aligned manifest and verifies signature/hash', async () => {
    const ledger = new ProvenanceLedger('ledger-test-session-2');

    ledger.append({
      proposalId: 'proposal-human',
      actor: { id: 'human:producer-42', type: 'HUMAN' },
      actionType: 'eq_adjustment',
      timestamp: 1_700_000_100_000,
      signature: 'sig_hhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
      sessionId: 'exec-session-2',
      sourceHash: 'src-hash-h',
      contextId: 'ctx-h',
      generator: 'human-directed',
      assertions: ['agent.human', 'apl.executed', 'signature.validated'],
    });

    ledger.append({
      proposalId: 'proposal-ai',
      actor: { id: 'ai:gemini-pro-1.5', type: 'AI' },
      actionType: 'suno_generate',
      timestamp: 1_700_000_100_010,
      signature: 'sig_gggggggggggggggggggggggggggggggg',
      sessionId: 'exec-session-2',
      sourceHash: 'src-hash-g',
      contextId: 'ctx-g',
      generator: 'gemini-pro-1.5',
      assertions: ['agent.ai', 'apl.executed', 'signature.validated'],
    });

    const manifest = buildRenderManifest({
      sessionId: ledger.getSessionId(),
      entries: ledger.getEntries(),
      fileName: 'mastered-track.wav',
      format: 'wav',
      exportTimestamp: 1_700_000_200_000,
      creatorId: 'human:producer-42',
    });

    expect(manifest.c2pa.Creator).toBe('human:producer-42');
    expect(manifest.c2pa.Generator).toContain('gemini-pro-1.5');
    expect(manifest.c2pa.Timestamp).toBeTruthy();
    expect(Array.isArray(manifest.c2pa.Assertions)).toBe(true);
    expect(manifest.c2pa.Assertions.length).toBe(2);

    const signingSecret = 'test-manifest-signing-secret';
    const signature = await signManifestPayloadWithSecret(manifest, signingSecret);
    const isValid = await verifyManifestSignatureWithSecret(manifest, signature, signingSecret);
    expect(isValid).toBe(true);

    const hash = await hashManifestPayload(manifest);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);

    const tamperedManifest = {
      ...manifest,
      entries: manifest.entries.map((entry, index) =>
        index === 1 ? { ...entry, actionType: 'suno_generate_tampered' } : entry
      ),
    };
    const tamperedValid = await verifyManifestSignatureWithSecret(tamperedManifest, signature, signingSecret);
    expect(tamperedValid).toBe(false);
  });
});
