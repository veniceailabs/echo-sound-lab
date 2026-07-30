import type { StudioHardwareActionId, StudioHardwareControlBridge } from './studioHardwareControlService';

export interface StudioMidiControlBinding {
  source: 'note' | 'cc';
  number: number;
  actionId: StudioHardwareActionId;
  notes: string;
  deviceName: string | null;
}

export interface StudioMidiControlMessageSnapshot {
  receivedAt: number;
  raw: string;
  kind: 'note-on' | 'note-off' | 'cc' | 'other';
  channel: number;
  number: number;
  value: number;
  actionId: StudioHardwareActionId | null;
  bindingSource: 'default' | 'learned' | null;
  deviceName: string | null;
}

export interface StudioMidiControlLearnTarget {
  actionId: StudioHardwareActionId;
  source: 'note' | 'cc';
}

export interface StudioMidiDeviceProfile {
  inputName: string;
  family: 'generic-pad' | 'generic-cc' | 'grid-controller' | 'transport-surface' | 'keyboard' | 'unknown';
  ready: boolean;
  notes: string[];
}

export interface StudioMidiControlSnapshot {
  generatedAt: number;
  supported: boolean;
  plugAndPlayReady: boolean;
  connectedInputs: string[];
  activeInputs: number;
  detectedProfiles: StudioMidiDeviceProfile[];
  lastMessage: string | null;
  lastMessageDetails: StudioMidiControlMessageSnapshot | null;
  learnTarget: StudioMidiControlLearnTarget | null;
  bindings: StudioMidiControlBinding[];
  learnedBindings: StudioMidiControlBinding[];
  notes: string[];
}

const NOTE_ACTION_MAP: Record<number, StudioHardwareActionId> = {
  36: 'transport.play',
  37: 'transport.pause',
  38: 'transport.stop',
  39: 'transport.seek.zero',
  40: 'timeline.prev-hotspot',
  41: 'timeline.next-hotspot',
  42: 'timeline.export-snapshot',
  43: 'timeline.export-markers',
  44: 'timeline.merge-compare',
  45: 'comp.audition',
  46: 'comp.cycle-prev',
  47: 'comp.cycle-next',
  48: 'comp.promote',
  56: 'capture.flashback',
  57: 'capture.restore.latest',
  49: 'interchange.export-session',
  50: 'interchange.export-aaf',
  51: 'interchange.export-omf',
  52: 'interchange.import-session',
  53: 'workspace.command-center',
  54: 'workspace.timeline',
  55: 'workspace.collaboration',
};

const CC_ACTION_MAP: Record<number, StudioHardwareActionId> = {
  20: 'transport.play',
  21: 'transport.pause',
  22: 'transport.stop',
  23: 'transport.seek.zero',
  24: 'timeline.prev-hotspot',
  25: 'timeline.next-hotspot',
  26: 'timeline.export-snapshot',
  27: 'timeline.export-markers',
  28: 'timeline.merge-compare',
  29: 'comp.audition',
  30: 'comp.cycle-prev',
  31: 'comp.cycle-next',
  32: 'comp.promote',
  37: 'capture.flashback',
  38: 'capture.restore.latest',
  33: 'interchange.export-session',
  34: 'interchange.export-aaf',
  35: 'interchange.export-omf',
  36: 'interchange.import-session',
};

