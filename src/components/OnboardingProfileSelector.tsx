import React from 'react';

export type OnboardingProfile = 'first_song' | 'artist_fast_path' | 'engineer_advanced';

interface OnboardingProfileSelectorProps {
  value: OnboardingProfile;
  onChange: (profile: OnboardingProfile) => void;
}

const PROFILE_CARDS: Array<{
  id: OnboardingProfile;
  label: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'first_song',
    label: 'First Song',
    subtitle: 'Walkthrough',
    description: 'Guided, one-step-at-a-time flow with clear language.',
  },
  {
    id: 'artist_fast_path',
    label: 'Artist Fast Path',
    subtitle: 'Quick Results',
    description: 'Minimal friction route from upload to finished release.',
  },
  {
    id: 'engineer_advanced',
    label: 'Engineer Advanced',
    subtitle: 'Logic-style',
    description: 'Direct controls, less hand-holding, deeper routing speed.',
  },
];

export const OnboardingProfileSelector: React.FC<OnboardingProfileSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-orange-300">Onboarding Profile</p>
      <h3 className="mt-1 text-sm font-semibold text-slate-100">Choose your lane before you start</h3>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {PROFILE_CARDS.map((profile) => {
          const active = value === profile.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onChange(profile.id)}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                active
                  ? 'border-orange-400/45 bg-orange-500/12'
                  : 'border-white/10 bg-slate-950/40 hover:border-orange-300/30'
              }`}
            >
              <p className={`text-[10px] uppercase tracking-[0.16em] ${active ? 'text-orange-300' : 'text-slate-500'}`}>{profile.subtitle}</p>
              <p className={`mt-1 text-sm font-semibold ${active ? 'text-orange-100' : 'text-slate-200'}`}>{profile.label}</p>
              <p className="mt-1 text-xs text-slate-400">{profile.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingProfileSelector;
