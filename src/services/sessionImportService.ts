import type { ProofTrainerTrackKind } from './sessionAlignmentService';

export interface SessionImportFileLike {
  name: string;
  type?: string;
  webkitRelativePath?: string;
}

export type SessionImportStemType = 'vocals' | 'drums' | 'bass' | 'reference' | 'other';

export type SessionImportSourceApp =
  | 'logic-pro'
  | 'pro-tools'
  | 'bandlab'
  | 'garageband'
  | 'ableton-live'
  | 'reaper'
  | 'fl-studio'
  | 'cubase'
  | 'unknown';

export interface SessionImportSourceDetection {
  sourceApp: SessionImportSourceApp;
  displayName: string;
  confidence: number;
  markers: string[];
  paths: string[];
}

export interface SessionImportPackageNode {
  name: string;
  path: string;
  kind: 'folder' | 'file';
  fileCount: number;
  audioFileCount: number;
  children: SessionImportPackageNode[];
}

export interface SessionImportPackageGraph {
  rootPath: string | null;
  rootName: string;
  topLevelNodeCount: number;
  fileCount: number;
  audioFileCount: number;
  nodes: SessionImportPackageNode[];
}

export interface SessionImportTrack<TFile extends SessionImportFileLike = SessionImportFileLike> {
  file: TFile;
  relativePath: string;
  displayName: string;
  kind: ProofTrainerTrackKind;
  role: string;
  stemType: SessionImportStemType;
  score: number;
  reasons: string[];
}

export interface SessionImportBundle<TFile extends SessionImportFileLike = SessionImportFileLike> {
  beatFile: TFile | null;
  vocalFiles: TFile[];
  referenceFile: TFile | null;
  otherFiles: TFile[];
  ignoredFiles: TFile[];
  tracks: SessionImportTrack<TFile>[];
  sourceDetections: SessionImportSourceDetection[];
  sourceApp: SessionImportSourceApp;
  packageGraph: SessionImportPackageGraph;
  warnings: string[];
  summary: {
    audioFileCount: number;
    beatCount: number;
    vocalCount: number;
    referenceCount: number;
    otherCount: number;
  };
}

