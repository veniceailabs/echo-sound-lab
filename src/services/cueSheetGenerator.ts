import { AlbumTrackMeta } from '../components/AlbumSequencerPanel';

// Format time in CUE standard: MM:SS:FF (Frames are 1/75th of a second)
export function formatCueTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 75);
  
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

export function generateCueSheet(
  albumTitle: string, 
  albumArtist: string, 
  tracks: AlbumTrackMeta[]
): string {
  let cue = '';
  
  // Header
  cue += `TITLE "${albumTitle}"\n`;
  cue += `PERFORMER "${albumArtist}"\n`;

  tracks.forEach((track, index) => {
    const trackNum = (index + 1).toString().padStart(2, '0');
    // For individual files, we declare the file right before the track
    const safeTitle = track.title.replace(/[^a-zA-Z0-9]/g, '_');
    cue += `FILE "${trackNum}_${safeTitle}.wav" WAVE\n`;
    cue += `  TRACK ${trackNum} AUDIO\n`;
    cue += `    TITLE "${track.title}"\n`;
    cue += `    PERFORMER "${track.artist}"\n`;
    if (track.isrc) {
      cue += `    ISRC ${track.isrc.replace(/[^a-zA-Z0-9]/g, '')}\n`;
    }
    
    // INDEX 01 is the start of the audio in this file, so always 00:00:00 for individual files
    // INDEX 00 would be pregap, but for individual files the gap is usually silence prepended to the file or just INDEX 01.
    // Red Book standard usually dictates INDEX 01. We'll simplify to INDEX 01 for standard playback.
    
    // If the user set a gap, we might prepend silence to the exported WAV, 
    // so INDEX 01 stays 00:00:00 within that specific WAV file.
    cue += `    INDEX 01 00:00:00\n`;
  });

  return cue;
}
