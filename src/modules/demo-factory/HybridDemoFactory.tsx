/**
 * HYBRID DEMO FACTORY - ADVANCED COMPONENT
 *
 * Enterprise-grade demo generation with:
 * - Multiple demo template selection
 * - Per-scene voice model override
 * - Real-time voice provider status
 * - Post-production effects customization
 * - Demo quality tier selection
 */

import React, { useState, useEffect } from 'react';
import { HybridDirector, HybridDemoResult } from './HybridDemoDirector';
import { bridge } from '../../services/BridgeService';
import paperPerfectorDemoHybrid from '../../../paper_perfector_demo_hybrid.json';
import masterLeaseDemoHybrid from '../../../master_lease_demo_hybrid.json';
import dataBlasterDemoHybrid from '../../../data_blaster_demo_hybrid.json';
import echoSoundLabDemoHybrid from '../../../echo_sound_lab_demo_hybrid.json';

interface HybridDemoFactoryProps {
  onComplete?: (result: HybridDemoResult) => void;
  defaultTemplate?: 'paper_perfector' | 'master_lease' | 'data_blaster' | 'echo_sound_lab';
}

type QualityTier = 'free' | 'professional' | 'cinematic';

export const HybridDemoFactory: React.FC<HybridDemoFactoryProps> = ({
  onComplete,
  defaultTemplate = 'paper_perfector'
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessages, setStatusMessages] = useState<string[]>([]);
  const [result, setResult] = useState<HybridDemoResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Configuration state
  const [selectedTemplate, setSelectedTemplate] = useState<'paper_perfector' | 'master_lease' | 'data_blaster' | 'echo_sound_lab'>(
    defaultTemplate
  );
  const [qualityTier, setQualityTier] = useState<QualityTier>('professional');
  const [voiceProvider, setVoiceProvider] = useState<'auto' | 'elevenlabs' | 'pyttsx3'>('auto');
  const [generateIntro, setGenerateIntro] = useState(true);
  const [addCredits, setAddCredits] = useState(true);

  // Voice routing status
  const [voiceStatus, setVoiceStatus] = useState({
    defaultProvider: 'pyttsx3' as 'elevenlabs' | 'pyttsx3',
    elevenlabsAvailable: false,
    fallbackEnabled: true
  });

  // Load voice status on mount
  useEffect(() => {
    const status = bridge.getVoiceRoutingStatus();
    setVoiceStatus(status);
  }, []);

  // Auto-start recording if DEMO_AUTO_RECORD is set (for automation)
  useEffect(() => {
    const autoConfig = (window as any).DEMO_AUTO_RECORD;
    if (autoConfig && !isGenerating) {
      const demoIdMap: Record<string, 'paper_perfector' | 'master_lease' | 'data_blaster' | 'echo_sound_lab'> = {
        'paper-perfector': 'paper_perfector',
        'master-lease': 'master_lease',
        'data-blaster': 'data_blaster',
        'echo-sound-lab': 'echo_sound_lab'
      };

      const mappedId = demoIdMap[autoConfig.demoId];
      if (mappedId) {
        setSelectedTemplate(mappedId);
        setQualityTier('professional');
        setVoiceProvider('auto');

        // Auto-trigger demo generation after brief delay
        setTimeout(() => {
          handleGenerateDemo();
        }, 500);
      }
    }
  }, []);

  const getTemplateData = () => {
    switch (selectedTemplate) {
      case 'master_lease':
        return masterLeaseDemoHybrid;
      case 'data_blaster':
        return dataBlasterDemoHybrid;
      case 'echo_sound_lab':
        return echoSoundLabDemoHybrid;
      case 'paper_perfector':
      default:
        return paperPerfectorDemoHybrid;
    }
  };

  const getQualityTierConfig = () => {
    switch (qualityTier) {
      case 'cinematic':
        return {
          introEnabled: true,
          voiceProvider: 'elevenlabs' as const,
          effectsLevel: 'all' as const,
          addMusic: true
        };
      case 'professional':
        return {
          introEnabled: true,
          voiceProvider: 'auto' as const,
          effectsLevel: 'minimal' as const,
          addMusic: false
        };
      case 'free':
      default:
        return {
          introEnabled: false,
          voiceProvider: 'pyttsx3' as const,
          effectsLevel: 'none' as const,
          addMusic: false
        };
    }
  };

  const handleGenerateDemo = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setStatusMessages([]);
    setError(null);
    setResult(null);

    try {
      const templateData = getTemplateData();
      const qualityConfig = getQualityTierConfig();

      // Override voice provider if specified
      const effectiveVoiceProvider = voiceProvider !== 'auto' ? voiceProvider : qualityConfig.voiceProvider;

      // Build the final demo script with quality tier and customizations
      const demoScript = {
        ...templateData,
        voice: {
          ...(templateData as any).voice,
          provider: effectiveVoiceProvider
        },
        intro: {
          ...(templateData as any).intro,
          enabled: generateIntro && qualityConfig.introEnabled,
          effects: qualityConfig.effectsLevel,
          music: qualityConfig.addMusic
        },
        postProduction: {
          ...(templateData as any).postProduction,
          credits: {
            ...(templateData as any)?.postProduction?.credits,
            enabled: addCredits
          }
        }
      };

      setStatusMessages((prev) => [
        ...prev,
        `🎬 Starting ${qualityTier.toUpperCase()} tier demo generation`,
        `🎙️  Voice Provider: ${effectiveVoiceProvider}`,
        `📝 Template: ${selectedTemplate}`,
        '...'
      ]);

      // Execute the hybrid demo generation
      const demoResult = await HybridDirector.executeDemo(
        demoScript as any,
        (message) => {
          setStatusMessages((prev) => [...prev, message]);
          console.log(message);
        }
      );

      setResult(demoResult);
      setStatusMessages((prev) => [...prev, '✅ Demo generation complete!']);

      if (onComplete) {
        onComplete(demoResult);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setStatusMessages((prev) => [...prev, `❌ ERROR: ${errorMessage}`]);
    } finally {
      setIsGenerating(false);
    }
  };

  const getVoiceStatusColor = () => {
    if (voiceStatus.elevenlabsAvailable) return 'text-emerald-400';
    return 'text-yellow-400';
  };

  const getQualityTierPrice = () => {
    switch (qualityTier) {
      case 'cinematic':
        return '$2,000 - $5,000+';
      case 'professional':
        return '$500 - $1,500';
      case 'free':
      default:
        return '$50 - $200';
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-full max-w-2xl max-h-[800px] overflow-y-auto">
      <div className="p-6 bg-gradient-to-b from-slate-950 to-slate-900 border border-slate-700 rounded-xl shadow-2xl font-sans space-y-4">
        {/* HEADER */}
        <div className="border-b border-slate-700 pb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-2">
            ✨ Hybrid Demo Factory Pro
            <span className="text-xs bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 px-2 py-1 rounded border border-purple-500/30">
              {isGenerating ? 'GENERATING' : 'READY'}
            </span>
          </h3>
          <p className="text-xs text-slate-400">Enterprise-grade demo generation with cinematic intros & professional voices</p>
        </div>

        {/* CONFIGURATION PANEL */}
        <div className="grid grid-cols-2 gap-4">
          {/* TEMPLATE SELECTION */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-2 block">📋 Demo Template</label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value as any)}
              disabled={isGenerating}
              className="w-full px-2 py-2 bg-slate-900 text-white text-xs border border-slate-600 rounded font-mono focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              <option value="paper_perfector">Paper Perfector</option>
              <option value="master_lease">Master Lease</option>
              <option value="data_blaster">Data Blaster</option>
              <option value="echo_sound_lab">Echo Sound Lab</option>
            </select>
          </div>

          {/* QUALITY TIER */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-2 block">⭐ Quality Tier</label>
            <select
              value={qualityTier}
              onChange={(e) => setQualityTier(e.target.value as QualityTier)}
              disabled={isGenerating}
              className="w-full px-2 py-2 bg-slate-900 text-white text-xs border border-slate-600 rounded font-mono focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              <option value="free">🎤 Free ({getQualityTierPrice()})</option>
              <option value="professional">⭐ Professional ({getQualityTierPrice()})</option>
              <option value="cinematic">🎬 Cinematic ({getQualityTierPrice()})</option>
            </select>
          </div>

          {/* VOICE PROVIDER */}
          <div>
            <label className="text-xs font-bold text-slate-300 mb-2 block">🎙️ Voice Provider</label>
            <select
              value={voiceProvider}
              onChange={(e) => setVoiceProvider(e.target.value as any)}
              disabled={isGenerating}
              className="w-full px-2 py-2 bg-slate-900 text-white text-xs border border-slate-600 rounded font-mono focus:border-purple-500 focus:outline-none disabled:opacity-50"
            >
              <option value="auto">🤖 Auto (Smart Fallback)</option>
              <option value="elevenlabs">⭐ ElevenLabs (Premium)</option>
              <option value="pyttsx3">🎤 pyttsx3 (Mac Neural)</option>
            </select>
            <div className={`mt-1 text-[9px] ${getVoiceStatusColor()}`}>
              {voiceStatus.elevenlabsAvailable ? '✓ ElevenLabs available' : '○ Using fallback (pyttsx3)'}
            </div>
          </div>

          {/* FEATURES */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">✨ Features</label>
            <div className="space-y-1">
              <label className="flex items-center text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateIntro}
                  onChange={(e) => setGenerateIntro(e.target.checked)}
                  disabled={isGenerating}
                  className="mr-2 rounded"
                />
                Cinematic Intro
              </label>
              <label className="flex items-center text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addCredits}
                  onChange={(e) => setAddCredits(e.target.checked)}
                  disabled={isGenerating}
                  className="mr-2 rounded"
                />
                Add Credits
              </label>
            </div>
          </div>
        </div>

        {/* STATUS MESSAGES */}
        <div className="bg-black/40 p-3 rounded-lg border border-slate-800 font-mono text-xs h-40 overflow-y-auto space-y-1">
          {statusMessages.length === 0 ? (
            <div className="text-slate-500">Waiting for demo generation...</div>
          ) : (
            statusMessages.map((msg, idx) => (
              <div
                key={idx}
                className={
                  msg.includes('❌')
                    ? 'text-red-400'
                    : msg.includes('✅')
                      ? 'text-emerald-400'
                      : msg.includes('🎬')
                        ? 'text-cyan-400'
                        : msg.includes('🎙️')
                          ? 'text-amber-400'
                          : 'text-blue-300'
                }
              >
                {msg}
              </div>
            ))
          )}
        </div>

        {/* ERROR DISPLAY */}
        {error && (
          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <div className="text-red-400 text-sm font-bold">❌ Error</div>
            <div className="text-red-300/80 text-xs mt-1">{error}</div>
          </div>
        )}

        {/* RESULT DISPLAY */}
        {result && (
          <div className="p-3 bg-emerald-900/20 border border-emerald-500/30 rounded-lg">
            <div className="text-emerald-400 text-sm font-bold mb-2">✅ Demo Generated Successfully</div>
            <div className="text-xs text-slate-300 space-y-1">
              <div>
                📊 Size: <span className="text-emerald-300 font-mono">{(result.fileSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
              <div>
                ⏱️  Duration: <span className="text-emerald-300 font-mono">{result.duration}s</span>
              </div>
              <div>
                🔗 Status: <span className="text-emerald-300 font-mono">{result.status}</span>
              </div>
            </div>
            {result.videoUrl && (
              <a
                href={result.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded font-semibold"
              >
                📥 Download Video
              </a>
            )}
          </div>
        )}

        {/* ACTION BUTTONS */}
        <div className="flex gap-2">
          <button
            onClick={handleGenerateDemo}
            disabled={isGenerating}
            className={`flex-1 py-3 px-4 rounded-lg text-sm font-bold tracking-wide transition-all uppercase ${
              isGenerating
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 active:scale-95'
            }`}
          >
            {isGenerating ? '⏳ Generating...' : '🎬 Generate Demo'}
          </button>
        </div>

        {/* INFO SECTION */}
        <div className="text-[10px] text-slate-500 border-t border-slate-700 pt-3">
          <p className="mb-1 font-bold text-slate-400">📚 What this does:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Generates cinematic intro (if enabled)</li>
            <li>Records screen with UI automation</li>
            <li>Creates professional voiceovers</li>
            <li>Adds credits and post-production effects</li>
            <li>Outputs broadcast-quality MP4</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default HybridDemoFactory;
