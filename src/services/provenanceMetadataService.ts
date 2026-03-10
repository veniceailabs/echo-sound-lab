import { SignedRenderManifest } from './provenanceManifestService';
import { hashManifestPayload } from './provenanceSigning';

const PROVENANCE_REF_DESCRIPTION = 'ESL_PROVENANCE_REF';
const PROVENANCE_REF_PREFIX = `${PROVENANCE_REF_DESCRIPTION}:`;

export interface EmbeddedProvenanceReference {
  schemaVersion: 'esl.provenance-ref.v1';
  manifestFileName: string;
  manifestHash: string;
  signature: string;
  signatureAlgorithm: 'hmac-sha256-v1';
  keyId: string;
  signedAt: number;
}

export interface EmbeddedProvenanceVerification {
  ok: boolean;
  reason?: string;
  reference?: EmbeddedProvenanceReference;
}

function splitFileName(fileName: string): { baseName: string; extension: string } {
  const index = fileName.lastIndexOf('.');
  if (index <= 0 || index === fileName.length - 1) {
    return { baseName: fileName, extension: '' };
  }
  return {
    baseName: fileName.slice(0, index),
    extension: fileName.slice(index + 1).toLowerCase(),
  };
}

function writeUint32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, true);
  return bytes;
}

function writeUint32BE(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, value >>> 0, false);
  return bytes;
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, true);
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, false);
}

function toAsciiBytes(value: string): Uint8Array {
  const out = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i++) {
    out[i] = value.charCodeAt(i) & 0xff;
  }
  return out;
}