const AUDIO_EXTENSION_RE = /\.(wav|wave|mp3|m4a|aac|flac|aif|aiff|ogg|caf|alac)$/i;
const SESSION_MARKER_PATTERNS: Array<{
  sourceApp: SessionImportSourceApp;
  displayName: string;
  markers: Array<{ pattern: RegExp; marker: string; confidence: number }>;
}> = [
  {
    sourceApp: 'logic-pro',
    displayName: 'Logic Pro',
    markers: [
      { pattern: /(^|[\\/])[^\\/]+\.logicx([\\/]|$)/i, marker: '.logicx package', confidence: 5 },
      { pattern: /(^|[\s._/-])(logic(?:\s*pro)?(?:\s*x)?)([\s._/-]|$)/i, marker: 'Logic Pro naming', confidence: 3 },
      { pattern: /(^|[\\/])(audio files|bounce files|alternates|project alternatives)([\\/]|$)/i, marker: 'Logic project folder', confidence: 2 },
    ],
  },
  {
    sourceApp: 'pro-tools',
    displayName: 'Pro Tools',
    markers: [
      { pattern: /\.ptx$/i, marker: '.ptx session', confidence: 5 },
      { pattern: /\.ptf$/i, marker: '.ptf session', confidence: 5 },
      { pattern: /(^|[\s._/-])(pro\s?tools?|ptx|ptf)([\s._/-]|$)/i, marker: 'Pro Tools naming', confidence: 3 },
      { pattern: /(^|[\\/])(audio files|fade files|clip groups|session files)([\\/]|$)/i, marker: 'Pro Tools session folder', confidence: 2 },
    ],
  },
  {
    sourceApp: 'bandlab',
    displayName: 'BandLab',
    markers: [
      { pattern: /(^|[\s._/-])(bandlab)([\s._/-]|$)/i, marker: 'BandLab naming', confidence: 5 },
      { pattern: /(^|[\\/])(bandlab|exports?|mixdowns?)([\\/]|$)/i, marker: 'BandLab folder', confidence: 2 },
    ],
  },
  {
    sourceApp: 'garageband',
    displayName: 'GarageBand',
    markers: [
      { pattern: /\.band$/i, marker: '.band package', confidence: 5 },
      { pattern: /(^|[\s._/-])(garageband|gbproject)([\s._/-]|$)/i, marker: 'GarageBand naming', confidence: 3 },
    ],
  },
  {
    sourceApp: 'ableton-live',
    displayName: 'Ableton Live',
    markers: [
      { pattern: /\.als$/i, marker: '.als set', confidence: 5 },
      { pattern: /(^|[\s._/-])(ableton|live)([\s._/-]|$)/i, marker: 'Ableton naming', confidence: 3 },
    ],
  },
  {
    sourceApp: 'reaper',
    displayName: 'REAPER',
    markers: [
      { pattern: /\.rpp$/i, marker: '.rpp project', confidence: 5 },
      { pattern: /(^|[\s._/-])(reaper|rpp)([\s._/-]|$)/i, marker: 'REAPER naming', confidence: 3 },
    ],
  },
  {
    sourceApp: 'fl-studio',
    displayName: 'FL Studio',
    markers: [
      { pattern: /\.flp$/i, marker: '.flp project', confidence: 5 },
      { pattern: /(^|[\s._/-])(fl\s?studio|flp)([\s._/-]|$)/i, marker: 'FL Studio naming', confidence: 3 },
    ],
  },
  {
    sourceApp: 'cubase',
    displayName: 'Cubase',
    markers: [
      { pattern: /\.cpr$/i, marker: '.cpr project', confidence: 5 },
      { pattern: /(^|[\s._/-])(cubase|cpr)([\s._/-]|$)/i, marker: 'Cubase naming', confidence: 3 },
    ],
  },
];

const basename = (path: string): string => path.split(/[\\/]/).pop() || path;

function normalizePathSegments(path: string): string[] {
  return path.split(/[\\/]/).map((segment) => segment.trim()).filter(Boolean);
}

function commonPathPrefix(paths: string[]): string[] {
  if (paths.length === 0) return [];
  const segments = paths.map(normalizePathSegments);
  const shortest = segments.reduce((min, current) => (current.length < min.length ? current : min), segments[0] ?? []);
  const prefix: string[] = [];

  for (let index = 0; index < shortest.length; index += 1) {
    const candidate = shortest[index];
    if (!candidate) break;
    if (!segments.every((parts) => parts[index] === candidate)) break;
    prefix.push(candidate);
  }

  return prefix;
}

function createNode(name: string, path: string, kind: 'folder' | 'file'): SessionImportPackageNode {
  return {
    name,
    path,
    kind,
    fileCount: 0,
    audioFileCount: 0,
    children: [],
  };
}

