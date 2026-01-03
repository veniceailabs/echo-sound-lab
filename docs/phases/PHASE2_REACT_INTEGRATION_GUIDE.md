# Phase 2.2.4 — React Integration Guide

**Status:** IMPLEMENTATION IN PROGRESS
**Scope:** Wiring capability guards into React components (UI only, no logic changes)

---

## Core Principle

Wire authority, do not hide it.

Every action that requires a capability must:
1. Check the capability
2. Show the check result
3. Be blocked if denied
4. Show what was denied and why

**Never:**
- ❌ Hide a check and execute anyway
- ❌ Retry silently on denial
- ❌ Infer permission from UI state
- ❌ Auto-resume after dismissal
- ❌ Create convenience helpers that bypass guards

---

## Architecture Overview

```
User Interaction (onClick, onChange, etc.)
  ↓
useCapabilityCheck() or useGuardedAction()
  ↓
CapabilityAuthority.assertAllowed() / isAllowed()
  ↓
If allowed + no ACC:
  Execute action
Else if ACC required:
  Emit event → show CapabilityACCModal
  Wait for response → validate
  Re-check authority
Else if denied:
  Throw error + update UI
```

---

## Files Created (Phase 2.2.4)

**Hooks:**
- `src/hooks/useCapabilityCheck.ts` — Non-throwing capability checks
- `src/hooks/useGuardedAction.ts` — Manage guarded action flow
- `src/hooks/CapabilityProvider.tsx` — React context + provider
- `src/hooks/index.ts` — Export index

**Components:**
- `src/components/CapabilityACCModal.tsx` — ACC modal (calm, non-escalating)
- `src/components/CapabilityStatusDisplay.tsx` — Authority status (read-only)

---

## Integration Checklist

### Step 1: Wrap App with CapabilityProvider

**File:** `src/App.tsx`

```typescript
import { CapabilityProvider } from './hooks/CapabilityProvider';
import { CapabilityAuthority } from './services/CapabilityAuthority';
import { ProcessIdentity } from './services/CapabilityAuthority';

// Initialize authority
const processIdentity: ProcessIdentity = {
  appId: 'com.echo-sound-lab.app',
  pid: typeof window !== 'undefined' ? Math.random() * 1000000 : 0,
  launchTimestamp: Date.now()
};

const authority = new CapabilityAuthority(
  'session-' + Date.now(),
  () => Date.now(),
  processIdentity
);

// Grant initial capabilities (e.g., SYSTEM_NAVIGATION preset)
import { createCreativeMixingPreset } from './services/capabilityPresets';
const preset = createCreativeMixingPreset('com.echo-sound-lab.app', 14400000);
preset.grants.forEach(grant => authority.grant(grant));

// Render
function App() {
  return (
    <CapabilityProvider
      authority={authority}
      appId="com.echo-sound-lab.app"
      processIdentity={processIdentity}
    >
      <AppContent />
    </CapabilityProvider>
  );
}
```

---

### Step 2: Add Status Display at App Level

**File:** `src/App.tsx`

```typescript
import { CapabilityStatusDisplay } from './components/CapabilityStatusDisplay';

function App() {
  return (
    <CapabilityProvider {...props}>
      <div className="app-container">
        {/* Show authority status (read-only) */}
        <CapabilityStatusDisplay className="mb-4" />

        {/* Rest of app */}
        <AppContent />

        {/* ACC modal */}
        <CapabilityACCModal
          isOpen={showACCModal}
          token={accToken}
          reason={accReason}
          onConfirm={handleACCConfirm}
          onDismiss={handleACCDismiss}
        />
      </div>
    </CapabilityProvider>
  );
}
```

---

### Step 3: Use Hooks in Components

#### Pattern A: Conditional Rendering (useCapabilityCheck)

```typescript
import { useCapabilityCheck } from '../hooks/useCapabilityCheck';
import { Capability } from '../services/capabilities';

function ExportButton() {
  // Check if RENDER_EXPORT capability exists
  const canExport = useCapabilityCheck(
    Capability.RENDER_EXPORT,
    'Export to MP3'
  );

  // If not granted, don't render button at all
  if (!canExport) {
    return <div className="text-gray-400">Export not available</div>;
  }

  return <button onClick={handleExport}>Export</button>;
}
```

#### Pattern B: Guarded Action (useGuardedAction)

```typescript
import { useGuardedAction } from '../hooks/useGuardedAction';
import { Capability } from '../services/capabilities';

function ProcessButton() {
  const { execute, isLoading, error } = useGuardedAction(
    Capability.PARAMETER_ADJUSTMENT,
    'Apply EQ adjustment',
    async () => {
      // This runs only if capability check passes
      await audioPipeline.processAudio([eqAction]);
    },
    {
      onACCRequired: (request) => {
        // ACC is needed for this action
        // Emit event to show modal
        showACCModal(request);
      },
      onDenied: (error) => {
        // Capability denied
        showError(error.message);
      }
    }
  );

  return (
    <div>
      <button onClick={execute} disabled={isLoading}>
        {isLoading ? 'Processing...' : 'Apply EQ'}
      </button>
      {error && <div className="error">{error.message}</div>}
    </div>
  );
}
```

---

### Step 4: Wire Services to Guarded Hooks

**Example: Export Button with Guarded Service**

