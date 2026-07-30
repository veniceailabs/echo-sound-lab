import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRecorder } from '../../hooks/useRecorder';
import { mixCombinerService } from '../../services/mixCombinerService';
import { audioEngine } from '../../services/audioEngine'; // for playback
import { consolePanel, consoleScreen, consoleButton, consoleToggleActive, hardwareLabel } from '../../utils/consoleStyles';
import { cn } from '../../utils/secondLightStyles';

interface TrackingDeskProps {
  onTakeConfirmed?: (mixedBuffer: AudioBuffer) => void;
}

export const TrackingDesk: React.FC<TrackingDeskProps> = ({ onTakeConfirmed }) => {
  const [instrumentalFile, setInstrumentalFile] = useState<File | null>(null);
  const [instrumentalBuffer, setInstrumentalBuffer] = useState<AudioBuffer | null>(null);
  
  const { startRecording, stopRecording, recordingState, audioBlob } = useRecorder();
  const [isProcessing, setIsProcessing] = useState(false);
  const beatAudioRef = useRef<HTMLAudioElement | null>(null);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInstrumentalFile(file);
    
    // Decode buffer for mixing later
    const ctx = new AudioContext();
    const arrayBuf = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    setInstrumentalBuffer(decoded);
    ctx.close();
  };
  
  const handleToggleRecord = () => {
    if (recordingState === 'recording') {
      stopRecording();
      if (beatAudioRef.current) {
        beatAudioRef.current.pause();
        beatAudioRef.current.currentTime = 0;
      }
    } else {
      startRecording();
      if (beatAudioRef.current) {
        beatAudioRef.current.play();
      }
    }
  };

  const handleMixAndMaster = async () => {
    if (!instrumentalBuffer || !audioBlob) return;
    setIsProcessing(true);
    
    try {
      const ctx = new AudioContext();
      
      // Decode the recorded vocal blob
      const vocalArrayBuf = await audioBlob.arrayBuffer();
      const vocalBuffer = await ctx.decodeAudioData(vocalArrayBuf);
      
      // Mix them down
      const mixedBuffer = await mixCombinerService.mixDown(ctx, instrumentalBuffer, vocalBuffer, -3, 0);
      
      ctx.close();
      
      if (onTakeConfirmed) {
        onTakeConfirmed(mixedBuffer);
      }
    } catch (err) {
      console.error('Failed to mix down track', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(consolePanel, "p-8 space-y-8")}
    >
      {/* 1. Instrumental Upload */}
      <div>
        <h3 className={cn(hardwareLabel, "mb-4")}>1. Load Beat</h3>
        <label className={cn(consoleScreen, "flex items-center justify-center w-full h-32 cursor-pointer hover:border-amber-500/50 transition-all")}>
          <span className="text-sm">
            {instrumentalFile ? instrumentalFile.name : 'Click to Upload Instrumental'}
          </span>
          <input type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
        </label>
        {instrumentalFile && (
          <audio ref={beatAudioRef} src={URL.createObjectURL(instrumentalFile)} className="hidden" />
        )}
      </div>

      {/* 2. Recording Transport */}
      <div>
        <h3 className="text-xl font-bold text-white mb-4">2. Tracking Transport</h3>
        <div className="flex items-center gap-6 p-6 bg-black/40 rounded-2xl border border-white/5 shadow-inner">
          <button 
            onClick={handleToggleRecord}
            disabled={!instrumentalBuffer}
            className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
              recordingState === 'recording' 
                ? 'bg-red-500/20 border-2 border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]' 
                : 'bg-white/5 border border-white/10 hover:bg-red-500/10 hover:border-red-500/30'
            }`}
          >
            <div className={`rounded-full transition-all ${
              recordingState === 'recording' ? 'w-6 h-6 bg-red-500' : 'w-5 h-5 bg-red-400 rounded-full'
            }`} />
          </button>
          
          <div className="flex-1">
            <p className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">Status</p>
            <p className={`text-lg font-bold ${recordingState === 'recording' ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
              {recordingState === 'recording' ? 'RECORDING VOCALS...' : audioBlob ? 'TAKE RECORDED' : 'READY TO TRACK'}
            </p>
          </div>
        </div>
      </div>

      {/* 3. Mix & Deliver */}
      {audioBlob && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <h3 className="text-xl font-bold text-white mb-4">3. Finalize Take</h3>
          <button 
            onClick={handleMixAndMaster}
            disabled={isProcessing}
            className="w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-white shadow-[0_0_20px_rgba(249,115,22,0.3)] disabled:opacity-50"
          >
            {isProcessing ? 'Mixing Down...' : 'Combine & Send to Toronto Profile'}
          </button>
        </motion.div>
      )}
    </motion.div>
  );
};