const defaultBindings = [
  { source: 'note', number: 36, actionId: 'transport.play', notes: 'Pad 36' },
  { source: 'note', number: 37, actionId: 'transport.pause', notes: 'Pad 37' },
  { source: 'note', number: 38, actionId: 'transport.stop', notes: 'Pad 38' },
  { source: 'note', number: 39, actionId: 'transport.seek.zero', notes: 'Pad 39' },
  { source: 'note', number: 40, actionId: 'timeline.prev-hotspot', notes: 'Pad 40' },
  { source: 'note', number: 41, actionId: 'timeline.next-hotspot', notes: 'Pad 41' },
  { source: 'note', number: 42, actionId: 'timeline.export-snapshot', notes: 'Pad 42' },
  { source: 'note', number: 43, actionId: 'timeline.export-markers', notes: 'Pad 43' },
  { source: 'note', number: 44, actionId: 'timeline.merge-compare', notes: 'Pad 44' },
  { source: 'note', number: 45, actionId: 'comp.audition', notes: 'Pad 45' },
  { source: 'note', number: 46, actionId: 'comp.cycle-prev', notes: 'Pad 46' },
  { source: 'note', number: 47, actionId: 'comp.cycle-next', notes: 'Pad 47' },
  { source: 'note', number: 48, actionId: 'comp.promote', notes: 'Pad 48' },
  { source: 'note', number: 56, actionId: 'capture.flashback', notes: 'Pad 56' },
  { source: 'note', number: 57, actionId: 'capture.restore.latest', notes: 'Pad 57' },
  { source: 'note', number: 49, actionId: 'interchange.export-session', notes: 'Pad 49' },
  { source: 'note', number: 50, actionId: 'interchange.export-aaf', notes: 'Pad 50' },
  { source: 'note', number: 51, actionId: 'interchange.export-omf', notes: 'Pad 51' },
  { source: 'note', number: 52, actionId: 'interchange.import-session', notes: 'Pad 52' },
  { source: 'cc', number: 20, actionId: 'transport.play', notes: 'CC 20' },
  { source: 'cc', number: 21, actionId: 'transport.pause', notes: 'CC 21' },
  { source: 'cc', number: 22, actionId: 'transport.stop', notes: 'CC 22' },
  { source: 'cc', number: 23, actionId: 'transport.seek.zero', notes: 'CC 23' },
  { source: 'cc', number: 24, actionId: 'timeline.prev-hotspot', notes: 'CC 24' },
  { source: 'cc', number: 25, actionId: 'timeline.next-hotspot', notes: 'CC 25' },
  { source: 'cc', number: 26, actionId: 'timeline.export-snapshot', notes: 'CC 26' },
  { source: 'cc', number: 27, actionId: 'timeline.export-markers', notes: 'CC 27' },
  { source: 'cc', number: 28, actionId: 'timeline.merge-compare', notes: 'CC 28' },
  { source: 'cc', number: 29, actionId: 'comp.audition', notes: 'CC 29' },
  { source: 'cc', number: 30, actionId: 'comp.cycle-prev', notes: 'CC 30' },
  { source: 'cc', number: 31, actionId: 'comp.cycle-next', notes: 'CC 31' },
  { source: 'cc', number: 32, actionId: 'comp.promote', notes: 'CC 32' },
  { source: 'cc', number: 37, actionId: 'capture.flashback', notes: 'CC 37' },
  { source: 'cc', number: 38, actionId: 'capture.restore.latest', notes: 'CC 38' },
  { source: 'cc', number: 33, actionId: 'interchange.export-session', notes: 'CC 33' },
  { source: 'cc', number: 34, actionId: 'interchange.export-aaf', notes: 'CC 34' },
  { source: 'cc', number: 35, actionId: 'interchange.export-omf', notes: 'CC 35' },
  { source: 'cc', number: 36, actionId: 'interchange.import-session', notes: 'CC 36' },
] satisfies Array<Omit<StudioMidiControlBinding, 'deviceName'>>;

const bindings: StudioMidiControlBinding[] = defaultBindings.map((binding) => ({
  ...binding,
  deviceName: null,
}));

const LEARNED_BINDINGS_STORAGE_KEY = 'esl-midi-learned-bindings-v1';

let learnedBindings: StudioMidiControlBinding[] = [];
let learnTarget: StudioMidiControlLearnTarget | null = null;
let latestConnectedInputs: string[] = [];
let latestLastMessage: string | null = null;
let latestLastMessageDetails: StudioMidiControlMessageSnapshot | null = null;
let snapshotSink: ((snapshot: StudioMidiControlSnapshot) => void) | null = null;

