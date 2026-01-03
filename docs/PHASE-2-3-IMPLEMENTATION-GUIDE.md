# Phase 2-3: Implementation Guide
## ProposalPanel UI + APLExecutor Service

**Status**: Ready to Begin
**Timeline**: Days 2-5 (4-5 implementation days)
**Specifications**: Complete & Detailed

---

## Phase 2: ProposalPanel Component (Days 2-3)

### Objective
Display APL proposals to users with evidence-first design and quantum visual distinction.

### Implementation File
**Location**: `/src/components/ProposalPanel.tsx` (NEW)

### Required Interface

```typescript
import { APLProposal } from '@apl';

interface ProposalPanelProps {
  proposals: APLProposal[];
  onApplyDirect?: (proposal: APLProposal) => void;
  onApplyViaAuthority?: (proposal: APLProposal) => void;
  onDefer?: (proposal: APLProposal) => void;
  showQuantumGlow?: boolean;  // Feature toggle for quantum styling
}
```

### Component Structure

```
ProposalPanel (Container)
├─ ProposalCard (for each proposal)
│  ├─ ProvenanceHeader
│  │  ├─ Action Type (LIMITING, NORMALIZATION, DC_REMOVAL, GAIN_ADJUSTMENT)
│  │  ├─ Provenance Badge (Classical / Quantum / QPU)
│  │  └─ Optimization Level (if quantum)
│  │
│  ├─ EvidenceSection (PROMINENT - this is the "why")
│  │  ├─ Metric Name (e.g., "True Peak")
│  │  ├─ Current Value (with units)
│  │  ├─ Target Value (with units)
│  │  ├─ Confidence Score (0-1.0 visual bar)
│  │  └─ Rationale (human-readable explanation)
│  │
│  ├─ ParametersSection (Collapsible)
│  │  └─ All action parameters (plugin, threshold, gain, etc.)
│  │
│  └─ ActionButtons
│     ├─ "Apply Direct" (blue, primary)
│     ├─ "Apply via Authority" (gray, secondary, if AA available)
│     └─ "Defer" (outline, tertiary)
```

### Styling Requirements

#### Classical Proposal
```css
.proposal-card.classical {
  border-left: 4px solid #4B5563;  /* slate */
  background: #F8FAFB;
}

.provenance-badge.classical {
  background: #E2E8F0;
  color: #334155;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
}
```

#### Quantum Proposal
```css
.proposal-card.quantum {
  border-left: 4px solid #7C3AED;  /* vibrant purple */
  background: linear-gradient(to right, #F5F3FF, #F8FAFB);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15);  /* subtle glow */
}

.provenance-badge.quantum {
  background: linear-gradient(135deg, #7C3AED, #A78BFA);
  color: white;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}

.quantum-icon::before {
  content: "⚛️";
  font-size: 14px;
}

@keyframes quantumGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(124, 58, 237, 0.15); }
  50% { box-shadow: 0 0 30px rgba(124, 58, 237, 0.25); }
}

.proposal-card.quantum {
  animation: quantumGlow 3s ease-in-out infinite;
}
```

#### QPU Proposal (Future)
```css
.proposal-card.qpu {
  border-left: 4px solid #EC4899;  /* pink */
  background: linear-gradient(to right, #FDF2F8, #F8FAFB);
}

.provenance-badge.qpu {
  background: linear-gradient(135deg, #EC4899, #F472B6);
  color: white;
}

.qpu-icon::before {
  content: "🔮";
  font-size: 14px;
}
```

### Evidence Display (Most Important)

