import React, { useEffect, useState } from 'react';
import { ForensicAuditEntry } from '../action-authority/audit/forensic-types';
import { ForensicAuditLog } from '../action-authority/audit/forensic-log';
import './ForensicViewer.css';

/**
 * ForensicDetailCard
 * Renders a single forensic audit entry in five-section format
 * [1] IDENTITY & METADATA
 * [2] PERCEPTION (Evidence)
 * [3] AUTHORITY (Intent Proof)
 * [4] EXECUTION (Result)
 * [5] SEALING (Immutability Proof)
 */
const ForensicDetailCard: React.FC<{ entry: ForensicAuditEntry }> = ({ entry }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['perception', 'authority', 'execution'])
  );

  const toggleSection = (name: string) => {
    const next = new Set(expandedSections);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setExpandedSections(next);
  };

  const statusColor = entry.execution.status === 'SUCCESS' ? '#3fb950' : '#f85149';

  return (
    <div className="forensic-detail-card">
      {/* [1] IDENTITY & METADATA */}
      <section className="forensic-section">
        <h2>[1] IDENTITY &amp; METADATA</h2>
        <div className="forensic-grid">
          <div className="forensic-label">AUDIT_ID</div>
          <div className="forensic-value monospace">{entry.auditId}</div>

          <div className="forensic-label">ACTION_ID</div>
          <div className="forensic-value monospace">{entry.actionId}</div>

          <div className="forensic-label">SESSION</div>
          <div className="forensic-value">{entry.session}</div>

          <div className="forensic-label">TIMESTAMP</div>
          <div className="forensic-value monospace">{new Date(entry.timestamp).toISOString()}</div>
        </div>
      </section>

      {/* [2] PERCEPTION (Why the action was proposed) */}
      <section className="forensic-section">
        <div className="forensic-section-header" onClick={() => toggleSection('perception')}>
          <h2>[2] PERCEPTION (EVIDENCE &amp; RATIONALE)</h2>
          <span className="forensic-toggle">{expandedSections.has('perception') ? '▼' : '▶'}</span>
        </div>
        {expandedSections.has('perception') && (
          <div className="forensic-content">
            <div className="forensic-grid">
              <div className="forensic-label">SOURCE</div>
              <div className="forensic-value">
                <span className="forensic-badge">{entry.rationale.source}</span>
              </div>

              <div className="forensic-label">DESCRIPTION</div>
              <div className="forensic-value">{entry.rationale.description}</div>

              <div className="forensic-label">CONFIDENCE</div>
              <div className="forensic-value">{(entry.rationale.confidence * 100).toFixed(1)}%</div>
            </div>

            {entry.rationale.evidence && Object.keys(entry.rationale.evidence).length > 0 && (
              <div className="forensic-evidence-block">
                <div className="forensic-evidence-label">EVIDENCE (Raw Metrics)</div>
                <pre className="forensic-evidence-json">
                  {JSON.stringify(entry.rationale.evidence, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* [3] AUTHORITY (How the user confirmed intent) */}
      <section className="forensic-section">
        <div className="forensic-section-header" onClick={() => toggleSection('authority')}>
          <h2>[3] AUTHORITY (INTENT PROOF)</h2>
          <span className="forensic-toggle">{expandedSections.has('authority') ? '▼' : '▶'}</span>
        </div>
        {expandedSections.has('authority') && (
          <div className="forensic-content">
            <div className="forensic-grid">
              <div className="forensic-label">HOLD_DURATION</div>
              <div
                className="forensic-value forensic-hold-duration"
                style={{
                  color: entry.authority.holdDurationMs >= 400 ? '#3fb950' : '#f85149',
                }}
              >
                <strong>{entry.authority.holdDurationMs}ms</strong>
                <span className="forensic-threshold">
                  {entry.authority.holdDurationMs >= 400 ? '✓ PASSED' : '✗ FAILED'} (THRESHOLD: 400ms)
                </span>
              </div>

              <div className="forensic-label">FSM_PATH</div>
              <div className="forensic-value monospace forensic-fsmpath">
                {entry.authority.fsmPath.join(' → ')}
              </div>

              <div className="forensic-label">CONFIRMATION_TIME</div>
              <div className="forensic-value monospace">
                {new Date(entry.authority.confirmationTime).toISOString()}
              </div>

              <div className="forensic-label">CONTEXT_ID</div>
              <div className="forensic-value monospace">{entry.authority.contextId.substring(0, 16)}…</div>
            </div>
          </div>
        )}
      </section>

      {/* [4] EXECUTION (What happened as a result) */}
      <section className="forensic-section">
        <div className="forensic-section-header" onClick={() => toggleSection('execution')}>
          <h2>[4] EXECUTION (RESULT)</h2>
          <span className="forensic-toggle">{expandedSections.has('execution') ? '▼' : '▶'}</span>
        </div>
        {expandedSections.has('execution') && (
          <div className="forensic-content">
            <div className="forensic-grid">
              <div className="forensic-label">DOMAIN</div>
              <div className="forensic-value">
                <span className="forensic-domain-badge">{entry.execution.domain}</span>
              </div>

              <div className="forensic-label">STATUS</div>
              <div className="forensic-value">
                <span
                  className="forensic-status-badge"
                  style={{
                    backgroundColor: statusColor,
                    color: '#0d1117',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                  }}
                >
                  {entry.execution.status}
                </span>
              </div>

              <div className="forensic-label">DURATION</div>
              <div className="forensic-value">{entry.execution.duration}ms</div>

              <div className="forensic-label">RESULT_HASH</div>
              <div className="forensic-value monospace">{entry.execution.resultHash.substring(0, 16)}…</div>

              <div className="forensic-label">EXECUTED_AT</div>
              <div className="forensic-value monospace">
                {new Date(entry.execution.executedAt).toISOString()}
              </div>
            </div>

            {entry.execution.error && (
              <div className="forensic-error-block" style={{ borderLeft: '3px solid #f85149' }}>
                <div className="forensic-error-label">ERROR</div>
                <pre className="forensic-error-json">{JSON.stringify(entry.execution.error, null, 2)}</pre>
              </div>
            )}

            {entry.execution.output && (
              <div className="forensic-output-block" style={{ borderLeft: '3px solid #3fb950' }}>
                <div className="forensic-output-label">OUTPUT</div>
                <pre className="forensic-output-json">{JSON.stringify(entry.execution.output, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </section>

      {/* [5] SEALING (Immutability & Integrity) */}
      <section className="forensic-section forensic-sealing">
        <div className="forensic-sealing-badge">
          <span style={{ color: '#3fb950', fontSize: '18px' }}>✓</span>
          <span>THIS ENTRY IS SEALED AND CRYPTOGRAPHICALLY FROZEN</span>
        </div>
        <div className="forensic-sealing-details">
          <div className="forensic-grid">
            <div className="forensic-label">SEALED_AT</div>
            <div className="forensic-value monospace">{new Date(entry.sealedAt).toISOString()}</div>

            <div className="forensic-label">SEALED_BY</div>
            <div className="forensic-value monospace">{entry.sealedBy}</div>

            <div className="forensic-label">FROZEN</div>
            <div className="forensic-value" style={{ color: '#3fb950' }}>
              {Object.isFrozen(entry) ? '✓ YES (Immutable)' : '✗ NO (ERROR)'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * ForensicViewer
 * Root component for forensic audit explorer
 * Left panel: timeline rail with numbered ticks
 * Right panel: forensic detail card
 */
export const ForensicViewer: React.FC = () => {
  const [entries, setEntries] = useState<ForensicAuditEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const history = ForensicAuditLog.getHistory();
      setEntries(history);
      if (history.length > 0) {
        setSelectedId(history[0].auditId);
      }
    } catch (err) {
      console.error('Failed to load forensic history:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectedEntry = entries.find((e) => e.auditId === selectedId);
  const successCount = entries.filter((e) => e.execution.status === 'SUCCESS').length;
  const failureCount = entries.filter((e) => e.execution.status === 'FAILED').length;

  return (
    <div className="forensic-root">
      <header className="forensic-header">
        <h1>🏛️ ACTION AUTHORITY FORENSIC EXPLORER</h1>
        <div className="forensic-stats">
          <span>ENTRIES: {entries.length}</span>
          <span style={{ color: '#3fb950' }}>SUCCESS: {successCount}</span>
          <span style={{ color: '#f85149' }}>FAILED: {failureCount}</span>
        </div>
      </header>

      {isLoading ? (
        <div className="forensic-loading">
          <p>Loading forensic history...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className="forensic-empty">
          <p>No forensic entries yet.</p>
          <p style={{ fontSize: '12px', opacity: 0.6 }}>Execute an authorized action to create a forensic record.</p>
        </div>
      ) : (
        <div className="forensic-main">
          <aside className="forensic-rail">
            {entries.map((entry, idx) => {
              const isSelected = selectedId === entry.auditId;
              const status = entry.execution.status.toLowerCase();

              return (
                <div
                  key={entry.auditId}
                  className={`timeline-tick timeline-tick-${status} ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedId(entry.auditId)}
                  title={`${entry.actionId} - ${new Date(entry.timestamp).toLocaleTimeString()}`}
                >
                  <span className="timeline-number">{idx + 1}</span>
                </div>
              );
            })}
          </aside>

          <main className="forensic-detail">
            {selectedEntry && <ForensicDetailCard entry={selectedEntry} />}
          </main>
        </div>
      )}
    </div>
  );
};

export default ForensicViewer;