function buildSessionPackageGraph<TFile extends SessionImportFileLike>(files: TFile[]): SessionImportPackageGraph {
  const paths = files.map((file) => getSessionImportPath(file));
  const prefix = commonPathPrefix(paths);
  const rootPath = prefix.length > 0 ? prefix.join('/') : null;
  const rootName = prefix[prefix.length - 1] ?? (paths.length > 0 ? basename(paths[0] ?? '') : 'Session');
  const root = createNode(rootName, rootPath ?? rootName, 'folder');
  const nodeIndex = new Map<string, SessionImportPackageNode>();
  nodeIndex.set(root.path, root);

  for (const file of files) {
    const path = getSessionImportPath(file);
    const segments = normalizePathSegments(path);
    const relativeSegments = prefix.length > 0 && segments.length >= prefix.length && prefix.every((part, index) => segments[index] === part)
      ? segments.slice(prefix.length)
      : segments;
    let cursor = root;
    let cursorPath = root.path;

    cursor.fileCount += 1;
    if (isAudioLikeFile(file)) {
      cursor.audioFileCount += 1;
    }

    for (let index = 0; index < Math.max(0, relativeSegments.length - 1); index += 1) {
      const segment = relativeSegments[index];
      cursorPath = cursorPath ? `${cursorPath}/${segment}` : segment;
      let next = nodeIndex.get(cursorPath);
      if (!next) {
        next = createNode(segment, cursorPath, 'folder');
        nodeIndex.set(cursorPath, next);
        cursor.children.push(next);
      }
      next.fileCount += 1;
      if (isAudioLikeFile(file)) {
        next.audioFileCount += 1;
      }
      cursor = next;
    }

    const leafPath = path;
    let leaf = nodeIndex.get(leafPath);
    if (!leaf) {
      leaf = createNode(basename(path), leafPath, 'file');
      nodeIndex.set(leafPath, leaf);
      cursor.children.push(leaf);
    }
    leaf.fileCount = 1;
    leaf.audioFileCount = isAudioLikeFile(file) ? 1 : 0;
  }

  const sortNodes = (nodes: SessionImportPackageNode[]) => {
    nodes.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
      return right.audioFileCount - left.audioFileCount || right.fileCount - left.fileCount || left.name.localeCompare(right.name);
    });
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root.children);

  return {
    rootPath,
    rootName,
    topLevelNodeCount: root.children.length,
    fileCount: files.length,
    audioFileCount: files.filter((file) => isAudioLikeFile(file)).length,
    nodes: root.children,
  };
}

export function isAudioLikeFile(file: SessionImportFileLike): boolean {
  return Boolean(file.type?.startsWith('audio/')) || AUDIO_EXTENSION_RE.test(file.name);
}

export function getSessionImportPath(file: SessionImportFileLike): string {
  return file.webkitRelativePath?.trim() || file.name;
}

function detectSessionSources(files: SessionImportFileLike[]): SessionImportSourceDetection[] {
  const detections = new Map<SessionImportSourceApp, SessionImportSourceDetection>();

  for (const file of files) {
    const path = getSessionImportPath(file);
    const pathLower = path.toLowerCase();
    const nameLower = file.name.toLowerCase();
    const combined = `${pathLower} ${nameLower}`;

    for (const candidate of SESSION_MARKER_PATTERNS) {
      for (const marker of candidate.markers) {
        if (!marker.pattern.test(combined)) continue;
        const existing = detections.get(candidate.sourceApp);
        const nextMarkers = existing ? [...existing.markers, marker.marker] : [marker.marker];
        const nextPaths = existing ? [...existing.paths, path] : [path];
        detections.set(candidate.sourceApp, {
          sourceApp: candidate.sourceApp,
          displayName: candidate.displayName,
          confidence: Math.min(10, (existing?.confidence ?? 0) + marker.confidence),
          markers: Array.from(new Set(nextMarkers)),
          paths: Array.from(new Set(nextPaths)),
        });
        break;
      }
    }
  }

  return Array.from(detections.values()).sort((left, right) => right.confidence - left.confidence || left.displayName.localeCompare(right.displayName));
}

function pushReason(reasons: string[], matched: boolean, reason: string): number {
  if (!matched) return 0;
  reasons.push(reason);
  return 1;
}