```typescript
function EvidenceSection({ proposal }: { proposal: APLProposal }) {
  const { metric, currentValue, targetValue, rationale } = proposal.evidence;

  return (
    <div className="evidence-section">
      {/* Metric Name */}
      <div className="metric-label">{metric}</div>

      {/* Current vs Target */}
      <div className="metric-comparison">
        <div className="current">
          <span className="label">Current</span>
          <span className="value">{currentValue.toFixed(2)}</span>
        </div>

        <div className="arrow">→</div>

        <div className="target">
          <span className="label">Target</span>
          <span className="value">{targetValue.toFixed(2)}</span>
        </div>
      </div>

      {/* Confidence Bar */}
      <div className="confidence-bar">
        <div className="bar" style={{ width: `${proposal.confidence * 100}%` }} />
        <span className="label">
          {(proposal.confidence * 100).toFixed(0)}% Confidence
        </span>
      </div>

      {/* Rationale */}
      <div className="rationale">
        <p>{proposal.evidence.rationale}</p>
      </div>
    </div>
  );
}
```

### Integration Points

**In App.tsx**:
```typescript
import { ProposalPanel } from './components/ProposalPanel';
import { APLProposalEngine } from '@apl';

function App() {
  const [proposals, setProposals] = useState<APLProposal[]>([]);

  const handleAnalyzeTrack = (trackId: string) => {
    // Analyze track
    const intelligence = analyzeAudioTrack(trackId);

    // Generate proposals
    const newProposals = APLProposalEngine.generateProposals(intelligence);

    // Optional: enhance with quantum simulation
    if (getQCLSimulator().isEnabled()) {
      const enhanced = newProposals.map(p =>
        getQCLSimulator().enhanceProposal(p)
      );
      setProposals(enhanced);
    } else {
      setProposals(newProposals);
    }
  };

  return (
    <>
      <ProposalPanel
        proposals={proposals}
        onApplyDirect={handleApplyDirect}
        onApplyViaAuthority={handleApplyViaAuthority}
        onDefer={handleDefer}
        showQuantumGlow={true}
      />
    </>
  );
}
```

### Testing Requirements (Phase 2)

```typescript
// Test rendering with classical proposal
test('renders classical proposal with standard styling', () => {
  const proposal = createClassicalProposal();
  render(<ProposalPanel proposals={[proposal]} />);

  expect(screen.getByText('CLASSICAL')).toBeInTheDocument();
  expect(screen.getByText(/True Peak/i)).toBeInTheDocument();
  expect(screen.getByText('Apply Direct')).toBeInTheDocument();
});

// Test rendering with quantum proposal
test('renders quantum proposal with glow effect', () => {
  const proposal = createQuantumProposal();
  render(<ProposalPanel proposals={[proposal]} />);

  expect(screen.getByText('⚛️ Quantum-Optimized')).toBeInTheDocument();
  expect(screen.getByText(/Optimization Level:/i)).toBeInTheDocument();
});

// Test action handlers
test('calls onApplyDirect when Apply Direct button clicked', () => {
  const onApplyDirect = jest.fn();
  const proposal = createClassicalProposal();

  render(<ProposalPanel proposals={[proposal]} onApplyDirect={onApplyDirect} />);

  fireEvent.click(screen.getByText('Apply Direct'));

  expect(onApplyDirect).toHaveBeenCalledWith(proposal);
});
```

---

## Phase 3: APLExecutor Service (Days 3-4)

### Objective
Execute APL proposals directly or route to Action Authority.

### Implementation File
**Location**: `/src/services/aplExecutor.ts` (NEW)

### Required Interface

```typescript
import { APLProposal } from '@apl';

interface APLExecutionOptions {
  useActionAuthority?: boolean;
  confirmBeforeExecute?: boolean;
  trackName?: string;
}

interface ExecutionResult {
  status: 'SUCCESS' | 'FAILED' | 'REJECTED';
  proposalId: string;
  timestamp: number;
  error?: string;
  applescriptOutput?: string;
}

export class APLExecutor {
  async executeProposal(
    proposal: APLProposal,
    options?: APLExecutionOptions
  ): Promise<ExecutionResult>;
}
```

### Implementation Structure

