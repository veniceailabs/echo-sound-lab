/**
 * Phase 2 Integration Test Runner — Standalone
 *
 * No framework dependencies. Uses Node assert.
 * Executable, deterministic, binary pass/fail.
 * Can be run via: `npx ts-node phase2_integration_runner.ts`
 */

import assert from 'assert';
import { CapabilityAuthority } from '../CapabilityAuthority.js';
import { Capability, CapabilityRequest } from '../capabilities.js';
import ESLCapabilityAdapter from '../eslCapabilityAdapter.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

class TestResult {
  passed: number = 0;
  failed: number = 0;
  errors: string[] = [];

  pass(): void {
    this.passed++;
  }

  fail(name: string, error: string): void {
    this.failed++;
    this.errors.push(`❌ ${name}: ${error}`);
  }

  report(): void {
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 2 — INTEGRATION TEST RESULTS');
    console.log('='.repeat(80) + '\n');

    console.log(`✓ Passed: ${this.passed}`);
    console.log(`✗ Failed: ${this.failed}`);
    console.log(`Total:  ${this.passed + this.failed}\n`);

    if (this.errors.length > 0) {
      console.log('FAILURES:\n');
      this.errors.forEach(e => console.log(`  ${e}`));
    }

    if (this.failed === 0) {
      console.log('🎯 ALL TESTS PASSED\n');
    } else {
      console.log(`\n⚠️  ${this.failed} TEST(S) FAILED\n`);
    }
  }
}

class FakeTime {
  private now: number = 1000000000000;

  constructor(initialMs: number = 1000000000000) {
    this.now = initialMs;
  }

  getCurrentTime(): number {
    return this.now;
  }

  advance(ms: number): void {
    this.now += ms;
  }

