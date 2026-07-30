import JSZip from 'jszip';
import { AlbumTrackMeta } from '../components/AlbumSequencerPanel';
import { generateCueSheet } from './cueSheetGenerator';
import { encoderService } from './encoderService';
import { offlineRenderService } from './offlineRenderService';
import { TimelineState } from '../types';

export class AlbumExportService {
  /**
   * Generates a DDP Prep ZIP packet containing individual WAV masters and a CUE sheet.
   */
  public async generateDdpPrepZip(
    albumTitle: string,
    albumArtist: string,
    tracks: AlbumTrackMeta[],
    renderedBuffers: AudioBuffer[]
  ): Promise<Blob> {
    const zip = new JSZip();

    // 1. Generate individual WAV files
    for (let i = 0; i < tracks.length; i++) {
      const track = tracks[i];
      const buffer = renderedBuffers[i];
      if (!buffer) continue;

      // Encode to WAV
      const wavBlob = await encoderService.exportAsWav(buffer);
      
      const trackNum = (i + 1).toString().padStart(2, '0');
      const safeTitle = track.title.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `${trackNum}_${safeTitle}.wav`;

      zip.file(fileName, wavBlob);
    }

    // 2. Generate CUE sheet
    const cueString = generateCueSheet(albumTitle, albumArtist, tracks);
    zip.file('ESL_Master.cue', cueString);

    // 3. Generate Album Info / DDP Metadata text file
    let info = `Echo Sound Lab - DDP Prep Info\n`;
    info += `=================================\n`;
    info += `Album: ${albumTitle}\n`;
    info += `Artist: ${albumArtist}\n`;
    info += `Date: ${new Date().toISOString()}\n\n`;
    
    tracks.forEach((t, i) => {
      info += `Track ${i + 1}: ${t.title} (${t.artist})\n`;
      info += `ISRC: ${t.isrc || 'None'}\n`;
      info += `Gap: ${t.gapSeconds}s\n\n`;
    });

    zip.file('DDP_INFO.txt', info);

    // 4. Bundle into final ZIP Blob
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Helper to trigger download in the browser
   */
  public downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

export const albumExportService = new AlbumExportService();