```typescript
export class APLExecutor {
  private executionHistory: ExecutionResult[] = [];

  // Main entry point
  async executeProposal(
    proposal: APLProposal,
    options: APLExecutionOptions = {}
  ): Promise<ExecutionResult> {
    // Route decision
    if (options.useActionAuthority && isAAAvailable()) {
      return this.executeViaActionAuthority(proposal);
    } else {
      return this.executeDirectly(proposal, options);
    }
  }

  // PATH 1: Direct execution (standalone)
  private async executeDirectly(
    proposal: APLProposal,
    options: APLExecutionOptions
  ): Promise<ExecutionResult> {
    // Show confirmation if requested
    if (options.confirmBeforeExecute) {
      const confirmed = await this.showConfirmationDialog(proposal);
      if (!confirmed) {
        return {
          status: 'REJECTED',
          proposalId: proposal.proposalId,
          timestamp: Date.now(),
          error: 'User rejected execution'
        };
      }
    }

    try {
      // Generate AppleScript
      const script = this.proposalToAppleScript(proposal);

      // Execute
      const output = await this.executeAppleScript(script);

      // Emit event (for State Drift mitigation)
      this.broadcastExecutionEvent(proposal);

      // Track history
      const result: ExecutionResult = {
        status: 'SUCCESS',
        proposalId: proposal.proposalId,
        timestamp: Date.now(),
        applescriptOutput: output
      };

      this.executionHistory.push(result);
      return result;
    } catch (error) {
      return {
        status: 'FAILED',
        proposalId: proposal.proposalId,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // PATH 2: Via Action Authority (gated)
  private async executeViaActionAuthority(
    proposal: APLProposal
  ): Promise<ExecutionResult> {
    try {
      const { proposalToWorkOrder } = await import(
        '@action-authority/integration/apl-bridge'
      );

      // Convert to work order
      const workOrder = proposalToWorkOrder(
        proposal,
        generateAuditId(),
        getCurrentContextId(),
        getCurrentSourceHash()
      );

      // Route to AA dispatcher
      const dispatcher = getAADispatcher();
      const aaResult = await dispatcher.dispatch(workOrder);

      // Track and return
      const result: ExecutionResult = {
        status: aaResult.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
        proposalId: proposal.proposalId,
        timestamp: Date.now(),
        error: aaResult.error ? aaResult.error.message : undefined
      };

      this.executionHistory.push(result);
      return result;
    } catch (error) {
      return {
        status: 'FAILED',
        proposalId: proposal.proposalId,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'AA routing failed'
      };
    }
  }

  // AppleScript generation (the core logic)
  private proposalToAppleScript(proposal: APLProposal): string {
    switch (proposal.action.type) {
      case 'LIMITING':
        return this.generateLimiterScript(proposal);
      case 'NORMALIZATION':
        return this.generateGainScript(proposal);
      case 'DC_REMOVAL':
        return this.generateHighpassScript(proposal);
      case 'GAIN_ADJUSTMENT':
        return this.generateGainScript(proposal);
      default:
        throw new Error(`Unknown action type: ${proposal.action.type}`);
    }
  }

  private generateLimiterScript(proposal: APLProposal): string {
    const params = proposal.action.parameters;
    const threshold = params.threshold as number;
    const lookahead = params.lookahead as number;
    const release = params.release as number;

    return `
      tell application "Logic Pro"
        set selectedTrack to (track 1 of project 1)
        create new audio channel strip with properties \\
          {insert new plugin "Limiter" at end}
        set limiter to (first audio unit of (first channel of selectedTrack))
        set threshold of limiter to ${threshold}
        set lookahead of limiter to ${lookahead}
        set release of limiter to ${release}
      end tell
    `;
  }

  private generateGainScript(proposal: APLProposal): string {
    const params = proposal.action.parameters;
    const gainDB = params.gainDB as number;

    return `
      tell application "Logic Pro"
        set selectedTrack to (track 1 of project 1)
        create new audio channel strip with properties \\
          {insert new plugin "Gain" at end}
        set gainPlugin to (first audio unit of (first channel of selectedTrack))
        set gain of gainPlugin to ${gainDB}
      end tell
    `;
  }

  private generateHighpassScript(proposal: APLProposal): string {
    const params = proposal.action.parameters;
    const frequency = params.frequency as number;
    const slope = params.slope as number;

    return `
      tell application "Logic Pro"
        set selectedTrack to (track 1 of project 1)
        create new audio channel strip with properties \\
          {insert new plugin "EQ" at end}
        set eqPlugin to (first audio unit of (first channel of selectedTrack))
        set filter type of eqPlugin to highpass
        set frequency of eqPlugin to ${frequency}
        set slope of eqPlugin to ${slope}
      end tell
    `;
  }

  // Emit event for State Drift mitigation
  private broadcastExecutionEvent(proposal: APLProposal): void {
    window.dispatchEvent(
      new CustomEvent('apl:proposal_executed', {
        detail: {
          proposalId: proposal.proposalId,
          trackId: proposal.trackId,
          actionType: proposal.action.type,
          timestamp: Date.now()
        }
      })
    );
  }

  // Utility: Get execution history
  public getHistory(): ExecutionResult[] {
    return [...this.executionHistory];
  }

  // Utility: Check if AA is available
  private isAAAvailable(): boolean {
    try {
      return typeof window !== 'undefined' &&
             (window as any).__ACTION_AUTHORITY__ !== undefined;
    } catch {
      return false;
    }
  }
}

// Singleton
let executorInstance: APLExecutor | null = null;

export function getAPLExecutor(): APLExecutor {
  if (!executorInstance) {
    executorInstance = new APLExecutor();
  }
  return executorInstance;
}
```

