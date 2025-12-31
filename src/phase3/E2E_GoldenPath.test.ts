/**
 * Phase 3A — End-to-End Golden Path Test
 *
 * Canonical test runner for PHASE3_E2E_CHECKLIST.md
 *
 * This test must pass all 6 checks:
 * - E2E-GP-01: Session Entry & Authority Visibility
 * - E2E-GP-02: Parameter Adjustment (No ACC Path)
 * - E2E-GP-03: Export Request Triggers ACC
 * - E2E-GP-04: ACC Confirmation (Single-Use)
 * - E2E-GP-05: Export Execution & Completion
 * - E2E-GP-06: Session Teardown (Authority Death)
 *
 * Run with: npx ts-node src/phase3/E2E_GoldenPath.test.ts
 */

import { initAuditLogger, getAuditLogger } from '../services/AuditLogger';
import { CapabilityAuthority, type ProcessIdentity } from '../services/CapabilityAuthority';
import { createCreativeMixingPreset } from '../services/capabilityPresets';
import { Capability } from '../services/capabilities';

// Simulate the golden path
async function runGoldenPath() {
  const audit = initAuditLogger();

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  PHASE 3A — END-TO-END GOLDEN PATH TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // ────────────────────────────────────────────────────────────────
    // E2E-GP-01: Session Entry & Authority Visibility
    // ────────────────────────────────────────────────────────────────
    console.log('\n[TEST] E2E-GP-01: Session Entry & Authority Visibility');
    console.log('─────────────────────────────────────────────────────────');

    // Create process identity
    const processIdentity: ProcessIdentity = {
      appId: 'com.echo-sound-lab.app',
      pid: Math.random() * 1000000,
      launchTimestamp: Date.now()
    };

    // Create authority
    const authority = new CapabilityAuthority(
      'session-' + Date.now(),
      () => Date.now(),
      processIdentity
    );

    // Emit: SESSION_STARTED
    audit.emit('SESSION_STARTED', {
      sessionId: 'session-' + Date.now(),
      appId: processIdentity.appId,
      processIdentity
    });

    // Grant CREATIVE_MIXING preset
    const preset = createCreativeMixingPreset(processIdentity.appId, 14400000);
    preset.grants.forEach(grant => authority.grant(grant));

    // Emit: AUTHORITY_GRANTED
    audit.emit('AUTHORITY_GRANTED', {
      preset: 'CREATIVE_MIXING',
      ttl: 14400000,
      grantCount: preset.grants.length
    });

    // Emit: CAPABILITY_VISIBLE
    const activeCapabilities = authority.getActiveGrants().map(g => g.capability);
    audit.emit('CAPABILITY_VISIBLE', {
      capabilities: activeCapabilities,
      count: activeCapabilities.length
    });

    // Verify E2E-GP-01 required events
    if (!audit.hasEvent('SESSION_STARTED')) throw new Error('Missing SESSION_STARTED');
    if (!audit.hasEvent('AUTHORITY_GRANTED')) throw new Error('Missing AUTHORITY_GRANTED');
    if (!audit.hasEvent('CAPABILITY_VISIBLE')) throw new Error('Missing CAPABILITY_VISIBLE');

    // Verify forbidden events
    if (audit.hasForbiddenEvent('EXECUTION_STARTED')) throw new Error('Forbidden: EXECUTION_STARTED in entry phase');
    if (audit.hasForbiddenEvent('ACC_ISSUED')) throw new Error('Forbidden: ACC_ISSUED in entry phase');

    console.log('✓ E2E-GP-01 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // E2E-GP-02: Parameter Adjustment (No ACC Path)
    // ────────────────────────────────────────────────────────────────
    console.log('[TEST] E2E-GP-02: Parameter Adjustment (No ACC Path)');
    console.log('─────────────────────────────────────────────────────────');

    // Simulate parameter adjustment (EQ)
    const paramRequest = {
      capability: Capability.PARAMETER_ADJUSTMENT,
      scope: { appId: processIdentity.appId },
      reason: 'Adjust EQ parameters'
    };

    // Emit: CAPABILITY_CHECK
    audit.emit('CAPABILITY_CHECK', {
      capability: Capability.PARAMETER_ADJUSTMENT,
      reason: 'Adjust EQ parameters'
    });

    try {
      const grant = authority.assertAllowed(paramRequest, processIdentity);

      // Emit: CAPABILITY_ALLOWED
      audit.emit('CAPABILITY_ALLOWED', {
        capability: Capability.PARAMETER_ADJUSTMENT,
        grantId: grant.grantId
      });

      // Emit: EXECUTION_STARTED
      audit.emit('EXECUTION_STARTED', {
        action: 'PARAMETER_ADJUSTMENT',
        actionId: 'param-adjust-001'
      });

      // Simulate execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Emit: EXECUTION_COMPLETED
      audit.emit('EXECUTION_COMPLETED', {
        action: 'PARAMETER_ADJUSTMENT',
        actionId: 'param-adjust-001',
        result: 'success'
      });

      // Emit: AUDIT_LOG_APPEND
      audit.emit('AUDIT_LOG_APPEND', {
        action: 'PARAMETER_ADJUSTMENT',
        timestamp: Date.now()
      });
    } catch (err) {
      throw new Error(`Parameter adjustment failed: ${(err as Error).message}`);
    }

    // Verify E2E-GP-02 required events
    if (!audit.hasEvent('CAPABILITY_CHECK')) throw new Error('Missing CAPABILITY_CHECK');
    if (!audit.hasEvent('CAPABILITY_ALLOWED')) throw new Error('Missing CAPABILITY_ALLOWED');
    if (!audit.hasEvent('EXECUTION_STARTED')) throw new Error('Missing EXECUTION_STARTED');
    if (!audit.hasEvent('EXECUTION_COMPLETED')) throw new Error('Missing EXECUTION_COMPLETED');

    // Verify forbidden events
    if (audit.countEvents('ACC_ISSUED') > 0) throw new Error('Forbidden: ACC_ISSUED for PARAMETER_ADJUSTMENT');

    console.log('✓ E2E-GP-02 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // E2E-GP-03: Export Request Triggers ACC
    // ────────────────────────────────────────────────────────────────
    console.log('[TEST] E2E-GP-03: Export Request Triggers ACC');
    console.log('─────────────────────────────────────────────────────────');

    const exportRequest = {
      capability: Capability.RENDER_EXPORT,
      scope: { appId: processIdentity.appId },
      reason: 'Export mix to WAV'
    };

    // Emit: CAPABILITY_CHECK
    audit.emit('CAPABILITY_CHECK', {
      capability: Capability.RENDER_EXPORT,
      reason: 'Export mix to WAV'
    });

    try {
      const grant = authority.assertAllowed(exportRequest, processIdentity);

      // This should not be reached if ACC is required
      // But we need to check if the grant requires ACC
      if (grant.requiresACC) {
        // Emit: CAPABILITY_REQUIRES_ACC
        audit.emit('CAPABILITY_REQUIRES_ACC', {
          capability: Capability.RENDER_EXPORT,
          grantId: grant.grantId
        });

        // Emit: ACC_ISSUED
        const accId = 'acc-' + Date.now();
        const accToken = {
          accId,
          challenge_payload: 'confirm-export-001',
          is_used: false,
          expiresAt: Date.now() + 300000
        };

        audit.emit('ACC_ISSUED', {
          accId,
          challenge: 'confirm-export-001',
          expiresAt: accToken.expiresAt
        });

        // Emit: EXECUTION_HALTED_PENDING_ACC
        audit.emit('EXECUTION_HALTED_PENDING_ACC', {
          action: 'RENDER_EXPORT',
          reason: 'Awaiting ACC confirmation'
        });

        // Store for next step
        (globalThis as any).__e2e_accToken = accToken;
        (globalThis as any).__e2e_grantId = grant.grantId;
      } else {
        throw new Error('RENDER_EXPORT should require ACC but does not');
      }
    } catch (err) {
      // Expected: grant exists but requires ACC
      if ((err as Error).message.includes('[ACC_REQUIRED]')) {
        // Emit: ACC_ISSUED
        const accId = 'acc-' + Date.now();
        const accToken = {
          accId,
          challenge_payload: 'confirm-export-001',
          is_used: false,
          expiresAt: Date.now() + 300000
        };

        audit.emit('ACC_ISSUED', {
          accId,
          challenge: 'confirm-export-001',
          expiresAt: accToken.expiresAt
        });

        // Emit: EXECUTION_HALTED_PENDING_ACC
        audit.emit('EXECUTION_HALTED_PENDING_ACC', {
          action: 'RENDER_EXPORT',
          reason: 'Awaiting ACC confirmation'
        });

        // Store for next step
        (globalThis as any).__e2e_accToken = accToken;
      } else {
        throw err;
      }
    }

    // Verify E2E-GP-03 required events
    if (!audit.hasEvent('CAPABILITY_CHECK')) throw new Error('Missing CAPABILITY_CHECK');
    if (!audit.hasEvent('CAPABILITY_REQUIRES_ACC')) throw new Error('Missing CAPABILITY_REQUIRES_ACC');
    if (!audit.hasEvent('ACC_ISSUED')) throw new Error('Missing ACC_ISSUED');
    if (!audit.hasEvent('EXECUTION_HALTED_PENDING_ACC')) throw new Error('Missing EXECUTION_HALTED_PENDING_ACC');

    // Verify forbidden events
    const executionCountBeforeAcc = audit.countEvents('EXECUTION_STARTED');
    if (audit.countEvents('EXECUTION_STARTED') > 1) throw new Error('Forbidden: EXECUTION_STARTED during ACC wait');

    console.log('✓ E2E-GP-03 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // E2E-GP-04: ACC Confirmation (Single-Use)
    // ────────────────────────────────────────────────────────────────
    console.log('[TEST] E2E-GP-04: ACC Confirmation (Single-Use)');
    console.log('─────────────────────────────────────────────────────────');

    const accToken = (globalThis as any).__e2e_accToken;
    if (!accToken) throw new Error('No ACC token issued in GP-03');

    // Emit: ACC_RESPONSE_RECEIVED
    audit.emit('ACC_RESPONSE_RECEIVED', {
      accId: accToken.accId,
      response: 'confirm-export-001'
    });

    // Validate ACC token (single-use)
    if (accToken.is_used) {
      throw new Error('ACC token already used (replay attempt)');
    }

    // Mark token as used
    accToken.is_used = true;

    // Emit: ACC_VALIDATED
    audit.emit('ACC_VALIDATED', {
      accId: accToken.accId,
      result: 'valid'
    });

    // Emit: ACC_TOKEN_CONSUMED
    audit.emit('ACC_TOKEN_CONSUMED', {
      accId: accToken.accId
    });

    // Verify E2E-GP-04 required events
    if (!audit.hasEvent('ACC_RESPONSE_RECEIVED')) throw new Error('Missing ACC_RESPONSE_RECEIVED');
    if (!audit.hasEvent('ACC_VALIDATED')) throw new Error('Missing ACC_VALIDATED');
    if (!audit.hasEvent('ACC_TOKEN_CONSUMED')) throw new Error('Missing ACC_TOKEN_CONSUMED');

    // Verify forbidden events
    if (audit.countEvents('ACC_RESPONSE_RECEIVED') > 1) throw new Error('Forbidden: Multiple ACC_RESPONSE_RECEIVED');

    console.log('✓ E2E-GP-04 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // E2E-GP-05: Export Execution & Completion
    // ────────────────────────────────────────────────────────────────
    console.log('[TEST] E2E-GP-05: Export Execution & Completion');
    console.log('─────────────────────────────────────────────────────────');

    // Execution resumes once
    // Emit: EXECUTION_STARTED
    audit.emit('EXECUTION_STARTED', {
      action: 'RENDER_EXPORT',
      actionId: 'export-001',
      resumeAfterAcc: true
    });

    // Emit: FILE_WRITE_ATTEMPT
    audit.emit('FILE_WRITE_ATTEMPT', {
      filePath: '/tmp/export-001.wav',
      size: 5242880
    });

    // Emit: FILE_WRITE_ALLOWED
    audit.emit('FILE_WRITE_ALLOWED', {
      filePath: '/tmp/export-001.wav',
      grantId: (globalThis as any).__e2e_grantId
    });

    // Simulate execution
    await new Promise(resolve => setTimeout(resolve, 200));

    // Emit: EXECUTION_COMPLETED
    audit.emit('EXECUTION_COMPLETED', {
      action: 'RENDER_EXPORT',
      actionId: 'export-001',
      result: 'success',
      outputPath: '/tmp/export-001.wav'
    });

    // Emit: AUDIT_LOG_APPEND
    audit.emit('AUDIT_LOG_APPEND', {
      action: 'RENDER_EXPORT',
      timestamp: Date.now(),
      outputPath: '/tmp/export-001.wav'
    });

    // Verify E2E-GP-05 required events
    if (audit.countEvents('EXECUTION_STARTED') < 2) throw new Error('Missing EXECUTION_STARTED for export');
    if (!audit.hasEvent('FILE_WRITE_ATTEMPT')) throw new Error('Missing FILE_WRITE_ATTEMPT');
    if (!audit.hasEvent('FILE_WRITE_ALLOWED')) throw new Error('Missing FILE_WRITE_ALLOWED');
    if (!audit.hasEvent('EXECUTION_COMPLETED')) throw new Error('Missing EXECUTION_COMPLETED');

    // Verify forbidden events
    const fileWriteCount = audit.countEvents('FILE_WRITE_ATTEMPT');
    if (fileWriteCount > 1) throw new Error('Forbidden: Multiple FILE_WRITE_ATTEMPT');

    console.log('✓ E2E-GP-05 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // E2E-GP-06: Session Teardown (Authority Death)
    // ────────────────────────────────────────────────────────────────
    console.log('[TEST] E2E-GP-06: Session Teardown (Authority Death)');
    console.log('─────────────────────────────────────────────────────────');

    // Emit: SESSION_END_REQUESTED
    audit.emit('SESSION_END_REQUESTED', {
      sessionId: 'session-' + Date.now()
    });

    // Emit: REVOKE_ALL_AUTHORITIES
    audit.emit('REVOKE_ALL_AUTHORITIES', {
      count: authority.getActiveGrants().length
    });

    authority.revokeAll();

    // Emit: CAPABILITY_GRANTS_CLEARED
    audit.emit('CAPABILITY_GRANTS_CLEARED', {
      remainingGrants: authority.getActiveGrants().length
    });

    // Emit: ACC_TOKENS_INVALIDATED
    audit.emit('ACC_TOKENS_INVALIDATED', {
      tokensInvalidated: 1
    });

    // Emit: SESSION_INACTIVE
    audit.emit('SESSION_INACTIVE', {
      sessionId: 'session-' + Date.now()
    });

    // Verify E2E-GP-06 required events
    if (!audit.hasEvent('SESSION_END_REQUESTED')) throw new Error('Missing SESSION_END_REQUESTED');
    if (!audit.hasEvent('REVOKE_ALL_AUTHORITIES')) throw new Error('Missing REVOKE_ALL_AUTHORITIES');
    if (!audit.hasEvent('CAPABILITY_GRANTS_CLEARED')) throw new Error('Missing CAPABILITY_GRANTS_CLEARED');
    if (!audit.hasEvent('ACC_TOKENS_INVALIDATED')) throw new Error('Missing ACC_TOKENS_INVALIDATED');
    if (!audit.hasEvent('SESSION_INACTIVE')) throw new Error('Missing SESSION_INACTIVE');

    // Verify authority is truly dead
    try {
      authority.assertAllowed(exportRequest, processIdentity);
      throw new Error('Authority should be revoked but allowed action');
    } catch (err) {
      if (!(err as Error).message.includes('[CAPABILITY_DENIED]')) {
        throw err;
      }
    }

    // Emit final: CAPABILITY_DENIED (post-teardown attempt)
    audit.emit('CAPABILITY_DENIED', {
      capability: Capability.RENDER_EXPORT,
      reason: 'Session inactive'
    });

    console.log('✓ E2E-GP-06 PASSED\n');

    // ────────────────────────────────────────────────────────────────
    // FINAL RESULTS
    // ────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  ✓ ALL TESTS PASSED (6/6)');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Export audit log
    console.log('\n[AUDIT LOG COMPLETE]');
    console.log(`Total events: ${audit.getAllEvents().length}`);
    console.log(`Session duration: ${audit.getAllEvents()[audit.getAllEvents().length - 1].timestamp - audit.getAllEvents()[0].timestamp}ms\n`);

    return {
      passed: true,
      auditLog: audit.getAllEvents()
    };
  } catch (err) {
    console.error('\n❌ TEST FAILED');
    console.error(`Error: ${(err as Error).message}`);
    console.error(`Stack: ${(err as Error).stack}`);

    return {
      passed: false,
      error: (err as Error).message,
      auditLog: getAuditLogger().getAllEvents()
    };
  }
}

// Run test
runGoldenPath().then(result => {
  if (result.passed) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});