  reset(ms?: number): void {
    this.now = ms || 1000000000000;
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests(): Promise<TestResult> {
  const result = new TestResult();
  const TEST_APP_ID = 'com.test.app';
  const TEST_SESSION_ID = 'session-test-001';

  // ========================================================================
  // TEST 1: Default Deny (No Capability)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    // Do not grant any capabilities

    const request: CapabilityRequest = {
      capability: Capability.FILE_READ,
      scope: { appId: TEST_APP_ID },
      reason: 'Open file'
    };

    let shouldHaveFailed = false;
    try {
      authority.assertAllowed(request);
      shouldHaveFailed = true;
    } catch (e) {
      // Expected
      const error = e as Error;
      assert(error.message.includes('CAPABILITY_DENIED'));
    }

    assert(!shouldHaveFailed, 'Should have thrown CAPABILITY_DENIED');
    result.pass();
    console.log('✓ TEST-1: Default deny enforced');
  } catch (e) {
    result.fail('TEST-1', (e as Error).message);
  }

  // ========================================================================
  // TEST 2: Autosave Authority Leak (S4 Pause)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());
    const adapter = new ESLCapabilityAdapter(authority, TEST_APP_ID);

    // Grant FILE_WRITE
    const expiryTime = fakeTime.getCurrentTime() + 3600000;
    authority.grant({
      capability: Capability.FILE_WRITE,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    // Verify autosave is allowed
    let canAutosave = await adapter.canAutosave({
      fileName: 'test.mix',
      version: '1',
      savedAt: fakeTime.getCurrentTime(),
      config: {} as any,
      isAbComparing: false,
      playheadSeconds: 0,
      appliedSuggestionIds: [],
      echoReportSummary: null,
      activeMode: 'SINGLE' as any,
      revisionLog: [],
      activeWamPluginId: null
    } as any);

    assert(canAutosave === true, 'Autosave should be allowed initially');

    // Revoke all capabilities (S4 transition)
    authority.revokeAll();

    // Attempt autosave again
    canAutosave = await adapter.canAutosave({
      fileName: 'test.mix',
      version: '1',
      savedAt: fakeTime.getCurrentTime(),
      config: {} as any,
      isAbComparing: false,
      playheadSeconds: 0,
      appliedSuggestionIds: [],
      echoReportSummary: null,
      activeMode: 'SINGLE' as any,
      revisionLog: [],
      activeWamPluginId: null
    } as any);

    assert(canAutosave === false, 'Autosave should be denied after revocation');
    result.pass();
    console.log('✓ TEST-2: Autosave denied during S4');
  } catch (e) {
    result.fail('TEST-2', (e as Error).message);
  }

  // ========================================================================
  // TEST 3: Side-Effect Escalation (Rule C3)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());
    const adapter = new ESLCapabilityAdapter(authority, TEST_APP_ID);

    // Detect side-effect
    const sideEffectCap = adapter.detectSideEffect('autosave:enabled', true);

    assert(sideEffectCap === Capability.FILE_WRITE, 'Side-effect should escalate to FILE_WRITE');

    result.pass();
    console.log('✓ TEST-3: Side-effect escalation detected');
  } catch (e) {
    result.fail('TEST-3', (e as Error).message);
  }

  // ========================================================================
  // TEST 4: Cross-App Scope Denied
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    // Grant for TEST_APP_ID
    const expiryTime = fakeTime.getCurrentTime() + 3600000;
    authority.grant({
      capability: Capability.FILE_READ,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    // Attempt different app
    const request: CapabilityRequest = {
      capability: Capability.FILE_READ,
      scope: { appId: 'com.apple.logic10' },
      reason: 'Open file from Logic'
    };

    let shouldHaveFailed = false;
    try {
      authority.assertAllowed(request);
      shouldHaveFailed = true;
    } catch (e) {
      // Expected
      const error = e as Error;
      assert(error.message.includes('CAPABILITY_DENIED'));
    }

    assert(!shouldHaveFailed, 'Should have denied cross-app access');
    result.pass();
    console.log('✓ TEST-4: Cross-app scope denied');
  } catch (e) {
    result.fail('TEST-4', (e as Error).message);
  }

  // ========================================================================
  // TEST 5: Capability TTL Expiry
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    // Grant with 100ms TTL
    const expiryTime = fakeTime.getCurrentTime() + 100;
    authority.grant({
      capability: Capability.PARAMETER_ADJUSTMENT,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    // Immediately: should work
    const request1: CapabilityRequest = {
      capability: Capability.PARAMETER_ADJUSTMENT,
      scope: { appId: TEST_APP_ID },
      reason: 'Adjust parameter'
    };

    const grant1 = authority.assertAllowed(request1);
    assert(grant1 !== null, 'Should allow before expiry');

    // Advance past expiry
    fakeTime.advance(101);

    // Now: should fail
    let shouldHaveFailed = false;
    try {
      authority.assertAllowed(request1);
      shouldHaveFailed = true;
    } catch (e) {
      // Expected
    }

    assert(!shouldHaveFailed, 'Should have denied after TTL expiry');
    result.pass();
    console.log('✓ TEST-5: TTL expiry enforced');
  } catch (e) {
    result.fail('TEST-5', (e as Error).message);
  }

  // ========================================================================
  // TEST 6: Session End Revocation
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    const expiryTime = fakeTime.getCurrentTime() + 3600000;
    authority.grant({
      capability: Capability.PARAMETER_ADJUSTMENT,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    // Verify grant exists
    const request: CapabilityRequest = {
      capability: Capability.PARAMETER_ADJUSTMENT,
      scope: { appId: TEST_APP_ID },
      reason: 'Adjust'
    };

    let grant = authority.assertAllowed(request);
    assert(grant !== null, 'Should have grant');

    // Revoke all
    authority.revokeAll();

    // Attempt same action
    let shouldHaveFailed = false;
    try {
      authority.assertAllowed(request);
      shouldHaveFailed = true;
    } catch (e) {
      // Expected
    }

    assert(!shouldHaveFailed, 'Should have denied after revocation');
    result.pass();
    console.log('✓ TEST-6: Revocation clears all authority');
  } catch (e) {
    result.fail('TEST-6', (e as Error).message);
  }

  // ========================================================================
  // TEST 7: Non-Reversible Action Escalation
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());
    const adapter = new ESLCapabilityAdapter(authority, TEST_APP_ID);

    const action = {
      id: 'action-1',
      type: 'bounce',
      reversibility: 'Non-Reversible' as const,
      parameters: { format: 'WAV' },
      description: 'Bounce to WAV'
    };

    const request = await adapter.guardProcessingAction(action);

    assert(
      request.capability === Capability.RENDER_EXPORT,
      'Non-reversible should escalate to RENDER_EXPORT'
    );

    result.pass();
    console.log('✓ TEST-7: Non-reversible action escalation');
  } catch (e) {
    result.fail('TEST-7', (e as Error).message);
  }

  // ========================================================================
  // TEST 8: Executable Output Blocked (Rule C2)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());
    const adapter = new ESLCapabilityAdapter(authority, TEST_APP_ID);

    // Attempt executable write
    let shouldHaveFailed = false;
    try {
      await adapter['guardWriteFile']('/tmp/malicious.sh', 'application/x-sh');
      shouldHaveFailed = true;
    } catch (e) {
      const error = e as Error;
      assert(error.message.includes('NON_EXECUTABLE_OUTPUT_CONSTRAINT'));
    }

    assert(!shouldHaveFailed, 'Should have blocked executable output');
    result.pass();
    console.log('✓ TEST-8: Executable output blocked (Rule C2)');
  } catch (e) {
    result.fail('TEST-8', (e as Error).message);
  }

  // ========================================================================
  // TEST 9: isAllowed (Non-throwing check)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    const request: CapabilityRequest = {
      capability: Capability.FILE_READ,
      scope: { appId: TEST_APP_ID },
      reason: 'Read file'
    };