function inferTrackKind(path: string): { kind: ProofTrainerTrackKind; score: number; reasons: string[] } {
  const lower = path.toLowerCase();
  const reasons: string[] = [];

  const referenceScore =
    pushReason(reasons, /(^|[\s._/-])(master|mix|final|reference|ref|2trk|two[-\s]?track|print)([\s._/-]|$)/.test(lower), 'reference keyword') * 5 +
    pushReason(reasons, /(^|[\s._/-])(bounce|mastered)([\s._/-]|$)/.test(lower), 'master bounce keyword') * 2;

  const beatScore =
    pushReason(reasons, /(^|[\s._/-])(beat|instrumental|inst|music|prod|production)([\s._/-]|$)/.test(lower), 'beat keyword') * 5 +
    pushReason(reasons, /(^|[\s._/-])(drums|perc|percussion)([\s._/-]|$)/.test(lower), 'drum keyword') * 2;

  const vocalScore =
    pushReason(reasons, /(^|[\s._/-])(vocal|vox|lead|main|verse|hook|chorus|double|dbl|adlib|ad-lib|adlibs|harm|harmony|bgv|backing)([\s._/-]|$)/.test(lower), 'vocal keyword') * 5 +
    pushReason(reasons, /(^|[\s._/-])(take|comp|stack)([\s._/-]|$)/.test(lower), 'take or comp keyword') * 2;

  const bassScore =
    /(^|[\s._/-])(bass|808|sub)([\s._/-]|$)/.test(lower) ? 4 : 0;

  if (referenceScore >= beatScore && referenceScore >= vocalScore && referenceScore > 0) {
    return { kind: 'reference', score: referenceScore, reasons };
  }
  if (vocalScore > beatScore && vocalScore >= 5) {
    return { kind: 'vocal', score: vocalScore, reasons };
  }
  if (beatScore > 0) {
    return { kind: 'beat', score: beatScore, reasons };
  }
  if (bassScore > 0) {
    reasons.push('bass keyword');
    return { kind: 'other', score: bassScore, reasons };
  }
  return { kind: 'other', score: 0, reasons: reasons.length ? reasons : ['no strong role keyword'] };
}

export function inferSessionImportRole(path: string, index = 0): string {
  const lower = path.toLowerCase();
  if (/(^|[\s._/-])(reference|ref|master|mix|final)([\s._/-]|$)/.test(lower)) return 'reference';
  if (/(^|[\s._/-])(beat|instrumental|inst|music|prod|drums|perc)([\s._/-]|$)/.test(lower)) return 'beat';
  if (/(^|[\s._/-])(bass|808|sub)([\s._/-]|$)/.test(lower)) return 'bass';
  if (/(^|[\s._/-])(intro|opening)([\s._/-]|$)/.test(lower)) return 'intro';
  if (/(^|[\s._/-])(outro|ending)([\s._/-]|$)/.test(lower)) return 'outro';
  if (/(^|[\s._/-])(double|dbl|dbls)([\s._/-]|$)/.test(lower)) return 'double';
  if (/(^|[\s._/-])(adlib|ad-lib|adlibs|ad-libs)([\s._/-]|$)/.test(lower)) return 'adlib';
  if (/(^|[\s._/-])(harmony|harm|bgv|backing)([\s._/-]|$)/.test(lower)) return 'harmony';
  if (/(^|[\s._/-])(throw|fx|effect)([\s._/-]|$)/.test(lower)) return 'throw';
  if (/(^|[\s._/-])(lead|main|verse|hook|chorus|vocal|vox)([\s._/-]|$)/.test(lower)) return 'lead';
  if (index === 0) return 'lead';
  return 'support';
}

export function getStemTypeForImportedTrack(kind: ProofTrainerTrackKind, role: string): SessionImportStemType {
  if (role === 'bass') return 'bass';
  if (kind === 'vocal') return 'vocals';
  if (kind === 'beat') return 'drums';
  if (kind === 'reference') return 'reference';
  return 'other';
}

function rolePriority(role: string): number {
  switch (role) {
    case 'lead':
      return 0;
    case 'double':
      return 1;
    case 'adlib':
      return 2;
    case 'harmony':
      return 3;
    default:
      return 4;
  }
}

function kindPriority(kind: ProofTrainerTrackKind): number {
  switch (kind) {
    case 'beat':
      return 0;
    case 'vocal':
      return 1;
    case 'reference':
      return 2;
    default:
      return 3;
  }
}

