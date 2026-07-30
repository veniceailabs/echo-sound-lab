import type { AudioEngineSnapshot } from './audioEngine';
import type { SessionState } from './sessionManager';
import { listServiceTemplates, type ServiceTemplate } from './ServiceTemplates';

export type SessionInterchangeFormat = 'esl-session-package';

export interface SessionInterchangeManifest {
  format: SessionInterchangeFormat;
  version: 1;
  exportedAt: number;
  exportedBy: 'echo-sound-lab';
}

export interface SessionInterchangePackage {
  manifest: SessionInterchangeManifest;
  session: SessionState;
  engine: {
    masteringQualityMode: AudioEngineSnapshot['masteringQualityMode'];
    recommendedRenderPath: AudioEngineSnapshot['recommendedRenderPath'];
    renderPathReason: string;
    chainSignature: string | null;
    warnings: string[];
    activeFlags: AudioEngineSnapshot['activeFlags'];
  };
  templates: Pick<ServiceTemplate, 'templateId' | 'name' | 'category' | 'summary'>[];
  notes: string[];
}

const PACKAGE_NAME_PREFIX = 'echo-session-package';

function safeFileName(fileName: string | null | undefined): string {
  const base = (fileName || PACKAGE_NAME_PREFIX).trim() || PACKAGE_NAME_PREFIX;
  return base.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
}

export function buildSessionInterchangePackage(
  session: SessionState,
  engineSnapshot: AudioEngineSnapshot,
  notes: string[] = []
): SessionInterchangePackage {
  return {
    manifest: {
      format: 'esl-session-package',
      version: 1,
      exportedAt: Date.now(),
      exportedBy: 'echo-sound-lab',
    },
    session: JSON.parse(JSON.stringify(session)) as SessionState,
    engine: {
      masteringQualityMode: engineSnapshot.masteringQualityMode,
      recommendedRenderPath: engineSnapshot.recommendedRenderPath,
      renderPathReason: engineSnapshot.renderPathReason,
      chainSignature: engineSnapshot.chainSignature,
      warnings: [...engineSnapshot.warnings],
      activeFlags: { ...engineSnapshot.activeFlags },
    },
    templates: listServiceTemplates().map((template) => ({
      templateId: template.templateId,
      name: template.name,
      category: template.category,
      summary: template.summary,
    })),
    notes: [...notes],
  };
}

export function serializeSessionInterchangePackage(pkg: SessionInterchangePackage): string {
  return JSON.stringify(pkg, null, 2);
}

export function parseSessionInterchangePackage(raw: string): SessionInterchangePackage | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionInterchangePackage>;
    if (!parsed || parsed.manifest?.format !== 'esl-session-package' || parsed.manifest.version !== 1) {
      return null;
    }
    if (!parsed.session || !parsed.engine || !Array.isArray(parsed.templates)) {
      return null;
    }
    return parsed as SessionInterchangePackage;
  } catch {
    return null;
  }
}

export function downloadSessionInterchangePackage(
  pkg: SessionInterchangePackage,
  fileName?: string
): void {
  const blob = new Blob([serializeSessionInterchangePackage(pkg)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safeFileName(fileName || pkg.session.fileName)}.esl-session.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importSessionInterchangePackage(file: File): Promise<SessionInterchangePackage | null> {
  try {
    const raw = await file.text();
    return parseSessionInterchangePackage(raw);
  } catch {
    return null;
  }
}
