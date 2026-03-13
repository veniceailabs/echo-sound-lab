import { postJson } from './backendApi';

export interface ExecutionSession {
  sessionId: string;
  sessionSecret: string;
  expiresAt: number;
  signatureVersion: 'hmac-sha256-v1';
}

class ExecutionSessionService {
  private currentSession: ExecutionSession | null = null;
  private sessionsById = new Map<string, ExecutionSession>();

  public async getSession(): Promise<ExecutionSession> {
    const now = Date.now();
    if (this.currentSession && this.currentSession.expiresAt > now + 10_000) {
      return this.currentSession;
    }

    const session = await postJson<ExecutionSession>('/api/proxy/security/session', {});
    this.currentSession = session;
    this.sessionsById.set(session.sessionId, session);
    return session;
  }

  public getSessionById(sessionId: string): ExecutionSession | null {
    const session = this.sessionsById.get(sessionId);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessionsById.delete(sessionId);
      return null;
    }
    return session;
  }

  public async consumeNonce(sessionId: string, nonce: string): Promise<boolean> {
    try {
      const response = await postJson<{ consumed: boolean }>('/api/proxy/security/consume', {
        sessionId,
        nonce,
      });
      return response.consumed === true;
    } catch {
      return false;
    }
  }

  // Test helper: deterministic local seed without network handshake.
  public seedSessionForTest(session: ExecutionSession): void {
    this.currentSession = session;
    this.sessionsById.set(session.sessionId, session);
  }

  public resetForTest(): void {
    this.currentSession = null;
    this.sessionsById.clear();
  }
}

export const executionSessionService = new ExecutionSessionService();