function readStoredLearnedBindings(): StudioMidiControlBinding[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(LEARNED_BINDINGS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const candidate = entry as Partial<StudioMidiControlBinding>;
        if ((candidate.source !== 'note' && candidate.source !== 'cc') || typeof candidate.number !== 'number' || typeof candidate.actionId !== 'string') {
          return null;
        }
        if (!candidate.notes || typeof candidate.notes !== 'string') return null;
        return {
          source: candidate.source,
          number: candidate.number,
          actionId: candidate.actionId as StudioHardwareActionId,
          notes: candidate.notes,
          deviceName: typeof candidate.deviceName === 'string' ? candidate.deviceName : null,
        } satisfies StudioMidiControlBinding;
      })
      .filter((entry): entry is StudioMidiControlBinding => Boolean(entry));
  } catch {
    return [];
  }
}

function persistLearnedBindings(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LEARNED_BINDINGS_STORAGE_KEY, JSON.stringify(learnedBindings));
  } catch {
    // Ignore storage failures.
  }
}

learnedBindings = readStoredLearnedBindings();

function publishCurrentSnapshot(): void {
  if (!snapshotSink) return;
  snapshotSink(buildStudioMidiControlSnapshot(latestConnectedInputs, latestLastMessage, latestLastMessageDetails, learnTarget, learnedBindings));
}

function resolveActionFromNote(note: number, deviceName: string | null): { actionId: StudioHardwareActionId | null; bindingSource: 'default' | 'learned' | null } {
  const learned = learnedBindings.find((binding) => (
    binding.source === 'note'
    && binding.number === note
    && (binding.deviceName == null || binding.deviceName === deviceName)
  ));
  if (learned) {
    return { actionId: learned.actionId, bindingSource: 'learned' };
  }
  return NOTE_ACTION_MAP[note] ? { actionId: NOTE_ACTION_MAP[note], bindingSource: 'default' } : { actionId: null, bindingSource: null };
}

function resolveActionFromCc(controller: number, deviceName: string | null): { actionId: StudioHardwareActionId | null; bindingSource: 'default' | 'learned' | null } {
  const learned = learnedBindings.find((binding) => (
    binding.source === 'cc'
    && binding.number === controller
    && (binding.deviceName == null || binding.deviceName === deviceName)
  ));
  if (learned) {
    return { actionId: learned.actionId, bindingSource: 'learned' };
  }
  return CC_ACTION_MAP[controller] ? { actionId: CC_ACTION_MAP[controller], bindingSource: 'default' } : { actionId: null, bindingSource: null };
}

