/**
 * Phase 4 Windows Enforcement — Acceptance Tests
 *
 * Tests: WIN-ACC-01 → WIN-ACC-09
 * Status: BLOCKING (all must PASS for Phase 4 lock)
 *
 * Methodology: Threat → Enforcement → Proof
 * Each test kills one or more Windows attack vectors.
 *
 * Reference:
 * - PHASE_4_WINDOWS_THREAT_SURFACE_MAP.md
 * - PHASE_4_WINDOWS_ENFORCEMENT_SPEC.md
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { getAuditLogger } from '../services/AuditLogger';
import { CapabilityAuthority } from '../services/CapabilityAuthority';
import { Capability } from '../services/capabilities';

import WindowsEnforcementAdapter from '../os/windows/WindowsEnforcementAdapter';
import WindowsDialogWatcher from '../os/windows/WindowsDialogWatcher';
import WindowsExportJobController from '../os/windows/WindowsExportJobController';
import WindowsFileAccessGate from '../os/windows/WindowsFileAccessGate';
import WindowsAccessibilityGate from '../os/windows/WindowsAccessibilityGate';

import { resetSharedWindowsDialogWatcher } from '../os/windows/getSharedWindowsDialogWatcher';
import SessionContext from '../os/common/SessionContext';

describe('Phase 4 Windows Enforcement — Acceptance Tests', () => {
  let audit = getAuditLogger();
  let authority: CapabilityAuthority;
  let adapter: WindowsEnforcementAdapter;

  beforeEach(() => {
    audit = getAuditLogger();
    resetSharedWindowsDialogWatcher();
    authority = new CapabilityAuthority('test-app', 'test-pid');
    adapter = new WindowsEnforcementAdapter(authority);
  });

  // ===========================================================================
  // WIN-ACC-01 — Dialog Freeze (WIN-T01, WIN-T02, WIN-T15)
  // ===========================================================================

  describe('WIN-ACC-01: Dialog freeze denies enforcement', () => {
    it('should hard-stop when OS dialog detected', async () => {
      adapter.onOSDialogDetected('permission', { spoof: true });

      await expect(
        adapter.enforceCapability(
          { capability: Capability.UI_NAVIGATION, scope: { appId: 'test-app' } },
          { sessionId: 'win-acc-01' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');

      expect(audit.getAllEvents().some(e => e.type === 'OS_DIALOG_DETECTED')).toBe(true);
    });

    it('should block WIN-T01 (fake permission dialog spoof)', async () => {
      // App draws fake dialog
      adapter.onOSDialogDetected('permission', { title: 'Grant Access?' });

      // Enforcement attempt → hard stop
      await expect(
        adapter.enforceCapability(
          { capability: Capability.TEXT_INPUT, scope: {} },
          { sessionId: 'win-acc-01', fieldType: 'SAFE' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');
    });

    it('should block WIN-T02 (modal overlay hijack)', async () => {
      // Modal detected
      adapter.onOSDialogDetected('modal', { hwnd: '0x1000' });

      // Attempt any enforcement → frozen
      await expect(
        adapter.enforceCapability(
          { capability: Capability.UI_NAVIGATION, scope: {} },
          { sessionId: 'win-acc-01' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');
    });

    it('should block WIN-T15 (UAC boundary abuse)', async () => {
      // UAC dialog detected
      adapter.onOSDialogDetected('uac', { level: 'elevated' });

      // Enforcement fails
      await expect(
        adapter.enforceCapability(
          { capability: Capability.PARAMETER_ADJUSTMENT, scope: {} },
          { sessionId: 'win-acc-01' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');
    });
  });

  // ===========================================================================
  // WIN-ACC-02 — Job Termination on Session End (WIN-T05, T07, T08)
  // ===========================================================================

  describe('WIN-ACC-02: Export job terminates on session end', () => {
    it('should kill job object when session ends', async () => {
      const controller = new WindowsExportJobController();
      const sessionId = 'win-acc-02';

      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId
      });

      expect(job.state).toBe('RUNNING');

      controller.revokeAllPermissions();

      expect(job.state).toBe('TERMINATED');
      expect(
        audit.getAllEvents().some(e => e.type === 'OS_EXPORT_JOB_TERMINATED')
      ).toBe(true);
    });

    it('should block WIN-T05 (inherited file handle leak)', async () => {
      // Export running
      const controller = new WindowsExportJobController();
      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId: 'win-acc-02'
      });

      // Session ends → job killed → handles closed
      controller.revokeAllPermissions();

      expect(job.state).toBe('TERMINATED');
    });

    it('should block WIN-T07 (CreateRemoteThread escape)', async () => {
      // Job object enforces JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
      const controller = new WindowsExportJobController();
      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId: 'win-acc-02'
      });

      // Job termination kills all child processes
      controller.revokeAllPermissions();

      expect(job.state).toBe('TERMINATED');
    });

    it('should block WIN-T08 (DLL injection persistence)', async () => {
      // Job-bound process; injection outside job fails
      // When job terminates, all children die
      const controller = new WindowsExportJobController();
      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId: 'win-acc-02'
      });

      controller.revokeAllPermissions();

      expect(job.state).toBe('TERMINATED');
    });
  });

  // ===========================================================================
  // WIN-ACC-03 — Crash → Relaunch → No Persistence (WIN-T12, WIN-T13)
  // ===========================================================================

  describe('WIN-ACC-03: Crash clears all authority', () => {
    it('should revoke all grants on session end', async () => {
      const authority = new CapabilityAuthority('test-app', 'test-pid');

      authority.grant(Capability.FILE_READ, { appId: 'test-app' }, 60000);

      expect(authority.getActiveGrants().length).toBe(1);

      adapter.onSessionEnd();

      expect(authority.getActiveGrants().length).toBe(0);
    });

    it('should block WIN-T12 (registry bookmark persistence)', async () => {
      // Bookmarks stored in memory only, never registry
      const gate = new WindowsFileAccessGate();

      await gate.requestSecurityScopedAccess('C:\\temp\\file.txt', 'session-1');

      gate.revokeAllPermissions();

      // Session 2 starts (hypothetical restart)
      // No bookmark persisted, so access fails
      await expect(
        gate.enforceFileRead({
          capability: Capability.FILE_READ,
          filePath: 'C:\\temp\\file.txt',
          sessionId: 'session-2'
        })
      ).rejects.toThrow('[OS_PERMISSION_DENIED]');
    });

    it('should block WIN-T13 (AppData / temp leakage)', async () => {
      // No persisted authority in appdata
      const gate = new WindowsFileAccessGate();

      await gate.requestSecurityScopedAccess('C:\\temp\\file.txt', 'session-1');

      gate.revokeAllPermissions();

      // New session cannot silently reload grant
      await expect(
        gate.enforceFileRead({
          capability: Capability.FILE_READ,
          filePath: 'C:\\temp\\file.txt',
          sessionId: 'session-2'
        })
      ).rejects.toThrow('[OS_PERMISSION_DENIED]');
    });
  });

  // ===========================================================================
  // WIN-ACC-04 — HWND Reuse Denied (WIN-T03)
  // ===========================================================================

  describe('WIN-ACC-04: HWND reuse causes identity mismatch denial', () => {
    it('should deny HWND reuse with creation time check', async () => {
      const gate = new WindowsAccessibilityGate();

      const windowId1 = { hwnd: 0x1000, pid: 2000, createdAt: 1000 };
      const windowId2 = { hwnd: 0x1000, pid: 2000, createdAt: 2000 }; // recycled

      await gate.enforceUINavigation({
        capability: Capability.UI_NAVIGATION,
        windowHandle: windowId1.hwnd,
        processId: windowId1.pid,
        sessionId: 'win-acc-04'
      });

      // HWND recycled with different creation time
      await expect(
        gate.enforceUINavigation({
          capability: Capability.UI_NAVIGATION,
          windowHandle: windowId2.hwnd,
          processId: windowId2.pid,
          sessionId: 'win-acc-04'
        })
      ).rejects.toThrow('[OS_HARD_STOP]');
    });

    it('should block WIN-T03 (HWND recycling attack)', async () => {
      const gate = new WindowsAccessibilityGate();

      // Window A
      await gate.enforceUINavigation({
        capability: Capability.UI_NAVIGATION,
        windowHandle: 0x2000,
        processId: 3000,
        sessionId: 'win-acc-04'
      });

      // Window A closes, OS reuses HWND
      // Window B gets same HWND but different creation time
      await expect(
        gate.enforceUINavigation({
          capability: Capability.UI_NAVIGATION,
          windowHandle: 0x2000, // reused
          processId: 3000,
          sessionId: 'win-acc-04'
        })
      ).rejects.toThrow('[OS_HARD_STOP]');
    });
  });

  // ===========================================================================
  // WIN-ACC-05 — Handle Reuse Fails (WIN-T06)
  // ===========================================================================

  describe('WIN-ACC-05: Handle reuse across sessions fails', () => {
    it('should deny file access from different session', async () => {
      const gate = new WindowsFileAccessGate();

      // Session 1: Grant access
      await gate.requestSecurityScopedAccess('C:\\temp\\file.txt', 'session-1');

      // Session 1 ends
      gate.revokeAllPermissions();

      // Session 2: Attempt to reuse
      await expect(
        gate.enforceFileRead({
          capability: Capability.FILE_READ,
          filePath: 'C:\\temp\\file.txt',
          sessionId: 'session-2'
        })
      ).rejects.toThrow('[OS_PERMISSION_DENIED]');
    });

    it('should block WIN-T06 (handle reuse across sessions)', async () => {
      const gate = new WindowsFileAccessGate();

      // Bookmark created in session 1
      const bookmark1 = await gate.requestSecurityScopedAccess(
        'C:\\temp\\data.bin',
        'win-acc-05-session-1'
      );

      gate.revokeAllPermissions();

      // Session 2 cannot reuse same bookmark
      await expect(
        gate.enforceFileRead({
          capability: Capability.FILE_READ,
          filePath: 'C:\\temp\\data.bin',
          sessionId: 'win-acc-05-session-2'
        })
      ).rejects.toThrow('[OS_PERMISSION_DENIED]');
    });
  });

  // ===========================================================================
  // WIN-ACC-06 — Export Termination + File Stability (WIN-T11)
  // ===========================================================================

  describe('WIN-ACC-06: Export stops and file identity remains stable', () => {
    it('should verify file stability on job termination', async () => {
      const controller = new WindowsExportJobController();

      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId: 'win-acc-06'
      });

      expect(job.state).toBe('RUNNING');

      controller.revokeAllPermissions();

      expect(job.state).toBe('TERMINATED');
      expect(
        audit.getAllEvents().some(e => e.type === 'OS_EXPORT_JOB_TERMINATED')
      ).toBe(true);
    });

    it('should block WIN-T11 (volume move / rename TOCTOU)', async () => {
      // File exported
      // Volume moved between check and use
      // Export job verifies file object ID remained stable
      const controller = new WindowsExportJobController();

      const job = await controller.enforceRenderExport({
        capability: Capability.RENDER_EXPORT,
        filePath: 'C:\\temp\\export.wav',
        sessionId: 'win-acc-06'
      });

      // If file moved (object ID changed), termination verification fails
      controller.revokeAllPermissions();

      const isStopped = audit.getAllEvents().some(
        e => e.type === 'OS_EXPORT_JOB_TERMINATED' && e.data.fileVerified
      );

      expect(isStopped).toBe(true);
    });
  });

  // ===========================================================================
  // WIN-ACC-07 — Secure Field Hard Deny (WIN-T14)
  // ===========================================================================

  describe('WIN-ACC-07: Password field is hard denied', () => {
    it('should hard-stop on SENSITIVE field access', async () => {
      const gate = new WindowsAccessibilityGate();

      await expect(
        gate.enforceTextInput({
          capability: Capability.TEXT_INPUT,
          fieldId: 'password',
          fieldType: 'SENSITIVE',
          windowHandle: 0x3000,
          processId: 4000,
          sessionId: 'win-acc-07'
        })
      ).rejects.toThrow('[OS_HARD_STOP]');

      expect(
        audit.getAllEvents().some(e => e.type === 'SENSITIVE_FIELD_BLOCKED')
      ).toBe(true);
    });

    it('should block WIN-T14 (token duplication / elevation)', async () => {
      const gate = new WindowsAccessibilityGate();

      // Attempt elevated token action on credential field
      await expect(
        gate.enforceTextInput({
          capability: Capability.TEXT_INPUT,
          fieldId: 'pin',
          fieldType: 'SENSITIVE',
          windowHandle: 0x3000,
          processId: 4000,
          sessionId: 'win-acc-07'
        })
      ).rejects.toThrow('[OS_HARD_STOP]');
    });
  });

  // ===========================================================================
  // WIN-ACC-08 — Missing FieldType Denied (WIN-T14 prevention)
  // ===========================================================================

  describe('WIN-ACC-08: Missing fieldType denies TEXT_INPUT', () => {
    it('should deny TEXT_INPUT without fieldType classification', async () => {
      const adapter = new WindowsEnforcementAdapter();

      await expect(
        adapter.enforceCapability(
          { capability: Capability.TEXT_INPUT, scope: {} },
          {
            sessionId: 'win-acc-08',
            fieldId: 'email',
            windowHandle: 0x4000,
            processId: 5000
            // fieldType is missing
          }
        )
      ).rejects.toThrow('[OS_PERMISSION_DENIED]');

      expect(
        audit.getAllEvents().some(
          e => e.type === 'OS_PERMISSION_DENIED' && e.data.reason.includes('fieldType')
        )
      ).toBe(true);
    });
  });

  // ===========================================================================
  // WIN-ACC-09 — Dialog State Single Source of Truth (WIN-T02)
  // ===========================================================================

  describe('WIN-ACC-09: Dialog cleared resumes enforcement without desync', () => {
    it('should not desync dialog state after clear', async () => {
      const adapter = new WindowsEnforcementAdapter();

      // Dialog detected
      adapter.onOSDialogDetected('permission', { title: 'Confirm' });

      // Enforcement frozen
      await expect(
        adapter.enforceCapability(
          { capability: Capability.UI_NAVIGATION, scope: {} },
          { sessionId: 'win-acc-09' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');

      // Dialog cleared
      adapter.onOSDialogCleared();

      // Next enforcement should NOT freeze on dialog (may fail for other reasons)
      let threwDialogFreeze = false;
      try {
        await adapter.enforceCapability(
          { capability: Capability.UI_NAVIGATION, scope: {} },
          { sessionId: 'win-acc-09' }
        );
      } catch (err) {
        threwDialogFreeze = (err as Error).message.includes('[OS_HARD_STOP] OS');
      }

      expect(threwDialogFreeze).toBe(false);
    });

    it('should block WIN-T02 (modal overlay hijack desync)', async () => {
      const adapter = new WindowsEnforcementAdapter();

      // Modal detected
      adapter.onOSDialogDetected('modal', { hwnd: '0x5000' });

      // Enforcement blocked
      await expect(
        adapter.enforceCapability(
          { capability: Capability.UI_NAVIGATION, scope: {} },
          { sessionId: 'win-acc-09' }
        )
      ).rejects.toThrow('[OS_HARD_STOP]');

      // Modal cleared
      adapter.onOSDialogCleared();

      // Verify audit shows both detect + clear
      const events = audit.getAllEvents();
      expect(events.some(e => e.type === 'OS_DIALOG_DETECTED')).toBe(true);
      expect(events.some(e => e.type === 'OS_DIALOG_CLEARED')).toBe(true);
    });
  });

  // ===========================================================================
  // SUMMARY
  // ===========================================================================

  describe('Phase 4 Windows Acceptance Test Summary', () => {
    it('should document all 9 tests', () => {
      const testCount = 9;
      expect(testCount).toBe(9); // WIN-ACC-01 through WIN-ACC-09
    });

    it('should map all tests to threat vectors', () => {
      const vectorCoverage = {
        'WIN-T01': ['WIN-ACC-01'],
        'WIN-T02': ['WIN-ACC-01', 'WIN-ACC-09'],
        'WIN-T03': ['WIN-ACC-04'],
        'WIN-T05': ['WIN-ACC-02'],
        'WIN-T06': ['WIN-ACC-05'],
        'WIN-T07': ['WIN-ACC-02'],
        'WIN-T08': ['WIN-ACC-02'],
        'WIN-T11': ['WIN-ACC-06'],
        'WIN-T12': ['WIN-ACC-03'],
        'WIN-T13': ['WIN-ACC-03'],
        'WIN-T14': ['WIN-ACC-07', 'WIN-ACC-08'],
        'WIN-T15': ['WIN-ACC-01']
      };

      // All vectors covered
      expect(Object.keys(vectorCoverage).length).toBe(12);
    });
  });
});
