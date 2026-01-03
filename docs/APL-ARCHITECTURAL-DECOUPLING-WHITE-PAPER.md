# APL Architectural Decoupling White Paper

**Status**: Pre-Beta Analysis
**Date**: 2026-01-01
**Audience**: Technical Team, Gemini AI Review
**Priority**: CRITICAL for Beta v1.0 Ship

---

## Executive Summary

Audio Perception Layer (APL) was designed as Echo Sound Lab's forensic signal analysis system but is currently **architecturally coupled to Action Authority** (AA) through the proposal-to-work-order bridge. This creates two critical problems:

1. **Coupling Violation**: APL/Echo Sound Lab cannot exist independently from AA (architectural violation)
2. **Feature Limitation**: APL's core capabilities (analysis, recommendations, UI feedback) are blocked from users unless they also use AA

**Recommendation**: Decouple APL from AA completely while maintaining the option for future integration. APL should be a standalone, feature-complete analysis system that works in Echo Sound Lab with or without Action Authority.

**Timeline**: 5-7 days of refactoring + testing before beta ship

---

## Gemini Architectural Review & Approval ✅

**Status**: FORMALLY APPROVED by Gemini AI Review

### Approval Points

**1. Dependency Inversion Principle**: SOUND ✅
- Moving `proposalToWorkOrder()` out of APL and into AA bridge is correct
- APL is the "Producer," AA is the "Consumer"
- Producers should never know about their consumers
- **Verdict**: Follows proper separation of concerns

**2. Execution Model (Direct vs. Gated)**: APPROVED ✅
- Offering two paths (direct execution + optional AA gate) is a masterstroke for product adoption
- Scales system from "Home Hobbyist" to "Enterprise Studio"
- Users choose the governance model that fits their use case
- **Verdict**: Excellent design for market positioning

**3. Timeline (5-7 Days)**: ACHIEVABLE ✅
- AppleScript generation logic already exists from Phase 11 work
- Phase 1 & 2 are straightforward refactoring
- Phase 3 complexity is manageable (wrapping existing code)
- **Verdict**: Realistic timeline for ship

**4. ProposalPanel Design**: MEETS EXPECTATIONS ✅
- **Key requirement**: Evidence must be prominent
- Users trust AI more when they see the metric that triggered the suggestion
- Example: "+2.1 dB Peak detected → Limiter recommended"
- **Verdict**: Design approved, emphasis on Evidence display

**5. Test Coverage (>90%)**: REALISTIC ✅
- Focus on unit testing AppleScript string generation
- Don't need to test Logic Pro itself, just APL's output
- Integration tests for direct execution path
- **Verdict**: Coverage goal achievable with focused approach

### Critical Finding: State Drift Risk

**Risk Identified**: Double App State Synchronization

**Scenario**:
1. User applies Limiter via APL's Direct Execution
2. Action Authority was watching the same track (with a cached sourceHash)
3. AA's sourceHash is now stale (track has changed)
4. User later tries to approve an AA proposal for the same track
5. AA's FSM might accept a "Stale Approval" (track state mismatch)

**Severity**: MEDIUM (Product correctness issue)

**Mitigation Required**: Global Context Invalidator

**Implementation**:
- When APL executes any proposal, emit `APL_EXECUTION_EVENT`
- Action Authority listener catches this event
- AA invalidates cached context hashes for affected tracks
- AA forces context re-validation on next approval attempt

**Code Location** (Phase 3):
```typescript
// In APLExecutor.ts
private async broadcastExecutionEvent(proposal: APLProposal): void {
  window.dispatchEvent(new CustomEvent('apl:proposal_executed', {
    detail: {
      proposalId: proposal.proposalId,
      trackId: proposal.trackId,
      actionType: proposal.action.type,
      timestamp: Date.now()
    }
  }));
}

// In Action Authority (optional listener)
window.addEventListener('apl:proposal_executed', (event: CustomEvent) => {
  const { trackId } = event.detail;
  // Invalidate AA's cached context for this track
  ContextBinding.invalidateTrackContext(trackId);
});
```

### Additional Architectural Guidance

**Double Action Risk**: User Confusion
- If both APL's ProposalPanel and AA's HUD show the same proposal
- User might not know which path to take
- **Constraint**: Only show ONE execution path per proposal at a time
- **UI Rule**: If proposal is in AA queue, hide "Apply Direct" in APL