    // Without capability
    let allowed = authority.isAllowed(request);
    assert(allowed === false, 'isAllowed should return false without capability');

    // With capability
    const expiryTime = fakeTime.getCurrentTime() + 3600000;
    authority.grant({
      capability: Capability.FILE_READ,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    allowed = authority.isAllowed(request);
    assert(allowed === true, 'isAllowed should return true with capability');

    result.pass();
    console.log('✓ TEST-9: isAllowed non-throwing check');
  } catch (e) {
    result.fail('TEST-9', (e as Error).message);
  }

  // ========================================================================
  // TEST 10: hasCapability (Diagnostic check)
  // ========================================================================
  try {
    const fakeTime = new FakeTime();
    const authority = new CapabilityAuthority(TEST_SESSION_ID, () => fakeTime.getCurrentTime());

    // No capabilities
    let has = authority.hasCapability(Capability.FILE_WRITE);
    assert(has === false, 'Should not have FILE_WRITE');

    // Add capability
    const expiryTime = fakeTime.getCurrentTime() + 3600000;
    authority.grant({
      capability: Capability.FILE_WRITE,
      scope: { appId: TEST_APP_ID },
      expiresAt: expiryTime,
      requiresACC: false
    });

    has = authority.hasCapability(Capability.FILE_WRITE);
    assert(has === true, 'Should have FILE_WRITE');

    // Different capability still not granted
    has = authority.hasCapability(Capability.RENDER_EXPORT);
    assert(has === false, 'Should not have RENDER_EXPORT');

    result.pass();
    console.log('✓ TEST-10: hasCapability diagnostic check');
  } catch (e) {
    result.fail('TEST-10', (e as Error).message);
  }

  return result;
}

// ============================================================================
// RUN TESTS
// ============================================================================

(async () => {
  console.log('\n🚀 Starting Phase 2 Integration Tests...\n');
  const result = await runTests();
  result.report();
  process.exit(result.failed > 0 ? 1 : 0);
})().catch(e => {
  console.error('Test runner crashed:', e);
  process.exit(1);
});