function fromAsciiBytes(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function trimNulls(value: string): string {
  return value.replace(/\u0000+$/g, '');
}

function parseEmbeddedReference(raw: string): EmbeddedProvenanceReference | null {
  if (!raw.startsWith(PROVENANCE_REF_PREFIX)) return null;
  const jsonPart = raw.slice(PROVENANCE_REF_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(jsonPart) as EmbeddedProvenanceReference;
    if (!parsed || parsed.schemaVersion !== 'esl.provenance-ref.v1') return null;
    if (!parsed.manifestFileName || !parsed.manifestHash || !parsed.signature) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildInfoSubChunk(id: string, textValue: string): Uint8Array {
  const textBytes = new TextEncoder().encode(textValue);
  const payload = concatBytes(textBytes, new Uint8Array([0]));
  const padded = payload.length % 2 === 0 ? payload : concatBytes(payload, new Uint8Array([0]));
  return concatBytes(toAsciiBytes(id), writeUint32LE(payload.length), padded);
}

function createWavInfoChunk(reference: EmbeddedProvenanceReference): Uint8Array {
  const payloadText = `${PROVENANCE_REF_PREFIX}${JSON.stringify(reference)}`;
  const infoHeader = toAsciiBytes('INFO');
  const subChunks = concatBytes(
    buildInfoSubChunk('ISFT', 'Echo Sound Lab Provenance v1'),
    buildInfoSubChunk('ICMT', payloadText)
  );
  const listPayload = concatBytes(infoHeader, subChunks);
  const listChunkHeader = concatBytes(toAsciiBytes('LIST'), writeUint32LE(listPayload.length));
  const paddedListPayload =
    listPayload.length % 2 === 0 ? listPayload : concatBytes(listPayload, new Uint8Array([0]));
  return concatBytes(listChunkHeader, paddedListPayload);
}

function embedWavReference(source: Uint8Array, reference: EmbeddedProvenanceReference): Uint8Array {
  const isRiff =
    source.length >= 12 &&
    fromAsciiBytes(source.slice(0, 4)) === 'RIFF' &&
    fromAsciiBytes(source.slice(8, 12)) === 'WAVE';
  if (!isRiff) {
    return source;
  }

  const infoChunk = createWavInfoChunk(reference);
  const output = concatBytes(source, infoChunk);
  const view = new DataView(output.buffer, output.byteOffset, output.byteLength);
  view.setUint32(4, output.length - 8, true);
  return output;
}

function encodeSyncSafe32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  out[0] = (value >> 21) & 0x7f;
  out[1] = (value >> 14) & 0x7f;
  out[2] = (value >> 7) & 0x7f;
  out[3] = value & 0x7f;
  return out;
}

function decodeSyncSafe32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function buildId3TxxxFrame(description: string, value: string): Uint8Array {
  const descBytes = new TextEncoder().encode(description);
  const valueBytes = new TextEncoder().encode(value);
  const payload = concatBytes(new Uint8Array([0x00]), descBytes, new Uint8Array([0x00]), valueBytes);
  return concatBytes(
    toAsciiBytes('TXXX'),
    writeUint32BE(payload.length),
    new Uint8Array([0x00, 0x00]),
    payload
  );
}

function embedMp3Reference(source: Uint8Array, reference: EmbeddedProvenanceReference): Uint8Array {
  const hasId3 = source.length >= 10 && fromAsciiBytes(source.slice(0, 3)) === 'ID3';
  const sourceAudio = hasId3 ? source.slice(10 + decodeSyncSafe32(source, 6)) : source;
  const value = JSON.stringify(reference);
  const frame = buildId3TxxxFrame(PROVENANCE_REF_DESCRIPTION, value);
  const header = concatBytes(
    toAsciiBytes('ID3'),
    new Uint8Array([0x03, 0x00, 0x00]),
    encodeSyncSafe32(frame.length)
  );
  return concatBytes(header, frame, sourceAudio);
}

function extractWavReference(source: Uint8Array): EmbeddedProvenanceReference | null {
  const isRiff =
    source.length >= 12 &&
    fromAsciiBytes(source.slice(0, 4)) === 'RIFF' &&
    fromAsciiBytes(source.slice(8, 12)) === 'WAVE';
  if (!isRiff) return null;

  let cursor = 12;
  let found: EmbeddedProvenanceReference | null = null;

  while (cursor + 8 <= source.length) {
    const chunkId = fromAsciiBytes(source.slice(cursor, cursor + 4));
    const chunkSize = readUint32LE(source, cursor + 4);
    const dataStart = cursor + 8;
    const dataEnd = Math.min(source.length, dataStart + chunkSize);

    if (chunkId === 'LIST' && chunkSize >= 4 && dataStart + 4 <= source.length) {
      const listType = fromAsciiBytes(source.slice(dataStart, dataStart + 4));
      if (listType === 'INFO') {
        let subCursor = dataStart + 4;
        while (subCursor + 8 <= dataEnd) {
          const subId = fromAsciiBytes(source.slice(subCursor, subCursor + 4));
          const subSize = readUint32LE(source, subCursor + 4);
          const subDataStart = subCursor + 8;
          const subDataEnd = Math.min(dataEnd, subDataStart + subSize);
          if (subId === 'ICMT') {
            const text = trimNulls(new TextDecoder().decode(source.slice(subDataStart, subDataEnd)));
            const parsed = parseEmbeddedReference(text);
            if (parsed) found = parsed;
          }
          subCursor = subDataStart + subSize + (subSize % 2);
        }
      }
    }

    cursor = dataStart + chunkSize + (chunkSize % 2);
  }

  return found;
}

function parseTxxxFramePayload(payload: Uint8Array): { description: string; value: string } | null {
  if (payload.length === 0) return null;
  const encoding = payload[0];
  if (encoding !== 0x00 && encoding !== 0x03) return null;

  const body = payload.slice(1);
  const separatorIndex = body.indexOf(0x00);
  if (separatorIndex < 0) return null;

  const description = new TextDecoder().decode(body.slice(0, separatorIndex));
  const value = new TextDecoder().decode(body.slice(separatorIndex + 1));
  return { description, value };
}

function extractMp3Reference(source: Uint8Array): EmbeddedProvenanceReference | null {
  const hasId3 = source.length >= 10 && fromAsciiBytes(source.slice(0, 3)) === 'ID3';
  if (!hasId3) return null;

  const tagSize = decodeSyncSafe32(source, 6);
  const tagEnd = Math.min(source.length, 10 + tagSize);
  let cursor = 10;
  let found: EmbeddedProvenanceReference | null = null;

  while (cursor + 10 <= tagEnd) {
    const frameId = fromAsciiBytes(source.slice(cursor, cursor + 4));
    const frameSize = readUint32BE(source, cursor + 4);
    if (!frameId.trim() || frameSize <= 0) break;
    const frameDataStart = cursor + 10;
    const frameDataEnd = Math.min(tagEnd, frameDataStart + frameSize);

    if (frameId === 'TXXX') {
      const parsedFrame = parseTxxxFramePayload(source.slice(frameDataStart, frameDataEnd));
      if (parsedFrame && parsedFrame.description === PROVENANCE_REF_DESCRIPTION) {
        const parsedRef = parseEmbeddedReference(`${PROVENANCE_REF_PREFIX}${parsedFrame.value}`);
        if (parsedRef) found = parsedRef;
      }
    }

    cursor = frameDataStart + frameSize;
  }

  return found;
}

export function buildEmbeddedProvenanceReference(
  signedManifest: SignedRenderManifest,
  manifestFileName: string
): EmbeddedProvenanceReference {
  return {
    schemaVersion: 'esl.provenance-ref.v1',
    manifestFileName,
    manifestHash: signedManifest.manifestHash,
    signature: signedManifest.signature,
    signatureAlgorithm: signedManifest.signatureAlgorithm,
    keyId: signedManifest.keyId,
    signedAt: signedManifest.signedAt,
  };
}

export async function embedProvenanceReferenceInAudio(
  audioBlob: Blob,
  audioFileName: string,
  reference: EmbeddedProvenanceReference
): Promise<Blob> {
  const source = new Uint8Array(await audioBlob.arrayBuffer());
  const { extension } = splitFileName(audioFileName);

  let embeddedBytes = source;
  if (extension === 'wav') {
    embeddedBytes = embedWavReference(source, reference);
  } else if (extension === 'mp3') {
    embeddedBytes = embedMp3Reference(source, reference);
  }

  return new Blob([embeddedBytes], {
    type: audioBlob.type || (extension === 'mp3' ? 'audio/mpeg' : 'audio/wav'),
  });
}

export async function extractEmbeddedProvenanceReference(
  audioBlob: Blob,
  audioFileName: string
): Promise<EmbeddedProvenanceReference | null> {
  const source = new Uint8Array(await audioBlob.arrayBuffer());
  const { extension } = splitFileName(audioFileName);
  if (extension === 'wav') return extractWavReference(source);
  if (extension === 'mp3') return extractMp3Reference(source);
  return null;
}

export async function verifyEmbeddedProvenanceReference(
  audioBlob: Blob,
  audioFileName: string,
  signedManifest: SignedRenderManifest,
  manifestFileName: string
): Promise<EmbeddedProvenanceVerification> {
  const reference = await extractEmbeddedProvenanceReference(audioBlob, audioFileName);
  if (!reference) {
    return { ok: false, reason: 'embedded_reference_missing' };
  }

  if (reference.manifestFileName !== manifestFileName) {
    return { ok: false, reason: 'manifest_file_name_mismatch', reference };
  }

  const expectedHash = await hashManifestPayload(signedManifest.manifest);
  if (reference.manifestHash !== expectedHash) {
    return { ok: false, reason: 'manifest_hash_mismatch', reference };
  }

  if (reference.signature !== signedManifest.signature) {
    return { ok: false, reason: 'signature_mismatch', reference };
  }

  if (reference.keyId !== signedManifest.keyId) {
    return { ok: false, reason: 'key_id_mismatch', reference };
  }

  return { ok: true, reference };
}
