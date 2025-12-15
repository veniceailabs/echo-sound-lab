import React, { useState, useEffect } from 'react';
import { EchoReport, EchoAction, RevisionLog, AudioMetrics, ProcessingConfig } from '../types';
import { generateEchoReportCard, ShareableCard, GenerateEchoReportCardOptions } from '../services/venumEngine';
import { GenreProfile } from '../services/genreProfiles';
import { ShareableCardModal, NudgeBanner, ShareButton } from './ShareableCardModal';

interface EchoReportPanelProps {
  echoReport: EchoReport | null;
  onApplyEchoAction: (action: EchoAction, updatedValues: any) => Promise<boolean>;
  isProcessing: boolean;
  echoActionStatus: 'idle' | 'success' | 'error';
  echoActionError: string | null;
  revisionLog: RevisionLog;
  onRevertRevision: (entry: any) => Promise<void>;
  onShowRevisionLogModal: () => void;
  echoReportStatus: 'idle' | 'loading' | 'success' | 'error';
  onRetryEchoReport: (metrics?: AudioMetrics) => void;
  onShowSystemCheck: () => void;
  onCopyDebugLog: () => Promise<void>;
  onGenerateReport?: () => void;
  errorMessage?: string | null;
  referenceTrackName?: string;
  // V.E.N.U.M. props
  beforeMetrics?: AudioMetrics | null;
  afterMetrics?: AudioMetrics | null;
  genreProfile?: GenreProfile | null;
  trackName?: string;
  processedConfig?: ProcessingConfig; // Add processedConfig to props
}

// Plugin Icons - Small white SVG icons representing each fix type
const PluginIcon: React.FC<{ type: string }> = ({ type }) => {
  const getIcon = () => {
    switch (type) {
      case 'EQ':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* EQ curve with bands */}
            <path d="M2 12 Q 6 8, 8 12 T 12 12 Q 14 16, 16 12 T 20 12 L 22 12" strokeLinecap="round"/>
            <circle cx="8" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="16" cy="12" r="1.5" fill="currentColor"/>
          </svg>
        );

      case 'Compression':
      case 'Dynamics':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Compression curve with threshold */}
            <path d="M4 20 L 10 10 L 20 6" strokeLinecap="round"/>
            <path d="M4 4 L 20 20" stroke="currentColor" strokeWidth="1" opacity="0.3" strokeDasharray="2,2"/>
          </svg>
        );

      case 'Limiter':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Brick wall limiter */}
            <path d="M4 20 L 10 10 L 14 6 L 20 6" strokeLinecap="round"/>
            <line x1="14" y1="3" x2="14" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
          </svg>
        );

      case 'Stereo':
      case 'Imaging':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Stereo arrows showing width */}
            <path d="M12 6 L 12 18" strokeLinecap="round"/>
            <path d="M6 12 L 2 12 M 2 8 L 2 16" strokeLinecap="round"/>
            <path d="M18 12 L 22 12 M 22 8 L 22 16" strokeLinecap="round"/>
            <path d="M8 10 L 6 12 L 8 14" strokeLinecap="round" fill="none"/>
            <path d="M16 10 L 18 12 L 16 14" strokeLinecap="round" fill="none"/>
          </svg>
        );

      case 'Saturation':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Wave with harmonic distortion */}
            <path d="M2 12 Q 4 6, 6 12 T 10 12 Q 12 18, 14 12 T 18 12 Q 20 6, 22 12" strokeLinecap="round"/>
            <path d="M2 12 Q 4 8, 6 12 T 10 12 Q 12 16, 14 12 T 18 12 Q 20 8, 22 12" strokeLinecap="round" opacity="0.4"/>
          </svg>
        );

      case 'Reverb':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Sound waves spreading */}
            <circle cx="12" cy="12" r="3" strokeWidth="2"/>
            <circle cx="12" cy="12" r="6" strokeWidth="1.5" opacity="0.6"/>
            <circle cx="12" cy="12" r="9" strokeWidth="1" opacity="0.3"/>
          </svg>
        );

      case 'De-Esser':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* S frequency with notch */}
            <path d="M8 7 Q 12 5, 12 9 Q 12 13, 8 11 Q 4 13, 8 17 Q 12 19, 12 15 Q 12 11, 16 13" strokeLinecap="round"/>
            <path d="M18 4 L 14 20" strokeLinecap="round"/>
          </svg>
        );

      case 'Dynamic EQ':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* EQ curve with compression indicator */}
            <path d="M2 12 Q 6 8, 8 12 T 12 12 Q 14 16, 16 12 T 20 12" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <path d="M18 8 L 22 4 M 18 16 L 22 20" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
        );

      case 'Transient':
      case 'Transient Shaper':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Sharp transient spike */}
            <path d="M2 20 L 8 16 L 12 4 L 14 20 L 22 20" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        );

      case 'Multiband Dynamics':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Multiple compression curves */}
            <path d="M2 20 L 6 14" strokeLinecap="round"/>
            <path d="M8 20 L 12 10 L 14 8" strokeLinecap="round"/>
            <path d="M16 20 L 20 12 L 22 10" strokeLinecap="round"/>
          </svg>
        );

      case 'Color Filter':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Frequency filter shape */}
            <path d="M2 20 L 8 8 L 16 8 L 22 20" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M8 8 L 8 20 M 16 8 L 16 20" strokeLinecap="round" opacity="0.4"/>
          </svg>
        );

      case 'Delay':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Echo/delay taps */}
            <circle cx="6" cy="12" r="2" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.7"/>
            <circle cx="17" cy="12" r="1" fill="currentColor" opacity="0.4"/>
            <path d="M8 12 L 10.5 12 M 13.5 12 L 16 12" strokeLinecap="round"/>
          </svg>
        );

      case 'Exciter':
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            {/* Harmonic enhancement */}
            <path d="M2 12 Q 6 6, 10 12 T 18 12" strokeLinecap="round"/>
            <path d="M2 12 Q 6 10, 10 12 T 18 12" strokeLinecap="round" opacity="0.5"/>
            <path d="M18 8 L 22 4 M 18 12 L 22 12 M 18 16 L 22 20" strokeLinecap="round" strokeWidth="1.5"/>
          </svg>
        );

      default:
        return (
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8"/>
          </svg>
        );
    }
  };

  return <div className="w-6 h-6 flex-shrink-0">{getIcon()}</div>;
};