### Integration with ProposalPanel

**In ProposalPanel.tsx**:
```typescript
import { getAPLExecutor } from '@services/aplExecutor';

function ProposalCard({ proposal }: { proposal: APLProposalCardProps }) {
  const executor = getAPLExecutor();
  const [isLoading, setIsLoading] = useState(false);

  const handleApplyDirect = async () => {
    setIsLoading(true);
    const result = await executor.executeProposal(proposal, {
      useActionAuthority: false,
      confirmBeforeExecute: true
    });

    if (result.status === 'SUCCESS') {
      showSuccess(`${proposal.action.type} applied successfully`);
    } else {
      showError(`Failed to apply: ${result.error}`);
    }

    setIsLoading(false);
  };

  const handleApplyViaAuthority = async () => {
    setIsLoading(true);
    const result = await executor.executeProposal(proposal, {
      useActionAuthority: true
    });

    if (result.status === 'SUCCESS') {
      showSuccess(`${proposal.action.type} approved and applied`);
    } else {
      showError(`Action Authority rejected: ${result.error}`);
    }

    setIsLoading(false);
  };

  return (
    <div className={`proposal-card ${proposal.provenance.engine}`}>
      {/* Evidence, parameters, etc. */}

      <div className="action-buttons">
        <button
          onClick={handleApplyDirect}
          disabled={isLoading}
          className="btn-primary"
        >
          Apply Direct
        </button>

        {isAAAvailable() && (
          <button
            onClick={handleApplyViaAuthority}
            disabled={isLoading}
            className="btn-secondary"
          >
            Apply via Authority
          </button>
        )}

        <button onClick={onDefer} className="btn-outline">
          Defer
        </button>
      </div>
    </div>
  );
}
```

### Testing Requirements (Phase 3)