```typescript
import { useGuardedAction } from '../hooks/useGuardedAction';
import { guardedBatchProcessor } from '../services/guardedBatchProcessor';

function ExportPanel() {
  const { execute: executeExport, error } = useGuardedAction(
    Capability.RENDER_EXPORT,
    'Export mix to WAV',
    async () => {
      // Call the guarded service directly
      // The guard layer validates capability + side-effects + batch rules
      await guardedBatchProcessor.processBatchGuarded(
        [audioFile],
        config,
        'WAV'
      );
    }
  );

  return (
    <button onClick={executeExport}>
      Export WAV
    </button>
  );
}
```

---

## Non-Negotiable UI Rules

### 1. Silence Must Visibly Pause (No Spinners Implying Progress)

❌ **Wrong:**
```tsx
{isLoading && <Spinner />}  // Implies action will continue
```

✅ **Correct:**
```tsx
{isPaused && (
  <div className="bg-yellow-50 border-2 border-yellow-400 p-4">
    <p>Session paused. No action in progress.</p>
    <p className="text-sm">Confirm or dismiss to continue.</p>
  </div>
)}
```

### 2. ACC Prompts Must Be Calm, Non-Urgent, Dismissible

✅ **Correct (CapabilityACCModal):**
- No countdown timers
- No "hurry", "limited time", "soon"
- Dismissible without penalty
- Clear what happens on dismiss (action is halted, nothing resumes)

❌ **Wrong:**
```tsx
<Modal title="URGENT CONFIRMATION REQUIRED">
  <p>You have 30 seconds to confirm...</p>
</Modal>
```

### 3. "Denied" Must Be Final Unless User Re-Initiates

❌ **Wrong:**
```tsx
onClick={() => {
  try {
    executeGuarded();
  } catch (e) {
    // Retry automatically after 2s
    setTimeout(() => executeGuarded(), 2000);
  }
}}
```

✅ **Correct:**
```tsx
onClick={async () => {
  try {
    await executeGuarded();
  } catch (e) {
    setError(e.message);
    // User must click button again to retry
  }
}}
```

### 4. No Auto-Resume After Modal Close

❌ **Wrong:**
```tsx
onDismiss={() => {
  closeModal();
  // Don't do this:
  setTimeout(() => executeAction(), 500);
}}
```

✅ **Correct:**
```tsx
onDismiss={() => {
  closeModal();
  // Do nothing. Action is halted.
  // User must click button again if they want to retry.
}}
```

### 5. No Batching of Confirmations

❌ **Wrong:**
```tsx
async function exportAll() {
  // Get one ACC token
  const token = await getACCToken();

  // Use it for 10 files
  for (let file of files) {
    await exportFile(file, token);
  }
}
```

✅ **Correct:**
```tsx
async function exportAll() {
  for (let file of files) {
    // Each file gets its own ACC requirement
    const { execute } = useGuardedAction(...);
    await execute(); // May trigger ACC for this file
  }
}
```

---

## Example: Complete Export Flow

```typescript
import { useState } from 'react';
import { useGuardedAction } from '../hooks/useGuardedAction';
import { CapabilityACCModal } from '../components/CapabilityACCModal';
import { Capability } from '../services/capabilities';

function ExportPanel() {
  const [showACC, setShowACC] = useState(false);
  const [accToken, setAccToken] = useState(null);
  const [accReason, setAccReason] = useState('');
  const [isLoadingACC, setIsLoadingACC] = useState(false);

  const { execute: executeExport, isLoading, error } = useGuardedAction(
    Capability.RENDER_EXPORT,
    'Export mix to MP3',
    async () => {
      await batchProcessor.processBatchGuarded([file], config, 'MP3');
    },
    {
      onACCRequired: (request) => {
        // Request object from CapabilityACCBridge
        // This hook should trigger modal display in parent
        // For now, we emit event
        window.dispatchEvent(new CustomEvent('acc-required', { detail: request }));
      }
    }
  );

  const handleExport = async () => {
    try {
      await executeExport();
    } catch (err) {
      if (err.message.includes('ACC_REQUIRED')) {
        // ACC modal will be shown by parent
      }
      // Error is shown in component
    }
  };

  return (
    <div>
      <button onClick={handleExport} disabled={isLoading}>
        {isLoading ? 'Exporting...' : 'Export MP3'}
      </button>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded p-3 mt-2">
          <p className="text-sm text-red-900">{error.message}</p>
          <p className="text-xs text-red-700 mt-1">
            {error.message.includes('DENIED')
              ? 'This action is not permitted.'
              : 'An error occurred.'}
          </p>
        </div>
      )}
    </div>
  );
}
```

---

## Summary: What This Achieves

✅ **Every action is guarded** — No execution path avoids CapabilityAuthority
✅ **Authority is visible** — UI shows status, denials, and halt states
✅ **No silent failures** — Errors are surfaced immediately
✅ **No convenience backdoors** — All guards are explicit
✅ **Denial is final** — No auto-resume, no retry loops
✅ **ACC is calm** — No urgency, dismissible, non-escalating

---

## What Remains (Phase 2.2.5)

- [ ] Hook for handling modal state at app level
- [ ] Integration with existing AudioSessionContext
- [ ] Example components wired with guarded services
- [ ] Event-based communication between App and child components
- [ ] Ghost breakage pass on React wiring (event flooding, modal fatigue, etc.)

---

Generated with Claude Code
Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