**FSM Protection**: Golden Master Constraint
- Action Authority v1.0.0 FSM remains locked forever
- **DO NOT MODIFY** `fsm.ts` during this refactor
- Bridge code (Phase 4) must only interact with:
  - `AAWorkOrder` schema
  - `AAExecutionDispatcher` interface
- No changes to FSM logic, state transitions, or core behavior

**JSON Serialization**: Plain Old Data
- APLProposal must be 100% JSON-serializable
- No circular references, no functions
- Allows proposals to be:
  - Saved to disk
  - Sent over network (future API)
  - Consumed by third-party tools

---

## Phase 1 Go-Signal: AUTHORIZED ✅

**Build Order for Day 1**:

1. ✅ Cleanse `proposal-engine.ts`: Strip all ActionAuthority types and methods
2. ✅ Verify Standalone Build: Ensure echo-sound-lab compiles with action-authority folder deleted
3. ✅ Define APL-Only Types: APLProposal as plain JSON-serializable object
4. ✅ Create State Drift Mitigation: Global Context Invalidator pattern

**Proceed with confidence. The architecture is sound.** 🏛️🛡️

---

## Current State Analysis

### What APL Does (Correctly)

✅ **Signal Intelligence**:
- Forensic metric extraction (LUFS, peaks, spectral content, dynamics)
- Anomaly detection (clipping, DC offset, silence)
- Verdict generation with immutable reports

✅ **Proposal Generation**:
- Converts anomalies → actionable proposals
- LIMITING, NORMALIZATION, DC_REMOVAL patterns
- Confidence scoring (advisory)
- AppleScript command generation

✅ **Real-Time Perception**:
- Continuous Web Audio API integration
- PerceptualFrame and PerceptualEmbedding tracking
- APLChangeEvent detection with confidence gating

---

### What's Broken (The Coupling Problem)

❌ **Architectural Coupling**:

```typescript
// proposal-engine.ts (Line 28)
import { createWorkOrder, ExecutionDomain, BridgeType }
from '../action-authority/execution';

// Line 82-95: proposalToWorkOrder() method
public proposalToWorkOrder(
  proposal: APLProposal,
  auditId: string,
  contextId: string,
  sourceHash: string
): AAWorkOrder
```

**The Issue**: APL cannot generate executable recommendations without AA's work order system.

❌ **UI Integration Blocked**:
- APL proposals exist in code but aren't displayed to users
- Analysis Panel shows generic metrics, not APL-generated proposals
- No "Apply This Suggestion" button in the UI
- Reason: Proposals require AA execution, which is optional