```typescript
describe('APLExecutor', () => {
  // Test AppleScript generation
  test('generates valid AppleScript for limiter proposal', () => {
    const executor = getAPLExecutor();
    const proposal = createLimiterProposal();

    const script = executor.generateLimiterScript(proposal);

    expect(script).toContain('tell application "Logic Pro"');
    expect(script).toContain('set threshold of limiter');
    expect(script).toMatch(/-0\.1/);  // limiter threshold
  });

  // Test direct execution
  test('executes proposal directly when AA not available', async () => {
    const executor = getAPLExecutor();
    const proposal = createClassicalProposal();

    const result = await executor.executeProposal(proposal, {
      useActionAuthority: false
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.proposalId).toBe(proposal.proposalId);
  });

  // Test AA routing
  test('routes to Action Authority when requested', async () => {
    const executor = getAPLExecutor();
    const proposal = createQuantumProposal();

    const result = await executor.executeProposal(proposal, {
      useActionAuthority: true
    });

    // Should route to AA dispatcher
    expect(result.status).toMatch(/SUCCESS|FAILED/);
  });

  // Test execution history
  test('tracks execution history', async () => {
    const executor = getAPLExecutor();
    const proposal = createClassicalProposal();

    await executor.executeProposal(proposal);

    const history = executor.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].proposalId).toBe(proposal.proposalId);
  });
});
```

---

## Phase 4: State Drift Mitigation (Days 4-5)

### Integration with Action Authority

**In Action Authority (if using AA)**:
```typescript
// Listen for APL execution events
window.addEventListener('apl:proposal_executed', (event: CustomEvent) => {
  const { trackId } = event.detail;

  // Invalidate cached context for this track
  ContextBinding.invalidateTrackContext(trackId);

  // Optionally: show notification
  console.log(`[AA] Context invalidated for track ${trackId} due to APL execution`);
});
```

---

## Phase 5: Testing & Integration (Days 5-7)

### Full End-to-End Tests

```typescript
describe('APL Proposal Flow (E2E)', () => {
  test('complete flow: analyze → propose → display → execute', async () => {
    // 1. Analyze track
    const intelligence = analyzeTrack('track-001');

    // 2. Generate proposals
    const proposals = APLProposalEngine.generateProposals(intelligence);
    expect(proposals.length).toBeGreaterThan(0);

    // 3. Display in panel
    render(<ProposalPanel proposals={proposals} />);
    expect(screen.getByText('Apply Direct')).toBeInTheDocument();

    // 4. Execute
    const executor = getAPLExecutor();
    const result = await executor.executeProposal(proposals[0]);
    expect(result.status).toBe('SUCCESS');
  });

  test('quantum proposal flow works end-to-end', async () => {
    const qcl = getQCLSimulator();
    qcl.enable(0.75);

    const proposals = APLProposalEngine.generateProposals(intelligence);
    const enhanced = proposals.map(p => qcl.enhanceProposal(p));

    // Should have quantum provenance
    expect(enhanced[0].provenance.engine).toBe('QUANTUM_SIMULATOR');

    // Execute should work identically
    const executor = getAPLExecutor();
    const result = await executor.executeProposal(enhanced[0]);
    expect(result.status).toBe('SUCCESS');
  });
});
```

---

## Deliverables Summary

| Phase | Component | Status | Lines | Tests |
|-------|-----------|--------|-------|-------|
| 2 | ProposalPanel.tsx | NEW | 400-500 | 10+ |
| 3 | aplExecutor.ts | NEW | 300-400 | 10+ |
| 4 | AA Bridge Integration | UPDATE | 50 | 5+ |
| 5 | E2E Tests | NEW | 200+ | 10+ |

**Total Phase 2-3**: ~1500 LOC of implementation

---

## Ready to Proceed?

✅ **Phase 0-1 Foundation**: Complete and sealed
✅ **Phase 2-3 Specification**: Detailed and clear
✅ **Timeline**: 4-5 days for full implementation
✅ **Testing Strategy**: >90% coverage target

**Next Action**: Begin Phase 2 ProposalPanel component

---

🏛️ **THE FOUNDATION IS SET. IMPLEMENTATION IS STRAIGHTFORWARD.** ⚛️🛡️