// EQ Plugin UI
const EQPluginUI: React.FC<{
  bands: NonNullable<EchoAction['bands']>;
  enabledBands: Record<number, boolean>;
  onToggle: (i: number) => void;
  bandValues: Record<number, { freqHz: number; gainDb: number; q?: number }>;
  onValueChange: (i: number, field: string, value: number) => void;
}> = ({ bands, enabledBands, onToggle, bandValues, onValueChange }) => (
  <div className="space-y-3">
    {/* Visual EQ Curve */}
    <div className="bg-slate-950 rounded-xl p-4 h-32 relative overflow-hidden border border-white/5">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
          {/* Grid lines */}
          <line x1="0" y1="50" x2="400" y2="50" stroke="#334155" strokeWidth="1" />
          <line x1="100" y1="0" x2="100" y2="100" stroke="#1e293b" strokeWidth="1" />
          <line x1="200" y1="0" x2="200" y2="100" stroke="#1e293b" strokeWidth="1" />
          <line x1="300" y1="0" x2="300" y2="100" stroke="#1e293b" strokeWidth="1" />
          {/* EQ curve */}
          <path
            d={`M 0 50 ${bands.map((band, i) => {
              const x = Math.log10((bandValues[i]?.freqHz || band.freqHz) / 20) / Math.log10(20000 / 20) * 400;
              const y = 50 - (bandValues[i]?.gainDb || band.gainDb) * 2;
              return `L ${x} ${y}`;
            }).join(' ')} L 400 50`}
            fill="none"
            stroke="url(#eqGradient)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <defs>
            <linearGradient id="eqGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          {/* Band points */}
          {bands.map((band, i) => {
            const freq = bandValues[i]?.freqHz || band.freqHz;
            const gain = bandValues[i]?.gainDb || band.gainDb;
            const x = Math.max(0, Math.min(400, Math.log10(freq / 20) / Math.log10(20000 / 20) * 400));
            const y = Math.max(0, Math.min(100, 50 - gain * 2));
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={enabledBands[i] ? 6 : 4}
                fill={enabledBands[i] ? '#f97316' : '#475569'}
                className="cursor-pointer transition-all"
              />
            );
          })}
        </svg>
      </div>
      <div className="absolute bottom-1 left-2 text-[10px] text-slate-600">20Hz</div>
      <div className="absolute bottom-1 right-2 text-[10px] text-slate-600">20kHz</div>
    </div>

    {/* Band Controls */}
    {bands.map((band, i) => (
      <div
        key={i}
        className={`rounded-xl p-3 transition-all ${
          enabledBands[i]
            ? 'bg-orange-500/10 border border-orange-500/30'
            : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
        }`}
      >
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => onToggle(i)}
            className={`w-6 h-6 rounded-md flex items-center justify-center transition-all ${
              enabledBands[i] ? 'bg-orange-500' : 'bg-slate-700'
            }`}
          >
            {enabledBands[i] && <span className="text-white text-xs font-bold">✓</span>}
          </button>
          <span className="text-sm font-bold text-slate-200">Band {i + 1}</span>
          <span className={`text-xs px-2 py-0.5 rounded ${
            (bandValues[i]?.gainDb || band.gainDb) > 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {(bandValues[i]?.gainDb || band.gainDb) > 0 ? 'BOOST' : 'CUT'}
          </span>
        </div>
        {enabledBands[i] && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-slate-500 uppercase">Freq</label>
              <div className="text-sm font-mono text-orange-400">
                {(bandValues[i]?.freqHz || band.freqHz) >= 1000
                  ? `${((bandValues[i]?.freqHz || band.freqHz) / 1000).toFixed(1)}k`
                  : Math.round(bandValues[i]?.freqHz || band.freqHz)} Hz
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase">Gain</label>
              <input
                type="range"
                min="-12"
                max="12"
                step="0.5"
                value={bandValues[i]?.gainDb || band.gainDb}
                onChange={(e) => onValueChange(i, 'gainDb', parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
              />
              <div className="text-xs font-mono text-slate-300 text-center">
                {(bandValues[i]?.gainDb || band.gainDb) > 0 ? '+' : ''}{(bandValues[i]?.gainDb || band.gainDb).toFixed(1)} dB
              </div>
            </div>
            <div>
              <label className="text-[10px] text-slate-500 uppercase">Q</label>
              <div className="text-sm font-mono text-slate-400">{band.q?.toFixed(1) || '1.0'}</div>
            </div>
          </div>
        )}
      </div>
    ))}
  </div>
);

// Compressor/Dynamics Plugin UI
const CompressorPluginUI: React.FC<{
  params: NonNullable<EchoAction['params']>;
  enabledParams: Record<number, boolean>;
  onToggle: (i: number) => void;
  paramValues: Record<number, number | string>;
  onValueChange: (i: number, value: number | string) => void;
}> = ({ params, enabledParams, onToggle, paramValues, onValueChange }) => (
  <div className="space-y-3">
    {/* Gain Reduction Meter (visual) */}
    <div className="bg-slate-950 rounded-xl p-4 border border-white/5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase">Gain Reduction</span>
        <span className="text-xs font-mono text-amber-400">-0.0 dB</span>
      </div>
      <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-500 to-red-500 w-[30%] transition-all opacity-50" />
      </div>
    </div>

    {/* Knobs */}
    <div className="grid grid-cols-2 gap-3">
      {params.map((param, i) => (
        <div
          key={i}
          className={`rounded-xl p-3 transition-all ${
            enabledParams[i]
              ? 'bg-purple-500/10 border border-purple-500/30'
              : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={() => onToggle(i)}
              className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
                enabledParams[i] ? 'bg-purple-500' : 'bg-slate-700'
              }`}
            >
              {enabledParams[i] && <span className="text-white text-[10px] font-bold">✓</span>}
            </button>
            <span className="text-xs font-bold text-slate-300 uppercase">{param.name.replace(/_/g, ' ')}</span>
          </div>
          {enabledParams[i] && param.type !== 'boolean' && (
            <>
              <input
                type="range"
                min={param.min || 0}
                max={param.max || 100}
                step={param.step || 1}
                value={typeof paramValues[i] === 'number' ? paramValues[i] : (param.value as number)}
                onChange={(e) => onValueChange(i, parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="text-center text-sm font-mono text-purple-400 mt-1">
                {typeof paramValues[i] === 'number' ? (paramValues[i] as number).toFixed(2) : param.value}
                {param.unit || ''}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  </div>
);

// Saturation Plugin UI
const SaturationPluginUI: React.FC<{
  params: NonNullable<EchoAction['params']>;
  enabledParams: Record<number, boolean>;
  onToggle: (i: number) => void;
  paramValues: Record<number, number | string>;
  onValueChange: (i: number, value: number | string) => void;
}> = ({ params, enabledParams, onToggle, paramValues, onValueChange }) => {
  const typeParamIdx = params.findIndex(p => p.name === 'type');
  const amountParamIdx = params.findIndex(p => p.name === 'amount');
  const mixParamIdx = params.findIndex(p => p.name === 'mix');

  const typeParam = params[typeParamIdx];
  const amountParam = params[amountParamIdx];
  const mixParam = params[mixParamIdx];

  const currentType = paramValues[typeParamIdx] || typeParam?.value || 'tape';
  const currentAmount = typeof paramValues[amountParamIdx] === 'number' ? paramValues[amountParamIdx] : (amountParam?.value as number) || 0;
  const currentMix = typeof paramValues[mixParamIdx] === 'number' ? paramValues[mixParamIdx] : (mixParam?.value as number) || 1;

  return (
    <div className="space-y-4">
      {/* Saturation Type Selector */}
      {typeParam && (
        <div className="bg-slate-950 rounded-xl p-4 border border-white/5">
          <label className="text-xs text-slate-500 uppercase block mb-2">Saturation Type</label>
          <div className="grid grid-cols-3 gap-2">
            {['tape', 'tube', 'digital'].map((type) => (
              <button
                key={type}
                onClick={() => onValueChange(typeParamIdx, type)}
                className={`py-2 px-3 rounded-lg text-sm font-bold transition-all ${
                  currentType === type
                    ? 'bg-amber-500 text-white shadow-lg'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Drive & Mix */}
      <div className="grid grid-cols-2 gap-4">
        {amountParam && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <label className="text-xs text-amber-400 uppercase block mb-2">Drive</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentAmount as number}
              onChange={(e) => onValueChange(amountParamIdx, parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <div className="text-center text-lg font-mono text-amber-400 mt-2">
              {((currentAmount as number) * 100).toFixed(0)}%
            </div>
          </div>
        )}
        {mixParam && (
          <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-4">
            <label className="text-xs text-slate-400 uppercase block mb-2">Mix</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={currentMix as number}
              onChange={(e) => onValueChange(mixParamIdx, parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-400"
            />
            <div className="text-center text-lg font-mono text-slate-300 mt-2">
              {((currentMix as number) * 100).toFixed(0)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Stereo Imager Plugin UI
const StereoPluginUI: React.FC<{
  params: NonNullable<EchoAction['params']>;
  enabledParams: Record<number, boolean>;
  onToggle: (i: number) => void;
  paramValues: Record<number, number | string>;
  onValueChange: (i: number, value: number | string) => void;
}> = ({ params, enabledParams, onToggle, paramValues, onValueChange }) => (
  <div className="space-y-3">
    {/* Stereo Field Visual */}
    <div className="bg-slate-950 rounded-xl p-4 h-24 relative border border-white/5">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-20 h-20 rounded-full border border-slate-700 relative">
          <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-cyan-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute top-1/2 left-0 w-1 h-1 bg-cyan-500/50 rounded-full -translate-y-1/2" />
          <div className="absolute top-1/2 right-0 w-1 h-1 bg-cyan-500/50 rounded-full -translate-y-1/2" />
        </div>
      </div>
      <div className="absolute bottom-1 left-2 text-[10px] text-slate-600">L</div>
      <div className="absolute bottom-1 right-2 text-[10px] text-slate-600">R</div>
    </div>

    {/* Width Controls */}
    {params.map((param, i) => (
      <div
        key={i}
        className={`rounded-xl p-3 transition-all ${
          enabledParams[i]
            ? 'bg-cyan-500/10 border border-cyan-500/30'
            : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onToggle(i)}
              className={`w-5 h-5 rounded flex items-center justify-center ${
                enabledParams[i] ? 'bg-cyan-500' : 'bg-slate-700'
              }`}
            >
              {enabledParams[i] && <span className="text-white text-[10px]">✓</span>}
            </button>
            <span className="text-xs font-bold text-slate-300 uppercase">{param.name.replace(/_/g, ' ')}</span>
          </div>
          <span className="text-sm font-mono text-cyan-400">
            {((typeof paramValues[i] === 'number' ? paramValues[i] as number : param.value as number) * 100).toFixed(0)}%
          </span>
        </div>
        {enabledParams[i] && (
          <input
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={typeof paramValues[i] === 'number' ? paramValues[i] as number : param.value as number}
            onChange={(e) => onValueChange(i, parseFloat(e.target.value))}
            className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
          />
        )}
      </div>
    ))}
  </div>
);

// Generic Parameter Plugin UI (fallback)
const GenericPluginUI: React.FC<{
  params: NonNullable<EchoAction['params']>;
  enabledParams: Record<number, boolean>;
  onToggle: (i: number) => void;
  paramValues: Record<number, number | string>;
  onValueChange: (i: number, value: number | string) => void;
}> = ({ params, enabledParams, onToggle, paramValues, onValueChange }) => (
  <div className="grid grid-cols-2 gap-3">
    {params.map((param, i) => (
      <div
        key={i}
        className={`rounded-xl p-3 transition-all ${
          enabledParams[i]
            ? 'bg-white/10 border border-white/20'
            : 'bg-slate-800/30 border border-slate-700/30 opacity-50'
        }`}
      >
        <div className="flex items-center gap-2 mb-2">
          <button
            onClick={() => onToggle(i)}
            className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
              enabledParams[i] ? 'bg-slate-500' : 'bg-slate-700'
            }`}
          >
            {enabledParams[i] && <span className="text-white text-[10px] font-bold">✓</span>}
          </button>
          <span className="text-xs font-bold text-slate-300 uppercase truncate" title={param.name}>
            {param.name.replace(/_/g, ' ')}
          </span>
        </div>
        {enabledParams[i] && param.type !== 'boolean' && (
          typeof param.value === 'number' ? (
            <>
              <input
                type="range"
                min={param.min || 0}
                max={param.max || 100}
                step={param.step || 1}
                value={typeof paramValues[i] === 'number' ? paramValues[i] as number : (param.value as number)}
                onChange={(e) => onValueChange(i, parseFloat(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-slate-400"
              />
              <div className="text-center text-sm font-mono text-slate-400 mt-1">
                {typeof paramValues[i] === 'number' ? (paramValues[i] as number).toFixed(2) : param.value}
                {param.unit || ''}
              </div>
            </>
          ) : (
             <div className="text-sm text-slate-400">{param.value}</div>
          )
        )}
      </div>
    ))}
  </div>
);

// Action Card Component
const EchoActionCard: React.FC<{
  action: EchoAction;
  onApply: (updatedValues: any) => Promise<boolean>;
  isProcessing: boolean;
}> = ({ action, onApply, isProcessing }) => {
  const [expanded, setExpanded] = useState(false);
  const [enabledBands, setEnabledBands] = useState<Record<number, boolean>>({});
  const [bandValues, setBandValues] = useState<Record<number, { freqHz: number; gainDb: number; q?: number }>>({});
  const [enabledParams, setEnabledParams] = useState<Record<number, boolean>>({});
  const [paramValues, setParamValues] = useState<Record<number, number | string>>({});
  const [isApplied, setIsApplied] = useState(false);

  // Initialize state from action defaults
  useEffect(() => {
    if (action.bands) {
      const initialEnabled: Record<number, boolean> = {};
      const initialValues: Record<number, any> = {};
      action.bands.forEach((band, i) => {
        initialEnabled[i] = band.enabledByDefault;
        initialValues[i] = { freqHz: band.freqHz, gainDb: band.gainDb, q: band.q };
      });
      setEnabledBands(initialEnabled);
      setBandValues(initialValues);
    }
    if (action.params) {
      const initialEnabled: Record<number, boolean> = {};
      const initialValues: Record<number, any> = {};
      action.params.forEach((param, i) => {
        initialEnabled[i] = param.enabledByDefault;
        initialValues[i] = param.value;
      });
      setEnabledParams(initialEnabled);
      setParamValues(initialValues);
    }
  }, [action]);

  const handleApply = async () => {
    const updatedValues: any = {};
    if (action.bands) {
        updatedValues.bands = action.bands.map((b, i) => enabledBands[i] ? bandValues[i] : null).filter(Boolean);
    }
    if (action.params) {
        updatedValues.params = action.params.map((p, i) => enabledParams[i] ? { name: p.name, value: paramValues[i] } : null).filter(Boolean);
    }
    const success = await onApply(updatedValues);
    if (success) {
        setIsApplied(true);
        setExpanded(false);
    }
  };

  const getCardColor = (type: string) => {
    // All cards use Second Light OS neumorphic style with orange accents
    return 'from-slate-800/60 to-slate-900/80 border-slate-700/50';
  };

  return (
    <div className={`bg-gradient-to-br ${getCardColor(action.type)} rounded-2xl p-4 transition-all hover:scale-[1.01] duration-300 border backdrop-blur-sm relative overflow-hidden group`}>
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <PluginIcon type={action.type} />
      </div>

      <div className="flex items-start justify-between mb-3 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PluginIcon type={action.type} />
            <span className="text-xs font-bold bg-black/30 px-2 py-0.5 rounded text-white/80 border border-white/10 uppercase tracking-wide backdrop-blur-md">
              {action.type}
            </span>
            <h4 className="font-bold text-white text-lg tracking-tight">{action.label}</h4>
            {isApplied && <span className="text-green-400 font-bold ml-2 text-sm flex items-center gap-1">✓ Applied</span>}
          </div>
          <p className="text-sm text-slate-200/90 max-w-[90%] leading-relaxed">{action.description}</p>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 mb-4 bg-black/20 rounded-xl p-4 border border-white/5 animate-in slide-in-from-top-2 fade-in duration-300">
          {action.type === 'EQ' && action.bands && (
            <EQPluginUI
              bands={action.bands}
              enabledBands={enabledBands}
              onToggle={(i) => setEnabledBands(prev => ({ ...prev, [i]: !prev[i] }))}
              bandValues={bandValues}
              onValueChange={(i, f, v) => setBandValues(prev => ({ ...prev, [i]: { ...prev[i], [f]: v } }))}
            />
          )}
          {(action.type === 'Compression' || action.type === 'Dynamics') && action.params && (
            <CompressorPluginUI
              params={action.params}
              enabledParams={enabledParams}
              onToggle={(i) => setEnabledParams(prev => ({ ...prev, [i]: !prev[i] }))}
              paramValues={paramValues}
              onValueChange={(i, v) => setParamValues(prev => ({ ...prev, [i]: v }))}
            />
          )}
          {action.type === 'Saturation' && action.params && (
            <SaturationPluginUI
              params={action.params}
              enabledParams={enabledParams}
              onToggle={(i) => setEnabledParams(prev => ({ ...prev, [i]: !prev[i] }))}
              paramValues={paramValues}
              onValueChange={(i, v) => setParamValues(prev => ({ ...prev, [i]: v }))}
            />
          )}
          {(action.type === 'Stereo' || action.type === 'Imaging') && action.params && (
            <StereoPluginUI
              params={action.params}
              enabledParams={enabledParams}
              onToggle={(i) => setEnabledParams(prev => ({ ...prev, [i]: !prev[i] }))}
              paramValues={paramValues}
              onValueChange={(i, v) => setParamValues(prev => ({ ...prev, [i]: v }))}
            />
          )}
          {action.type === 'Multiband Compression' && action.bands && (
            <EQPluginUI
              bands={action.bands}
              enabledBands={enabledBands}
              onToggle={(i) => setEnabledBands(prev => ({ ...prev, [i]: !prev[i] }))}
              bandValues={bandValues}
              onValueChange={(i, f, v) => setBandValues(prev => ({ ...prev, [i]: { ...prev[i], [f]: v } }))}
            />
          )}
          {/* Fallback/Generic UI */}
          {!['EQ', 'Compression', 'Dynamics', 'Saturation', 'Stereo', 'Imaging', 'Multiband Compression'].includes(action.type) && action.params && (
            <GenericPluginUI
              params={action.params}
              enabledParams={enabledParams}
              onToggle={(i) => setEnabledParams(prev => ({ ...prev, [i]: !prev[i] }))}
              paramValues={paramValues}
              onValueChange={(i, v) => setParamValues(prev => ({ ...prev, [i]: v }))}
            />
          )}
        </div>
      )}

      <div className="flex gap-2 relative z-10">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 px-4 py-2 bg-black/20 hover:bg-black/30 text-white font-medium rounded-xl border border-white/5 transition-all text-sm backdrop-blur-md"
        >
          {expanded ? 'Hide Details' : 'Adjust Settings'}
        </button>
        <button
          onClick={handleApply}
          disabled={isProcessing || isApplied}
          className={`flex-1 px-4 py-2 font-bold rounded-xl transition-all text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
            isApplied 
              ? 'bg-green-500 text-white cursor-default' 
              : 'bg-white text-black hover:bg-slate-200'
          }`}
        >
          {isProcessing && !isApplied ? (
            <>
              <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              Processing
            </>
          ) : isApplied ? (
            <>
              <span>✓</span> Fix Applied
            </>
          ) : (
            'Apply Fix'
          )}
        </button>
      </div>
    </div>
  );
};

export const EchoReportPanel: React.FC<EchoReportPanelProps> = ({
  echoReport,
  onApplyEchoAction,
  isProcessing,
  echoActionStatus,
  echoActionError,
  echoReportStatus,
  onRetryEchoReport,
  trackName = 'My Track',
  referenceTrackName,
  beforeMetrics,
  afterMetrics,
  genreProfile,
  processedConfig, // Destructure processedConfig
}) => {
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCard, setShareCard] = useState<ShareableCard | null>(null);

  const handleCreateShareCard = async () => {
    if (echoReport && beforeMetrics && afterMetrics) {
      const card = await generateEchoReportCard({
        trackName,
        report: echoReport,
        genreProfile: genreProfile || null,
        beforeMetrics,
        afterMetrics,
        processedConfig, // Pass processedConfig here
      });
      setShareCard(card);
      setShowShareModal(true);
    }
  };

  if (echoReportStatus === 'loading') {
    return (
      <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 text-center shadow-xl">
        <div className="animate-spin w-10 h-10 border-4 border-slate-700 border-t-amber-500 rounded-full mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">Generating Echo Report</h3>
        <p className="text-slate-400 text-sm">Analyzing dynamics, tonal balance, and stereo field...</p>
      </div>
    );
  }

  // Idle State: Awaiting Recommendations
  if (echoReportStatus === 'idle' && !echoReport) {
    return (
      <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 text-center shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center mx-auto mb-4 border border-slate-700/50 shadow-inner">
          <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2">AWAITING ANALYSIS</h3>
        <p className="text-slate-500 text-sm">
          Run the analysis to generate mastering recommendations
        </p>
      </div>
    );
  }

  if (echoReportStatus === 'error' || !echoReport) {
    return (
      <div className="bg-slate-900 rounded-3xl p-8 border border-slate-800 text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl font-mono">!</span>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Report Unavailable</h3>
        <p className="text-slate-400 text-sm mb-4">Could not generate the mastering report.</p>
        <button
          onClick={() => onRetryEchoReport()}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all font-medium border border-slate-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-800/50 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-white tracking-tight">Echo Report</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
              echoReport.verdict === 'release_ready'
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : echoReport.verdict === 'refinements_available'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-red-500/10 text-red-400 border-red-500/20'
            }`}>
              {echoReport.verdict.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-slate-400 text-sm flex items-center gap-2">
            Confidence: {(echoReport.confidence * 100).toFixed(0)}%
            {referenceTrackName && (
              <>
                <span className="w-1 h-1 bg-slate-600 rounded-full" />
                Matching: <span className="text-amber-400">{referenceTrackName}</span>
              </>
            )}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <ShareButton
            onClick={handleCreateShareCard}
            label="Share Report"
            variant="secondary"
            size="sm"
            nudge="Viral potential!"
          />
          <button
            onClick={() => onRetryEchoReport()}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            title="Refresh Analysis"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* 99 Club Scoring */}
      {echoReport.score && (
        <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-2xl p-6 border border-slate-700/50 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">99 Club Score</h3>
              <p className="text-xs text-slate-500 mt-0.5">Professional mastering evaluation</p>
            </div>
            <div className="text-right">
              <div className={`text-5xl font-black tabular-nums ${
                echoReport.score.total >= 85 ? 'text-green-400' :
                echoReport.score.total >= 70 ? 'text-cyan-400' :
                echoReport.score.total >= 55 ? 'text-amber-400' :
                'text-red-400'
              }`}>
                {echoReport.score.total}
              </div>
              <div className="text-xs text-slate-500 font-mono">/100</div>
            </div>
          </div>

          {/* Score Grade */}
          <div className="text-center py-2 px-4 rounded-lg bg-slate-950/50 border border-slate-800">
            <span className={`text-sm font-bold uppercase tracking-widest ${
              echoReport.score.total >= 90 ? 'text-purple-400' :
              echoReport.score.total >= 80 ? 'text-green-400' :
              echoReport.score.total >= 70 ? 'text-cyan-400' :
              echoReport.score.total >= 60 ? 'text-blue-400' :
              echoReport.score.total >= 50 ? 'text-amber-400' :
              'text-red-400'
            }`}>
              {echoReport.score.total >= 90 ? 'MASTERPIECE' :
               echoReport.score.total >= 80 ? 'EXCELLENT' :
               echoReport.score.total >= 70 ? 'VERY GOOD' :
               echoReport.score.total >= 60 ? 'GOOD' :
               echoReport.score.total >= 50 ? 'DECENT' :
               'NEEDS WORK'}
            </span>
          </div>

          {/* Pillar Breakdown */}
          <div className="space-y-3">
            {[
              { name: 'Recording Quality', value: echoReport.score.recordingQuality, max: 25, color: 'bg-blue-500' },
              { name: 'Stem Quality', value: echoReport.score.stemQuality, max: 20, color: 'bg-cyan-500' },
              { name: 'Genre Accuracy', value: echoReport.score.genreAccuracy, max: 25, color: 'bg-purple-500' },
              { name: 'Vocal-Beat Relationship', value: echoReport.score.vocalBeatRelationship, max: 20, color: 'bg-pink-500' },
              { name: 'Creative Excellence', value: echoReport.score.creativeExcellence, max: 10, color: 'bg-amber-500' }
            ].map(pillar => (
              <div key={pillar.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-medium">{pillar.name}</span>
                  <span className="text-slate-300 font-mono font-bold">
                    {pillar.value}/{pillar.max}
                  </span>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${pillar.color} transition-all duration-500 ease-out`}
                    style={{ width: `${(pillar.value / pillar.max) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
        <p className="text-slate-200 text-lg leading-relaxed font-light">{echoReport.summary}</p>
        
        {echoReport.explanation && echoReport.explanation.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-700/50">
            <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Analysis Details</h4>
            <ul className="space-y-1">
              {echoReport.explanation.map((item, i) => (
                <li key={i} className="text-slate-300 text-sm flex items-start gap-2">
                  <span className="text-amber-500/50 mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Recommended Actions */}
      {echoReport.recommended_actions && echoReport.recommended_actions.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            Recommended Fixes
            <span className="bg-amber-500 text-black text-[10px] px-1.5 py-0.5 rounded-full">
              {echoReport.recommended_actions.length}
            </span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {echoReport.recommended_actions.map((action) => (
              <EchoActionCard
                key={action.id}
                action={action}
                onApply={(vals) => onApplyEchoAction(action, vals)}
                isProcessing={isProcessing}
              />
            ))}
          </div>
        </div>
      )}

      {/* V.E.N.U.M. Share Modal */}
      {showShareModal && shareCard && (
        <ShareableCardModal
          card={shareCard}
          onClose={() => setShowShareModal(false)}
          nudgeText="Show off those stats!"
        />
      )}
    </div>
  );
};