function formatMessage(input: Uint8Array): string {
  return Array.from(input).map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

function identifyStudioMidiDeviceProfile(inputName: string): StudioMidiDeviceProfile {
  const lower = inputName.toLowerCase();
  if (/(launchpad|push|maschine|pad|drum|launch control|akai apc|grid)/.test(lower)) {
    return {
      inputName,
      family: /launchpad|push|maschine|grid/.test(lower) ? 'grid-controller' : 'generic-pad',
      ready: true,
      notes: [
        'Pad-grid controller detected.',
        'Note and CC control should work immediately.',
      ],
    };
  }
  if (/(transport|mackie|hui|fader|motorized|control surface)/.test(lower)) {
    return {
      inputName,
      family: 'transport-surface',
      ready: true,
      notes: [
        'Transport/control-surface style device detected.',
        'Core transport and navigation actions are mapped.',
      ],
    };
  }
  if (/(keyboard|key|piano|controller)/.test(lower)) {
    return {
      inputName,
      family: 'keyboard',
      ready: true,
      notes: [
        'Keyboard-style controller detected.',
        'Learned mappings can bind notes or CC messages to ESL actions.',
      ],
    };
  }
  if (/(cc|knob|fader|encoder|dial|nano|launch control|x-touch|mix|master)/.test(lower)) {
    return {
      inputName,
      family: 'generic-cc',
      ready: true,
      notes: [
        'CC-heavy controller detected.',
        'Knobs and faders can be learned to ESL actions.',
      ],
    };
  }
  return {
    inputName,
    family: 'unknown',
    ready: false,
    notes: [
      'Unknown MIDI device profile.',
      'ESL will still listen for note and CC events, but a learned map may help.',
    ],
  };
}

function buildStudioMidiControlMessageSnapshot(
  raw: string | null,
  kind: StudioMidiControlMessageSnapshot['kind'],
  channel: number,
  number: number,
  value: number,
  actionId: StudioHardwareActionId | null,
  bindingSource: StudioMidiControlMessageSnapshot['bindingSource'],
  deviceName: string | null
): StudioMidiControlMessageSnapshot | null {
  if (!raw) return null;
  return {
    receivedAt: Date.now(),
    raw,
    kind,
    channel,
    number,
    value,
    actionId,
    bindingSource,
    deviceName,
  };
}

export function buildStudioMidiControlSnapshot(
  inputs: string[],
  lastMessage: string | null,
  lastMessageDetails: StudioMidiControlMessageSnapshot | null = null,
  learnTargetSnapshot: StudioMidiControlLearnTarget | null = null,
  learnedBindingsSnapshot: StudioMidiControlBinding[] = learnedBindings
): StudioMidiControlSnapshot {
  const detectedProfiles = inputs.map(identifyStudioMidiDeviceProfile);
  return {
    generatedAt: Date.now(),
    supported: typeof navigator !== 'undefined' && Boolean((navigator as Navigator & { requestMIDIAccess?: unknown }).requestMIDIAccess),
    plugAndPlayReady: inputs.length > 0 && detectedProfiles.some((profile) => profile.ready),
    connectedInputs: inputs,
    activeInputs: inputs.length,
    detectedProfiles,
    lastMessage,
    lastMessageDetails,
    learnTarget: learnTargetSnapshot,
    bindings: [...bindings, ...learnedBindingsSnapshot],
    learnedBindings: [...learnedBindingsSnapshot],
    notes: [
      'MIDI note and CC messages can drive the ESL hardware bridge.',
      'Pad/note and CC mappings are intentionally mirrored for common controllers.',
      'Use the runtime bridge to attach custom external controller software if needed.',
      'Learned bindings are persisted locally in the browser profile.',
      inputs.length > 0 ? `Detected ${detectedProfiles.filter((profile) => profile.ready).length} ready MIDI controller profile(s).` : 'No MIDI controller is currently connected.',
    ],
  };
}

export function serializeStudioMidiControlSnapshotJson(snapshot: StudioMidiControlSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function serializeStudioMidiControlBindingsJson(): string {
  return JSON.stringify(learnedBindings, null, 2);
}

export function importStudioMidiControlBindingsJson(json: string): StudioMidiControlBinding[] {
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('Expected an array of MIDI bindings.');
  }

  const nextBindings = parsed
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const candidate = entry as Partial<StudioMidiControlBinding>;
      if ((candidate.source !== 'note' && candidate.source !== 'cc') || typeof candidate.number !== 'number' || typeof candidate.actionId !== 'string') {
        return null;
      }
      return {
        source: candidate.source,
        number: candidate.number,
        actionId: candidate.actionId as StudioHardwareActionId,
        notes: typeof candidate.notes === 'string' && candidate.notes.trim().length > 0
          ? candidate.notes
          : `Learned ${candidate.source.toUpperCase()} ${candidate.number}`,
        deviceName: typeof candidate.deviceName === 'string' ? candidate.deviceName : null,
      } satisfies StudioMidiControlBinding;
    })
    .filter((entry): entry is StudioMidiControlBinding => Boolean(entry));

  learnedBindings = nextBindings;
  persistLearnedBindings();
  publishCurrentSnapshot();
  return [...learnedBindings];
}

export function clearStudioMidiControlBindings(): StudioMidiControlBinding[] {
  learnedBindings = [];
  persistLearnedBindings();
  publishCurrentSnapshot();
  return [];
}

export function setStudioMidiControlLearnTarget(actionId: StudioHardwareActionId | null, source: 'note' | 'cc' = 'note'): void {
  learnTarget = actionId ? { actionId, source } : null;
  publishCurrentSnapshot();
}

export function learnStudioMidiControlBindingFromMessage(
  message: StudioMidiControlMessageSnapshot | null
): StudioMidiControlBinding | null {
  if (!message || !learnTarget) return null;
  const source = message.kind === 'cc' ? 'cc' : 'note';
  if (source !== learnTarget.source) return null;
  const number = message.number;
  const binding: StudioMidiControlBinding = {
    source,
    number,
    actionId: learnTarget.actionId,
    notes: `Learned ${source.toUpperCase()} ${number}`,
    deviceName: message.deviceName || null,
  };
  learnedBindings = [
    ...learnedBindings.filter((entry) => !(entry.source === source && entry.number === number)),
    binding,
  ];
  persistLearnedBindings();
  publishCurrentSnapshot();
  return binding;
}

