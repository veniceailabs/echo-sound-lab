import { ExecutionPayload } from '../types/execution-contract';

export type ProvenanceActorType = 'HUMAN' | 'AI';

export interface ProvenanceActor {
  id: string;
  type: ProvenanceActorType;
}

export interface ProvenanceLedgerEntry {
  index: number;
  proposalId: string;
  actor: ProvenanceActor;
  actionType: string;
  timestamp: number;
  signature: string;
  sessionId: string;
  sourceHash: string;
  contextId: string;
  generator: string;
  readonly assertions: readonly string[];
}

export interface ProvenanceAppendInput {
  proposalId: string;
  actor: ProvenanceActor;
  actionType: string;
  timestamp: number;
  signature: string;
  sessionId: string;
  sourceHash: string;
  contextId: string;
  generator?: string;
  assertions?: string[];
}

function buildLedgerSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `ledger-${crypto.randomUUID()}`;
  }
  return `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function inferActor(payload: ExecutionPayload): ProvenanceActor {
  const context = payload.aaContext;
  const actorId = context.actorId || String((payload.parameters as any)?.actorId || '').trim();
  const actorType = context.actorType;

  if (actorId && (actorType === 'HUMAN' || actorType === 'AI')) {
    return { id: actorId, type: actorType };
  }

  const generatorId =
    context.generatorId ||
    String((payload.parameters as any)?.generatorId || '').trim() ||
    String((payload.parameters as any)?.model || '').trim();

  if (actorId && !actorType) {
    const inferredType: ProvenanceActorType = actorId.startsWith('ai:') ? 'AI' : 'HUMAN';
    return { id: actorId, type: inferredType };
  }

  if (generatorId) {
    return { id: `ai:${generatorId}`, type: 'AI' };
  }

  const upperAction = payload.actionType.toUpperCase();
  if (upperAction.includes('GENERATE') || upperAction.includes('SUNO') || upperAction.includes('VOICE')) {
    return { id: 'ai:esl-generation-system', type: 'AI' };
  }

  return { id: 'human:local-user', type: 'HUMAN' };
}

function inferGenerator(payload: ExecutionPayload, actor: ProvenanceActor): string {
  const context = payload.aaContext;
  if (context.generatorId) return context.generatorId;
  const model = String((payload.parameters as any)?.model || '').trim();
  if (model) return model;
  return actor.type === 'AI' ? actor.id : 'human-directed';
}

export class ProvenanceLedger {
  private readonly ledgerSessionId: string;
  private readonly entries: ProvenanceLedgerEntry[] = [];
  private readonly entryKeys = new Set<string>();

  constructor(sessionId?: string) {
    this.ledgerSessionId = sessionId && sessionId.trim() ? sessionId.trim() : buildLedgerSessionId();
  }

  getSessionId(): string {
    return this.ledgerSessionId;
  }

  append(input: ProvenanceAppendInput): ProvenanceLedgerEntry {
    if (!input.proposalId || !input.actionType) {
      throw new Error('PROVENANCE_LEDGER_REJECTED: missing proposalId or actionType');
    }

    if (!input.signature || input.signature.trim().length < 16) {
      throw new Error('PROVENANCE_LEDGER_REJECTED: unsigned insertion is forbidden');
    }

    if (!Number.isFinite(input.timestamp) || input.timestamp <= 0) {
      throw new Error('PROVENANCE_LEDGER_REJECTED: invalid timestamp');
    }

    const last = this.entries[this.entries.length - 1];
    if (last && input.timestamp < last.timestamp) {
      throw new Error('PROVENANCE_LEDGER_REJECTED: out-of-order insertion');
    }

    const entryKey = `${input.sessionId}:${input.proposalId}:${input.signature}`;
    if (this.entryKeys.has(entryKey)) {
      throw new Error('PROVENANCE_LEDGER_REJECTED: duplicate insertion');
    }

    const entry: ProvenanceLedgerEntry = Object.freeze({
      index: this.entries.length,
      proposalId: input.proposalId,
      actor: Object.freeze({ ...input.actor }),
      actionType: input.actionType,
      timestamp: input.timestamp,
      signature: input.signature,
      sessionId: input.sessionId,
      sourceHash: input.sourceHash,
      contextId: input.contextId,
      generator: input.generator || (input.actor.type === 'AI' ? input.actor.id : 'human-directed'),
      assertions: Object.freeze([...(input.assertions || ['execution.approved', 'execution.verified'])]),
    });

    this.entries.push(entry);
    this.entryKeys.add(entryKey);
    return entry;
  }

  appendFromExecutionPayload(payload: ExecutionPayload, executedTimestamp: number = Date.now()): ProvenanceLedgerEntry {
    const actor = inferActor(payload);
    return this.append({
      proposalId: payload.proposalId,
      actor,
      actionType: payload.actionType,
      timestamp: executedTimestamp,
      signature: payload.aaContext.signature,
      sessionId: payload.aaContext.sessionId,
      sourceHash: payload.aaContext.sourceHash,
      contextId: payload.aaContext.contextId,
      generator: inferGenerator(payload, actor),
      assertions: [
        actor.type === 'AI' ? 'agent.ai' : 'agent.human',
        'apl.executed',
        'signature.validated',
      ],
    });
  }

  getEntries(): ProvenanceLedgerEntry[] {
    return this.entries.map((entry) => ({
      ...entry,
      actor: { ...entry.actor },
      assertions: [...entry.assertions],
    }));
  }

  resetForTest(): void {
    this.entries.length = 0;
    this.entryKeys.clear();
  }
}

export const provenanceLedger = new ProvenanceLedger();
