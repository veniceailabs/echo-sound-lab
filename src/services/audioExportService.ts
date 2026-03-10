import { createSignedRenderManifest, SignedRenderManifest } from './provenanceManifestService';
import {
  buildEmbeddedProvenanceReference,
  embedProvenanceReferenceInAudio,
} from './provenanceMetadataService';

export interface DownloadAudioWithManifestOptions {
  audioBlob: Blob;
  audioFileName: string;
  creatorId?: string;
}

export interface ExportWithManifestResult {
  audioFileName: string;
  manifestFileName: string;
  signedManifest: SignedRenderManifest;
  embeddedMetadata: boolean;
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function splitFileName(fileName: string): { baseName: string; extension: string } {
  const index = fileName.lastIndexOf('.');
  if (index <= 0 || index === fileName.length - 1) {
    return { baseName: fileName, extension: 'wav' };
  }
  return {
    baseName: fileName.slice(0, index),
    extension: fileName.slice(index + 1).toLowerCase(),
  };
}

export async function downloadAudioWithManifest(
  options: DownloadAudioWithManifestOptions
): Promise<ExportWithManifestResult> {
  const parsedName = splitFileName(options.audioFileName);
  const signedManifest = await createSignedRenderManifest(
    options.audioFileName,
    parsedName.extension,
    options.creatorId
  );

  const manifestFileName = `${parsedName.baseName}.manifest.json`;
  const manifestBlob = new Blob([JSON.stringify(signedManifest, null, 2)], {
    type: 'application/json',
  });
  const reference = buildEmbeddedProvenanceReference(signedManifest, manifestFileName);
  const canEmbedInAudio = parsedName.extension === 'wav' || parsedName.extension === 'mp3';
  const embeddedAudioBlob = await embedProvenanceReferenceInAudio(
    options.audioBlob,
    options.audioFileName,
    reference
  );

  triggerDownload(embeddedAudioBlob, options.audioFileName);
  triggerDownload(manifestBlob, manifestFileName);

  return {
    audioFileName: options.audioFileName,
    manifestFileName,
    signedManifest,
    embeddedMetadata: canEmbedInAudio,
  };
}