function choosePrimaryTrack<TFile extends SessionImportFileLike>(
  tracks: SessionImportTrack<TFile>[],
): SessionImportTrack<TFile> | null {
  if (tracks.length === 0) return null;
  return [...tracks].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.relativePath.localeCompare(right.relativePath);
  })[0] ?? null;
}

export function classifySessionFiles<TFile extends SessionImportFileLike>(
  files: Iterable<TFile>,
): SessionImportBundle<TFile> {
  const input = Array.from(files);
  const ignoredFiles = input.filter((file) => !isAudioLikeFile(file));
  const audioFiles = input.filter((file) => isAudioLikeFile(file));
  const sourceDetections = detectSessionSources(input);
  const sourceApp = sourceDetections[0]?.sourceApp ?? 'unknown';
  const packageGraph = buildSessionPackageGraph(input);

  const tracks = audioFiles
    .map((file, index) => {
      const relativePath = getSessionImportPath(file);
      const { kind, score, reasons } = inferTrackKind(relativePath);
      const role = inferSessionImportRole(relativePath, index);
      return {
        file,
        relativePath,
        displayName: basename(relativePath),
        kind,
        role,
        stemType: getStemTypeForImportedTrack(kind, role),
        score,
        reasons,
      } satisfies SessionImportTrack<TFile>;
    })
    .sort((left, right) => {
      const priorityDelta = kindPriority(left.kind) - kindPriority(right.kind);
      if (priorityDelta !== 0) return priorityDelta;
      if (left.kind === 'vocal' && right.kind === 'vocal') {
        const roleDelta = rolePriority(left.role) - rolePriority(right.role);
        if (roleDelta !== 0) return roleDelta;
      }
      return left.relativePath.localeCompare(right.relativePath);
    });

  const beatCandidates = tracks.filter((track) => track.kind === 'beat');
  const vocalCandidates = tracks.filter((track) => track.kind === 'vocal');
  const referenceCandidates = tracks.filter((track) => track.kind === 'reference');
  const otherCandidates = tracks.filter((track) => track.kind === 'other');

  const beatTrack = choosePrimaryTrack(beatCandidates);
  const referenceTrack = choosePrimaryTrack(referenceCandidates);
  const warnings: string[] = [];

  if (!beatTrack) warnings.push('No beat or instrumental file was detected from the imported session.');
  if (vocalCandidates.length === 0) warnings.push('No vocal files were detected from the imported session.');
  if (beatCandidates.length > 1 && beatTrack) {
    warnings.push(`Multiple beat candidates found. Using ${beatTrack.displayName} as the main instrumental.`);
  }
  if (referenceCandidates.length > 1 && referenceTrack) {
    warnings.push(`Multiple reference/master candidates found. Using ${referenceTrack.displayName} as the session reference.`);
  }
  if (sourceDetections.length > 1) {
    warnings.push(`Multiple session package markers detected: ${sourceDetections.map((item) => item.displayName).join(', ')}.`);
  } else if (sourceDetections.length === 1) {
    warnings.push(`Detected ${sourceDetections[0]?.displayName ?? 'a session package'} folder structure locally.`);
  } else if (input.some((file) => /\.logicx$/i.test(file.name) || /\.ptx$/i.test(file.name) || /\.als$/i.test(file.name))) {
    warnings.push('Detected a session package marker, but the folder structure is too sparse to identify the source app confidently.');
  }

  return {
    beatFile: beatTrack?.file ?? null,
    vocalFiles: vocalCandidates.map((track) => track.file),
    referenceFile: referenceTrack?.file ?? null,
    otherFiles: otherCandidates.map((track) => track.file),
    ignoredFiles,
    tracks,
    sourceDetections,
    sourceApp,
    packageGraph,
    warnings,
    summary: {
      audioFileCount: audioFiles.length,
      beatCount: beatCandidates.length,
      vocalCount: vocalCandidates.length,
      referenceCount: referenceCandidates.length,
      otherCount: otherCandidates.length,
    },
  };
}
