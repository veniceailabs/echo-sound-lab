/**
 * Genre Profile Selector - Choose aesthetic targets for AI analysis
 */

import React, { useState } from 'react';
import { GENRE_PROFILES, GenreProfile } from '../services/genreProfiles';

interface GenreProfileSelectorProps {
  selectedProfileId: string | null;
  onProfileSelect: (profile: GenreProfile | null) => void;
}

export const GenreProfileSelector: React.FC<GenreProfileSelectorProps> = ({
  selectedProfileId,
  onProfileSelect,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedProfile = GENRE_PROFILES.find(p => p.id === selectedProfileId);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">Vibe Target</span>
          {selectedProfile && (
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded-full border border-amber-500/30 font-medium">
              {selectedProfile.icon} {selectedProfile.name}
            </span>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-white/40 hover:text-white transition-colors"
        >
          {isExpanded ? 'Collapse' : 'Change'}
        </button>
      </div>

      {/* Selected Profile Summary */}
      {selectedProfile && !isExpanded && (
        <div className="bg-gradient-to-br from-white/[0.05] to-transparent rounded-xl p-4 border border-white/10">
          <p className="text-sm text-slate-300 mb-2">{selectedProfile.description}</p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-white/5 rounded text-[10px] text-slate-400">
              {selectedProfile.aesthetic.vibe}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-[10px] text-slate-500">
              Reference: {selectedProfile.aesthetic.reference.slice(0, 2).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* No Profile Selected */}
      {!selectedProfile && !isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="w-full bg-gradient-to-br from-white/[0.03] to-transparent rounded-xl p-4 border border-dashed border-white/10 hover:border-amber-500/30 transition-all text-center"
        >
          <p className="text-slate-400 text-sm">Select a vibe to target</p>
          <p className="text-slate-500 text-xs mt-1">AI will judge your mix against that aesthetic</p>
        </button>
      )}

      {/* Profile Grid */}
      {isExpanded && (
        <div className="space-y-2">
          {/* Clear Selection */}
          {selectedProfile && (
            <button
              onClick={() => {
                onProfileSelect(null);
                setIsExpanded(false);
              }}
              className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs text-slate-400 transition-all"
            >
              Clear selection (use generic analysis)
            </button>
          )}

          {/* Profile Cards */}
          <div className="grid gap-2">
            {GENRE_PROFILES.map(profile => {
              const isSelected = profile.id === selectedProfileId;
              return (
                <button
                  key={profile.id}
                  onClick={() => {
                    onProfileSelect(profile);
                    setIsExpanded(false);
                  }}
                  className={`w-full text-left bg-gradient-to-br from-white/[0.05] to-white/[0.02] rounded-xl p-4 border transition-all ${
                    isSelected
                      ? 'border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                      : 'border-white/10 hover:border-amber-500/30'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{profile.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white">{profile.name}</h4>
                        {isSelected && (
                          <span className="px-1.5 py-0.5 bg-amber-500 text-black text-[9px] rounded font-bold">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{profile.description}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] text-slate-500">
                          LUFS: {profile.targets.lufsIntegrated.ideal}
                        </span>
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] text-slate-500">
                          {profile.targets.lowEnd.emphasis} low end
                        </span>
                        <span className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] text-slate-500">
                          {profile.targets.highEnd.brightness}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Compact inline selector for header/toolbar use
 */
export const GenreProfileInlineSelector: React.FC<GenreProfileSelectorProps> = ({
  selectedProfileId,
  onProfileSelect,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectedProfile = GENRE_PROFILES.find(p => p.id === selectedProfileId);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
          selectedProfile
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
        }`}
      >
        {selectedProfile ? (
          <>
            <span>{selectedProfile.icon}</span>
            <span className="text-xs font-medium">{selectedProfile.name}</span>
          </>
        ) : (
          <span className="text-xs">Select Vibe</span>
        )}
        <span className="text-[10px] opacity-50">▼</span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-2 w-72 bg-slate-900 rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
            <div className="p-2 border-b border-white/5">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold px-2">
                Select Target Aesthetic
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto p-2 space-y-1">
              {/* None option */}
              <button
                onClick={() => {
                  onProfileSelect(null);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                  !selectedProfileId
                    ? 'bg-white/10 text-white'
                    : 'hover:bg-white/5 text-slate-400'
                }`}
              >
                <span className="text-sm">Generic (no specific vibe)</span>
              </button>

              {GENRE_PROFILES.map(profile => (
                <button
                  key={profile.id}
                  onClick={() => {
                    onProfileSelect(profile);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                    profile.id === selectedProfileId
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'hover:bg-white/5 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span>{profile.icon}</span>
                    <div>
                      <span className="text-sm font-medium">{profile.name}</span>
                      <p className="text-[10px] text-slate-500">{profile.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GenreProfileSelector;
