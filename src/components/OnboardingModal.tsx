import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export type OnboardingProfile = 'first_song' | 'artist_fast_path' | 'engineer_advanced';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (profile: OnboardingProfile) => void;
  onDismiss?: () => void;
  initialProfile?: OnboardingProfile;
}

/**
 * OnboardingModal: Profile selection + guided tour
 * Modal-first experience, shown once per account
 * Guides user through appropriate lane based on selection
 */

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  image?: React.ReactNode;
}

const PROFILE_STEPS: Record<OnboardingProfile, OnboardingStep[]> = {
  first_song: [
    {
      id: 'profile-selected',
      title: 'Simple Start',
      description: 'Upload one song, hear the result, and export when it feels right.',
    },
  ],
  artist_fast_path: [
    {
      id: 'profile-selected',
      title: 'Artist Fast Path',
      description: 'Use a few clear controls, then compare before and after.',
    },
  ],
  engineer_advanced: [
    {
      id: 'profile-selected',
      title: 'Engineer Advanced',
      description: 'Open the full studio when you want routing, MIDI, and deeper control.',
    },
    {
      id: 'advanced-routing',
      title: 'Open the routing graph',
      description: 'Use the graph to see buses, sends, and compensation at a glance.',
    },
    {
      id: 'advanced-midi',
      title: 'Edit notes and automation',
      description: 'Use the piano roll and automation lanes when you want precise changes.',
    },
    {
      id: 'advanced-review',
      title: 'Check before you export',
      description: 'Use A/B, compare the result, and only export when the change is worth it.',
    },
  ],
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  onDismiss,
  initialProfile = 'first_song',
}) => {
  const [stage, setStage] = useState<'profile-select' | 'tour'>('profile-select');
  const [selectedProfile, setSelectedProfile] = useState<OnboardingProfile>(initialProfile);
  const [currentStep, setCurrentStep] = useState(0);

  React.useEffect(() => {
    if (!isOpen) return;
    setSelectedProfile(initialProfile);
    setCurrentStep(0);
    setStage(initialProfile === 'engineer_advanced' ? 'tour' : 'profile-select');
  }, [initialProfile, isOpen]);

  const handleProfileSelect = useCallback((profile: OnboardingProfile) => {
    setSelectedProfile(profile);
    setStage('tour');
    setCurrentStep(0);
  }, []);

  const handleNextStep = useCallback(() => {
    const steps = PROFILE_STEPS[selectedProfile];
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      // Tour complete
      onComplete(selectedProfile);
    }
  }, [selectedProfile, currentStep, onComplete]);

  const handlePrevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    } else {
      setStage('profile-select');
    }
  }, [currentStep]);

  const steps = PROFILE_STEPS[selectedProfile];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
        >
          <motion.div
            className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 shadow-2xl w-full max-w-2xl mx-4"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={e => e.stopPropagation()}
          >
            {/* Profile Selection Screen */}
            {stage === 'profile-select' && (
              <div className="p-12 space-y-8">
                <div className="text-center space-y-2">
                  <h1 className="text-4xl font-bold text-slate-100">Welcome to Echo Sound Lab</h1>
                  <p className="text-slate-400">
                    Start with the simple path. If you want the full studio later, the advanced walkthrough is still here.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* First Song */}
                  <motion.button
                    onClick={() => handleProfileSelect('first_song')}
                    className="p-6 rounded-lg border-2 border-slate-600/30 hover:border-emerald-400/50 bg-slate-800/20 hover:bg-emerald-500/5 transition-all text-left"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <h3 className="text-lg font-bold text-slate-100">Simple Start</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Upload one song, press the one-button path, and compare before and after only if you want to step in.
                    </p>
                  </motion.button>

                  {/* Artist Fast Path */}
                  <motion.button
                    onClick={() => handleProfileSelect('artist_fast_path')}
                    className="p-6 rounded-lg border-2 border-slate-600/30 hover:border-blue-400/50 bg-slate-800/20 hover:bg-blue-500/5 transition-all text-left"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <h3 className="text-lg font-bold text-slate-100">Artist Fast Path</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      A simple path for fast decisions, with clear comparisons when you need them.
                    </p>
                  </motion.button>

                  {/* Engineer Advanced */}
                  <motion.button
                    onClick={() => handleProfileSelect('engineer_advanced')}
                    className="p-6 rounded-lg border-2 border-slate-600/30 hover:border-cyan-400/50 bg-slate-800/20 hover:bg-cyan-500/5 transition-all text-left"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <h3 className="text-lg font-bold text-slate-100">Engineer Advanced</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Full metering, routing, MIDI, and deeper control when you want to intervene.
                    </p>
                  </motion.button>
                </div>

                <button
                  onClick={onDismiss}
                  className="w-full py-2 text-sm text-slate-500 hover:text-slate-400 transition-colors"
                >
                  Skip for now
                </button>
              </div>
            )}

            {/* Tour Screen */}
            {stage === 'tour' && (
              <div className="p-12 space-y-8">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-widest text-slate-500">
                      Step {currentStep + 1} of {steps.length}
                    </p>
                    <p className="text-xs font-bold text-cyan-400">{Math.round(progress)}%</p>
                  </div>
                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>

                {/* Step Content */}
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentStep}
                    className="text-left space-y-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <h2 className="text-3xl font-bold text-slate-100 text-center">{steps[currentStep].title}</h2>
                    <p className="text-lg text-slate-400 text-center">{steps[currentStep].description}</p>

                    {steps[currentStep].image && (
                      <div className="py-8">{steps[currentStep].image}</div>
                    )}
                  </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex gap-4 pt-4">
                  <motion.button
                    onClick={handlePrevStep}
                    className="flex-1 py-3 rounded-lg bg-slate-700/30 hover:bg-slate-600/40 text-slate-300 font-semibold uppercase tracking-widest transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {currentStep === 0 ? 'Back' : 'Previous'}
                  </motion.button>

                  <motion.button
                    onClick={handleNextStep}
                    className="flex-1 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:shadow-lg hover:shadow-cyan-500/50 text-white font-bold uppercase tracking-widest transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                  </motion.button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OnboardingModal;