❌ **Standalone Use Impossible**:
- User wants analysis + recommendations without AA authorization
- APL's value is trapped behind AA's governance layer
- No way to show recommendations directly (they exist but can't be used)

---

## Root Cause Analysis

### Why This Happened

When APL was designed, it was assumed:
1. APL would always feed into Action Authority
2. All APL recommendations would go through AA's FSM gate
3. AA and Echo Sound Lab would be tightly integrated

**Reality**: AA and Echo Sound Lab are separate, independent applications. APL should work in both contexts.

---

## Proposed Architecture: Independent APL

### New Mental Model

```
┌─────────────────────────────────────────────────────────────┐
│ APL (Audio Perception Layer) - Standalone System            │
│                                                              │
│ ✅ Signal Intelligence (metrics, anomalies, verdicts)      │
│ ✅ Proposal Generation (recommendations with evidence)      │
│ ✅ UI Integration (display + user actions)                  │
│ ✅ Export Format (JSON, reports, AppleScript)              │
│                                                              │
│ 🔗 OPTIONAL: Bridge to Action Authority                    │
│    (If AA is present, proposals can use FSM gates)         │
│    (If AA is absent, proposals execute directly)           │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Principles

**1. APL is Decoupled (No imports from AA)**
- APL can be used standalone
- Does not depend on Action Authority existing
- Exports only its own types and classes

**2. AA Bridge is Optional**
- New file: `apl-action-authority-bridge.ts` (in AA, not APL)
- AA can optionally consume APL proposals
- APL works fine if AA is absent

**3. Execution Path is Configurable**
- APL users can choose:
  - **Direct Execution**: Apply APL recommendation directly (with confirmation)
  - **AA Gate**: Route through Action Authority (with FSM hold gate)
  - **Manual**: Show recommendation, user decides

---

## Refactoring Plan

### Phase 1: Remove AA Imports from APL (Day 1-2)

**File**: `/src/echo-sound-lab/apl/proposal-engine.ts`

**Current problematic code**:
```typescript
import { createWorkOrder, ExecutionDomain, BridgeType }
from '../action-authority/execution';

public proposalToWorkOrder(
  proposal: APLProposal,
  auditId: string,
  contextId: string,
  sourceHash: string
): AAWorkOrder { ... }
```

**After refactor**:
```typescript
// APL has NO imports from AA
// Remove proposalToWorkOrder() method entirely
// Export proposal as-is to consumers

// APL exports:
public generateProposals(intelligence: APLSignalIntelligence): APLProposal[]
// DONE. Proposals are complete and self-contained.
```

**Impact**: APL no longer depends on AA. Can ship independently.

---

### Phase 2: Create APL UI Integration Layer (Day 2-3)

**Goal**: Make APL proposals visible and actionable in Echo Sound Lab

**New Component**: `ProposalPanel.tsx`

```typescript
interface APLProposalPanelProps {
  proposals: APLProposal[];
  onApply?: (proposal: APLProposal) => void;
  onDefer?: (proposal: APLProposal) => void;
}

export function APLProposalPanel({
  proposals,
  onApply,
  onDefer
}: APLProposalPanelProps) {
  return (
    <div className="apl-proposals">
      {proposals.map(proposal => (
        <ProposalCard
          key={proposal.proposalId}
          proposal={proposal}
          onApply={onApply}
          onDefer={onDefer}
        />
      ))}
    </div>
  );
}
```

**Proposal Card Features**:
- ✅ Action type (LIMITING, NORMALIZATION, DC_REMOVAL)
- ✅ Evidence display (metric, current value, target value)
- ✅ Confidence score (visual indicator)
- ✅ Rationale text
- ✅ "Apply" button (direct execution)
- ✅ "Defer" button (dismiss for now)
- ✅ Collapsible details (full signal intelligence report)

**Integration Points**:
- Add to `/src/components/ProposalPanel.tsx`
- Import in `/src/App.tsx` and display in main layout
- Wire to existing audio processing backend

---

### Phase 3: Create Execution Layer for Proposals (Day 3-4)

**Goal**: Execute APL proposals directly without Action Authority

**New File**: `/src/services/aplExecutor.ts`

```typescript
interface APLExecutionOptions {
  useActionAuthority?: boolean;  // If true, route through AA
  confirmBeforeExecute?: boolean; // Show confirmation dialog
  auditId?: string;              // Optional AA audit ID
}

export class APLExecutor {
  async executeProposal(
    proposal: APLProposal,
    options: APLExecutionOptions = {}
  ): Promise<ExecutionResult> {
    if (options.useActionAuthority && options.auditId) {
      // Route through Action Authority
      return this.executeViaActionAuthority(proposal, options.auditId);
    } else {
      // Direct execution
      return this.executeDirectly(proposal, options);
    }
  }

  private async executeDirectly(
    proposal: APLProposal,
    options: APLExecutionOptions
  ): Promise<ExecutionResult> {
    // Show confirmation if requested
    if (options.confirmBeforeExecute) {
      const confirmed = await this.showConfirmationDialog(proposal);
      if (!confirmed) return { status: 'REJECTED', reason: 'User denied' };
    }

    // Execute AppleScript directly
    const applescript = this.proposalToAppleScript(proposal);
    return await this.executeAppleScript(applescript);
  }

  private async executeViaActionAuthority(
    proposal: APLProposal,
    auditId: string
  ): Promise<ExecutionResult> {
    // Convert to AA work order and dispatch
    const workOrder = createWorkOrderFromProposal(proposal, auditId);
    return await getAADispatcher().dispatch(workOrder);
  }

  private proposalToAppleScript(proposal: APLProposal): string {
    // Convert proposal parameters to AppleScript
    switch (proposal.action.type) {
      case 'LIMITING':
        return this.limitingToAppleScript(proposal.action.parameters);
      case 'NORMALIZATION':
        return this.gainToAppleScript(proposal.action.parameters);
      case 'DC_REMOVAL':
        return this.highpassToAppleScript(proposal.action.parameters);
      default:
        throw new Error(`Unknown action type: ${proposal.action.type}`);
    }
  }

  private limitingToAppleScript(params: Record<string, unknown>): string {
    const threshold = params.threshold as number;
    return `
      tell application "Logic Pro"
        set selectedTrack to (track 1 of project 1)
        create new audio channel strip
        insert limiter plugin
        set limiter threshold to ${threshold}
      end tell
    `;
  }

  // ... similar methods for other action types
}
```

**Features**:
- ✅ Direct execution (AppleScript generation)
- ✅ Optional confirmation dialog
- ✅ Optional AA routing (if available)
- ✅ Returns execution result
- ✅ Tracks execution history

---

### Phase 4: Create APL-AA Bridge (Optional) (Day 4-5)

**Location**: `/action-authority/src/action-authority/integration/apl-bridge.ts`

This lives IN Action Authority, not in APL. AA optionally imports APL.

```typescript
// NEW FILE: apl-bridge.ts (lives in action-authority, not apl)
import { APLProposal } from '../../../src/echo-sound-lab/apl';
import { createWorkOrder } from './execution';

/**
 * Optional bridge: Converts APL proposals to AA work orders.
 * This lives in Action Authority because AA is the consumer.
 * APL has NO dependency on this code.
 */
export function proposalToWorkOrder(
  proposal: APLProposal,
  auditId: string,
  contextId: string,
  sourceHash: string
): AAWorkOrder {
  return createWorkOrder({
    auditId,
    actionType: `APL_${proposal.action.type}`,
    description: proposal.action.description,
    parameters: proposal.action.parameters,
    domain: 'LOGIC_PRO',
    bridgeType: 'APPLESCRIPT',
    riskLevel: 'LOW', // APL proposals are always LOW risk
    evidence: {
      source: 'APL',
      metric: proposal.evidence.metric,
      currentValue: proposal.evidence.currentValue,
      targetValue: proposal.evidence.targetValue,
      rationale: proposal.evidence.rationale
    },
    metadata: {
      proposalId: proposal.proposalId,
      confidence: proposal.confidence,
      signalIntelligence: proposal.signalIntelligence
    }
  });
}
```

**Key Point**: This bridge lives in AA, not APL. AA imports APL, not vice versa.

---

### Phase 5: Testing & Integration (Day 5-6)

**Test Files to Create**:

1. **`apl-execution.test.ts`** - Test direct execution
   - Verify AppleScript generation
   - Verify confirmation dialog flow
   - Verify execution result tracking

2. **`apl-proposal-panel.test.tsx`** - Test UI component
   - Render proposals correctly
   - Handle apply/defer actions
   - Display evidence and confidence

3. **`apl-aa-bridge.test.ts`** - Test optional bridge
   - Convert proposals to work orders
   - Verify audit binding
   - Verify risk level assignment

4. **`apl-full-flow.integration.test.ts`** - End-to-end
   - Analyze audio → detect anomaly → generate proposal → display → execute (direct)
   - Analyze audio → detect anomaly → generate proposal → display → execute (via AA)
   - Verify both paths work

---

## API Changes Summary

### APL Exports (Before)
```typescript
// Before: Coupled to AA
export { APLAnalyzer, getAPLAnalyzer };
export { APLProposalEngine };  // Has proposalToWorkOrder() method
export { APLSignalIntelligence, APLProposal };
```

### APL Exports (After)
```typescript
// After: Independent
export { APLAnalyzer, getAPLAnalyzer };
export { APLProposalEngine };  // NO AA imports, NO proposalToWorkOrder()
export { APLSignalIntelligence, APLProposal };
// APL is complete and self-contained
```

### New Exports (APL Executor)
```typescript
export { APLExecutor, createAPLExecutor };
export { type APLExecutionOptions, type ExecutionResult };
```

### Action Authority Bridge (NEW)
```typescript
// In AA, not in APL
import { APLProposal } from 'echo-sound-lab/apl';

export function proposalToWorkOrder(
  proposal: APLProposal,
  auditId: string,
  ...
): AAWorkOrder
```

---

## User Experience Changes

### Before (Broken)
1. User analyzes track
2. APL detects clipping anomaly
3. System suggests LIMITING proposal
4. **Problem**: Proposal exists but can't be shown/applied (AA not available)
5. User manually adds Limiter in Logic Pro

### After (Fixed)
**Option A: Standalone Echo Sound Lab**
1. User analyzes track
2. APL detects clipping anomaly
3. **ProposalPanel shows**: "Add Limiter (-0.1 dBFS)" with evidence
4. User clicks "Apply"
5. Confirmation dialog appears
6. User confirms
7. **Limiter applied directly** to Logic Pro
8. Result logged to Echo's analysis history

**Option B: Echo Sound Lab + Action Authority**
1. User analyzes track
2. APL detects clipping anomaly
3. **ProposalPanel shows**: "Add Limiter (-0.1 dBFS)" with evidence
4. User clicks "Apply via Authority"
5. **Proposal routes to Action Authority FSM**
6. User holds spacebar (400ms mechanical gate)
7. User presses Enter (confirmation)
8. Action Authority dispatcher executes
9. Limiter applied to Logic Pro
10. **Forensic entry sealed** in AA audit log

---

## Beta Ship Readiness Checklist

### Must Have (Blocking)
- [ ] Remove all AA imports from APL code
- [ ] APL works standalone without AA installed
- [ ] ProposalPanel component displays proposals
- [ ] Direct execution works (AppleScript generation + execution)
- [ ] Confirmation dialog prevents accidental execution
- [ ] Test coverage: >90% for APL module

### Should Have (High Priority)
- [ ] Execution history tracked (what was applied when)
- [ ] Proposal undo capability (optional, nice to have)
- [ ] Analytics: Track which proposals users accept/defer
- [ ] UI polish: Proposal cards match design system

### Nice to Have (Post-Beta)
- [ ] APL-AA bridge fully tested in both apps
- [ ] Preference: "Default to AA gate" vs "Direct execution"
- [ ] Advanced: Proposal batching (apply multiple at once)
- [ ] Advanced: Custom rules engine (user-defined proposals)

---

## Risk Assessment

### Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Breaking AA integration | HIGH | Keep APL-AA bridge code in AA, not APL. Backward compat layer. |
| Accidental audio modification | MEDIUM | Confirmation dialog + undo capability |
| AppleScript errors | MEDIUM | Error handling, rollback, user notification |
| User confusion (two execution paths) | LOW | Clear UI labeling, documentation |
| Performance (continuous analysis) | LOW | Existing perf is good, no changes needed |

---

## Implementation Timeline (5-7 Days)

| Phase | Days | Deliverable |
|-------|------|-------------|
| **Phase 1** | 1-2 | APL decoupled, no AA imports |
| **Phase 2** | 2-3 | ProposalPanel component |
| **Phase 3** | 3-4 | APLExecutor (direct execution) |
| **Phase 4** | 4-5 | APL-AA bridge (optional) |
| **Phase 5** | 5-6 | Full test coverage |
| **Buffer** | 6-7 | Integration testing, fixes |

**Parallel work**: User documentation, design review

---

## Files Affected

### Files to Modify
1. `/src/echo-sound-lab/apl/proposal-engine.ts` (remove AA imports)
2. `/src/App.tsx` (add ProposalPanel)
3. `/src/types.ts` (add execution result types)

### Files to Create
1. `/src/components/ProposalPanel.tsx` (UI)
2. `/src/services/aplExecutor.ts` (execution)
3. `/action-authority/src/action-authority/integration/apl-bridge.ts` (bridge)
4. Test files (4 new test suites)

### Files to NOT Touch
- `/action-authority/src/action-authority/fsm.ts` ✅ Locked
- `/action-authority/src/action-authority/audit/forensic-log.ts` ✅ Locked
- `/src/echo-sound-lab/apl/analyzer.ts` ✅ No changes needed
- `/src/echo-sound-lab/apl/signal-intelligence.ts` ✅ No changes needed

---

## Success Criteria

✅ **APL is independent**: No imports from Action Authority
✅ **APL is complete**: Generates, displays, and executes proposals standalone
✅ **Integration optional**: AA can consume APL if present, otherwise ignored
✅ **User visible**: Proposals show in ProposalPanel with "Apply" button
✅ **Works in both contexts**: Echo Sound Lab alone OR Echo + AA
✅ **Beta ready**: All tests pass, documentation complete
✅ **Backward compatible**: AA integration still works for existing users

---

## Gemini Review Points

Please discuss:

1. **Architecture**: Is the decoupling approach sound? Better alternatives?
2. **Timeline**: Can we complete in 5-7 days before beta?
3. **Execution Path**: Direct execution + optional AA gate model okay?
4. **UI/UX**: ProposalPanel design meets user expectations?
5. **Testing**: Coverage goals (>90%) realistic?
6. **Risks**: Any architectural risks we're missing?
7. **Future**: Post-beta features worth planning now?

---

## Next Steps (After Gemini Approval)

1. ✅ Approve white paper
2. → Begin Phase 1 refactoring
3. → Complete decoupling
4. → Add UI components
5. → Full testing
6. → Ship beta with APL standalone + optional AA integration

---

**Document Status**: DRAFT - Awaiting Gemini Review
**Ship Target**: Beta v1.0 (next week)
**Maintainer**: Echo Sound Lab Technical Team

