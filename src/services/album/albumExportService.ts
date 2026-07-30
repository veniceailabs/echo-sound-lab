import JSZip from 'jszip';
import { AlbumTrackMeta } from '../../components/AlbumSequencerPanel';

export const albumExportService = {
  /**
   * Generates a standard .cue sheet string based on track sequence and gaps
   */
  generateCueSheet(tracks: AlbumTrackMeta[], albumTitle: string, albumArtist: string): string {
    let cue = `REM GENRE "Unknown"\n`;
    cue += `REM DATE "${new Date().getFullYear()}"\n`;
    cue += `PERFORMER "${albumArtist || 'Unknown Artist'}"\n`;
    cue += `TITLE "${albumTitle || 'Album Title'}"\n`;

    let totalFrames = 0; // 75 frames per second

    tracks.forEach((track, index) => {
      const trackNum = (index + 1).toString().padStart(2, '0');
      cue += `FILE "${track.title}.wav" WAVE\n`;
      cue += `  TRACK ${trackNum} AUDIO\n`;
      cue += `    TITLE "${track.title}"\n`;
      if (track.artist || albumArtist) {
        cue += `    PERFORMER "${track.artist || albumArtist}"\n`;
      }
      if (track.isrc) {
        cue += `    ISRC ${track.isrc}\n`;
      }
      
      // Index 00 represents the pause before the track
      // Index 01 represents the start of the audio
      if (index === 0) {
        cue += `    INDEX 01 00:00:00\n`;
      } else {
        const gapFrames = Math.round((track.gapSeconds || 2) * 75);
        const prevDurationFrames = 75 * 180; // Placeholder until we measure actual duration
        
        totalFrames += prevDurationFrames;
        
        const m00 = Math.floor(totalFrames / (75 * 60)).toString().padStart(2, '0');
        const s00 = Math.floor((totalFrames / 75) % 60).toString().padStart(2, '0');
        const f00 = (totalFrames % 75).toString().padStart(2, '0');
        cue += `    INDEX 00 ${m00}:${s00}:${f00}\n`;

        totalFrames += gapFrames;
        const m01 = Math.floor(totalFrames / (75 * 60)).toString().padStart(2, '0');
        const s01 = Math.floor((totalFrames / 75) % 60).toString().padStart(2, '0');
        const f01 = (totalFrames % 75).toString().padStart(2, '0');
        cue += `    INDEX 01 ${m01}:${s01}:${f01}\n`;
      }
    });

    return cue;
  },

  /**
   * Generates a DDP Prep Packet (a folder structure ready for DDP authoring)
   */
  async generateAlbumZip(tracks: AlbumTrackMeta[], albumTitle: string, albumArtist: string): Promise<Blob> {
    const zip = new JSZip();

    // 1. Root folder
    const folderName = `${albumArtist || 'Artist'} - ${albumTitle || 'Album'} [ESL Master]`;
    const root = zip.folder(folderName);
    if (!root) throw new Error('Failed to create root zip folder');

    // 2. Audio Files folder
    const audioFolder = root.folder('Audio Files');
    if (audioFolder) {
      tracks.forEach((track, idx) => {
        const trackNum = (idx + 1).toString().padStart(2, '0');
        const filename = `${trackNum} - ${track.title}.wav`;
        // In reality, we'd fetch the actual processed AudioBuffer and encode to WAV here.
        // For the mock, we just use the original file blob or a placeholder.
        audioFolder.file(filename, track.file);
      });
    }

    // 3. Generate Cue Sheet
    const cueContent = this.generateCueSheet(tracks, albumTitle, albumArtist);
    root.file(`${albumTitle || 'Album'}.cue`, cueContent);

    // 4. Metadata / Report
    const reportContent = `Echo Sound Lab v2.5 - Album Master Report\n\n` +
      `Album: ${albumTitle}\n` +
      `Artist: ${albumArtist}\n` +
      `Date: ${new Date().toISOString()}\n\n` +
      `Tracks:\n` +
      tracks.map((t, i) => `${i+1}. ${t.title} [ISRC: ${t.isrc || 'None'}] - Gap: ${t.gapSeconds}s`).join('\n');
    
    root.file('ESL_Mastering_Report.txt', reportContent);

    // 5. DDP Auth Folder (Placeholder to signal intent to authoring houses)
    const ddpFolder = root.folder('DDP_Image_Prep');
    if (ddpFolder) {
      ddpFolder.file('README.txt', 'This folder is prepared for DDP authoring. Combine the .cue sheet and WAV files to write the DDP image sequence.');
    }

    return await zip.generateAsync({ type: 'blob' });
  }
};