export async function attachStudioMidiControlBridge(
  bridge: StudioHardwareControlBridge | null,
  onSnapshot?: (snapshot: StudioMidiControlSnapshot) => void
): Promise<() => void> {
  snapshotSink = onSnapshot ?? null;
  if (typeof navigator === 'undefined' || !('requestMIDIAccess' in navigator)) {
    latestConnectedInputs = [];
    latestLastMessage = null;
    latestLastMessageDetails = null;
    publishCurrentSnapshot();
    return () => undefined;
  }

  let access: MIDIAccess;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch (error) {
    latestConnectedInputs = [];
    latestLastMessage = null;
    latestLastMessageDetails = null;
    publishCurrentSnapshot();
    console.warn('[StudioMidi] MIDI access unavailable', error);
    return () => undefined;
  }
  let lastMessage: string | null = null;
  let lastMessageDetails: StudioMidiControlMessageSnapshot | null = null;

  const publish = () => {
    const inputNames = [...access.inputs.values()].map((input) => input.name || 'MIDI Input');
    latestConnectedInputs = inputNames;
    latestLastMessage = lastMessage;
    latestLastMessageDetails = lastMessageDetails;
    publishCurrentSnapshot();
  };

  const dispatch = (actionId: StudioHardwareActionId, payload: Record<string, unknown>) => {
    if (!bridge) return;
    void bridge.invoke(actionId, payload).catch(() => undefined);
  };

  const handleMessage = (event: MIDIMessageEvent, sourceDeviceName: string | null) => {
    const bytes = event.data;
    if (!bytes || bytes.length < 2) return;
    lastMessage = formatMessage(bytes);
    const status = bytes[0] || 0;
    const data1 = bytes[1] || 0;
    const data2 = bytes[2] || 0;
    const command = status & 0xf0;
    const channel = status & 0x0f;

    if (command === 0x90 && data2 > 0) {
      const { actionId, bindingSource } = resolveActionFromNote(data1, sourceDeviceName);
      if (actionId) {
        dispatch(actionId, { source: 'midi', type: 'note-on', note: data1, velocity: data2, channel });
      }
      lastMessageDetails = buildStudioMidiControlMessageSnapshot(lastMessage, 'note-on', channel, data1, data2, actionId, bindingSource, sourceDeviceName);
    } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
      const { actionId, bindingSource } = resolveActionFromNote(data1, sourceDeviceName);
      if (actionId === 'transport.play' || actionId === 'transport.pause') {
        dispatch(actionId, { source: 'midi', type: 'note-off', note: data1, channel });
      }
      lastMessageDetails = buildStudioMidiControlMessageSnapshot(lastMessage, 'note-off', channel, data1, data2, actionId, bindingSource, sourceDeviceName);
    } else if (command === 0xb0) {
      const { actionId, bindingSource } = resolveActionFromCc(data1, sourceDeviceName);
      if (actionId) {
        dispatch(actionId, { source: 'midi', type: 'cc', controller: data1, value: data2, channel });
      }
      lastMessageDetails = buildStudioMidiControlMessageSnapshot(lastMessage, 'cc', channel, data1, data2, actionId, bindingSource, sourceDeviceName);
    } else {
      lastMessageDetails = buildStudioMidiControlMessageSnapshot(lastMessage, 'other', channel, data1, data2, null, null, sourceDeviceName);
    }

    publish();
  };

  access.inputs.forEach((input) => {
    const deviceName = input.name || 'MIDI Input';
    input.onmidimessage = (event) => handleMessage(event, deviceName);
  });

  access.onstatechange = () => {
    access.inputs.forEach((input) => {
      const deviceName = input.name || 'MIDI Input';
      input.onmidimessage = (event) => handleMessage(event, deviceName);
    });
    publish();
  };

  publish();

  return () => {
    access.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    access.onstatechange = null;
    if (snapshotSink === onSnapshot) {
      snapshotSink = null;
    }
  };
}
