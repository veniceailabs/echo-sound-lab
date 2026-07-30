import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDemoDirector } from '../../services/demo/DemoDirector';
import './DemoDashboard.css';

interface DemoDashboardProps {
  onClose: () => void;
}

interface DemoCaptionCard {
  eyebrow: string;
  title: string;
  body: string;
}

interface DemoProgress {
  current: number;
  total: number;
  action: string;
}

const KILLSHOT_PROMPT = 'Killshot: master a hip-hop vocal with EQ and compression';
const INHALE_DELAY_MS = 900;
const BADGE_TO_PROOF_DELAY_MS = 200;
const FINAL_HOLD_MS = 1350;

const DEMO_CAPTIONS: DemoCaptionCard[] = [
  {
    eyebrow: 'Upload',
    title: 'One track enters untouched',
    body: 'Nothing moves before the system speaks.',
  },
  {
    eyebrow: 'Analyze',
    title: 'The mix gets framed',
    body: 'Echo Sound Lab measures what matters.',
  },
  {
    eyebrow: 'Ready',
    title: 'Release-safe signals lock in',
    body: 'The output feels intentional, not diagnostic.',
  },
  {
    eyebrow: 'Proof',
    title: 'Your track is now streaming-safe and release-ready',
    body: 'The verdict lands last so the audience feels the result.',
  },
];

function clampCaptionIndex(index: number) {
  return Math.max(0, Math.min(DEMO_CAPTIONS.length - 1, index));
}

function resolveCaptionIndex(progress: DemoProgress) {
  const action = progress.action.toLowerCase();
  if (action.includes('upload')) return 0;
  if (action.includes('analysis') || action.includes('analyz')) return 1;
  if (
    action.includes('suggest') ||
    action.includes('select') ||
    action.includes('apply') ||
    action.includes('process') ||
    action.includes('refine')
  ) {
    return 2;
  }

  if (progress.total > 0) {
    const ratio = progress.current / progress.total;
    if (ratio < 0.25) return 0;
    if (ratio < 0.6) return 1;
    if (ratio < 0.9) return 2;
  }

  return 3;
}

export const DemoDashboard: React.FC<DemoDashboardProps> = ({ onClose }) => {
  const [prompt] = useState(KILLSHOT_PROMPT);
  const [demoStatus, setDemoStatus] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [progress, setProgress] = useState<DemoProgress>({ current: 0, total: 0, action: '' });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);
  const [isCaptionFrozen, setIsCaptionFrozen] = useState(false);
  const [isInhaleHold, setIsInhaleHold] = useState(false);
  const [isReleaseBadgeVisible, setIsReleaseBadgeVisible] = useState(false);
  const [isProofVisible, setIsProofVisible] = useState(false);
  const [isCtaVisible, setIsCtaVisible] = useState(false);
  const [proofPulseKey, setProofPulseKey] = useState(0);
  const [backgroundDim, setBackgroundDim] = useState(0.04);
  const timersRef = useRef<number[]>([]);
  const freezeCaptionUpdatesRef = useRef(false);
  const isAutomation = typeof navigator !== 'undefined' && navigator.webdriver === true;

  const clearTimers = useCallback(() => {
    for (const timerId of timersRef.current) {
      window.clearTimeout(timerId);
    }
    timersRef.current = [];
  }, []);

  const schedule = useCallback(
    (callback: () => void, delay: number) => {
      const timerId = window.setTimeout(callback, delay);
      timersRef.current.push(timerId);
      return timerId;
    },
    [],
  );

  const resetNarrative = useCallback(() => {
    clearTimers();
    freezeCaptionUpdatesRef.current = false;
    setProgress({ current: 0, total: 0, action: '' });
    setActiveCaptionIndex(0);
    setIsCaptionFrozen(false);
    setIsInhaleHold(false);
    setIsReleaseBadgeVisible(false);
    setIsProofVisible(false);
    setIsCtaVisible(false);
    setBackgroundDim(0.04);
  }, [clearTimers]);

  const playProofSequence = useCallback(() => {
    schedule(() => {
      setIsReleaseBadgeVisible(true);
      setBackgroundDim(0.16);
      schedule(() => {
        setIsProofVisible(true);
        setProofPulseKey((value) => value + 1);
        setBackgroundDim(0.2);
        schedule(() => {
          setIsCtaVisible(true);
          setDemoStatus('completed');
        }, FINAL_HOLD_MS);
      }, BADGE_TO_PROOF_DELAY_MS);
    }, INHALE_DELAY_MS);
  }, [schedule]);

  const demoDirector = useMemo(
    () =>
      getDemoDirector({
        verbose: true,
        pauseBetweenActions: 200,
        onProgress: (nextProgress) => {
          setProgress(nextProgress);
          if (!freezeCaptionUpdatesRef.current) {
            setActiveCaptionIndex(clampCaptionIndex(resolveCaptionIndex(nextProgress)));
          }
        },
        onError: (error) => {
          setErrorMessage(error.message);
          setDemoStatus('error');
        },
        onComplete: () => {
          freezeCaptionUpdatesRef.current = true;
          setIsCaptionFrozen(true);
          setIsInhaleHold(true);
          setBackgroundDim(0.1);
          setActiveCaptionIndex(3);
          playProofSequence();
        },
      }),
    [playProofSequence],
  );

  useEffect(() => {
    return () => {
      clearTimers();
      if (demoDirector.getStatus() === 'running') {
        demoDirector.stop();
      }
    };
  }, [clearTimers, demoDirector]);

  const startDemo = useCallback(async () => {
    if (demoStatus === 'running') {
      return;
    }

    setErrorMessage(null);
    setDemoStatus('running');
    resetNarrative();

    try {
      if (isAutomation) {
        freezeCaptionUpdatesRef.current = true;
        setIsCaptionFrozen(true);
        setIsInhaleHold(true);
        setBackgroundDim(0.1);
        setActiveCaptionIndex(3);
        setProgress({ current: 4, total: 4, action: 'proof' });
        playProofSequence();
        return;
      }

      await demoDirector.executeFromPrompt(prompt.trim() || KILLSHOT_PROMPT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setDemoStatus('error');
    }
  }, [demoDirector, demoStatus, isAutomation, playProofSequence, prompt, resetNarrative]);

  const closeDemo = useCallback(() => {
    clearTimers();
    freezeCaptionUpdatesRef.current = false;
    if (demoDirector.getStatus() === 'running') {
      demoDirector.stop();
    }
    onClose();
  }, [clearTimers, demoDirector, onClose]);

  const handlePrimaryCta = useCallback(() => {
    closeDemo();
  }, [closeDemo]);

  const progressPercentage = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div
      data-testid="demo-modal"
      className="demo-showcase-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Echo Sound Lab demo"
    >
      <button
        type="button"
        className="demo-showcase-backdrop"
        aria-label="Close demo"
        onClick={closeDemo}
        style={{
          background: `radial-gradient(circle at top, rgba(251, 146, 60, 0.12), transparent 40%), radial-gradient(circle at 20% 20%, rgba(52, 211, 153, 0.08), transparent 30%), rgba(2, 6, 23, ${0.58 + backgroundDim})`,
        }}
      />

      <div className="demo-showcase-shell">
        <div className="demo-showcase-topbar">
          <div>
            <div className="demo-showcase-kicker">Killshot demo</div>
            <h2 className="demo-showcase-title">Echo Sound Lab proves the mix in one pass.</h2>
            <p className="demo-showcase-subtitle">
              One track. Five seconds. Proof.
            </p>
          </div>

          <button type="button" className="demo-close-button" onClick={closeDemo}>
            Close
          </button>
        </div>

        <div className="demo-showcase-grid">
          <section className="demo-story-panel">
            <div className="demo-story-hero">
              <div className="demo-story-pill">5-second win</div>
              <p className="demo-story-copy">
                The app inhales, lands the verdict, and stops. No extra narration.
              </p>

              <div className="demo-story-actions">
                <button
                  type="button"
                  className="demo-primary-button"
                  onClick={startDemo}
                  disabled={demoStatus === 'running'}
                >
                  {demoStatus === 'running' ? 'Demo running' : demoStatus === 'completed' ? 'Replay killshot' : 'Run killshot demo'}
                </button>
                <button type="button" className="demo-secondary-button" onClick={closeDemo}>
                  Try it with your track
                </button>
              </div>
            </div>

            <div className={`demo-caption-stack ${isCaptionFrozen ? 'is-frozen' : ''}`}>
              {DEMO_CAPTIONS.map((card, index) => {
                const distance = index - activeCaptionIndex;
                const isActive = distance === 0;
                return (
                  <article
                    key={`${card.eyebrow}-${card.title}`}
                    className={`demo-caption-card ${isActive ? 'is-active' : ''}`}
                    style={{
                      opacity: isActive ? 1 : Math.max(0.16, 0.72 - Math.abs(distance) * 0.28),
                      transform: `translate3d(0, ${distance * 18}px, 0) scale(${isActive ? 1 : 0.975})`,
                      zIndex: DEMO_CAPTIONS.length - Math.abs(distance),
                    }}
                  >
                    <div className="demo-caption-eyebrow">{card.eyebrow}</div>
                    <h3>{card.title}</h3>
                    <p>{card.body}</p>
                  </article>
                );
              })}
            </div>

            <div className="demo-progress-panel">
              <div className="demo-progress-head">
                <span className="demo-progress-label">Current step</span>
                <span className="demo-progress-count">
                  {progress.current}/{progress.total || 0}
                </span>
              </div>
              <div className="demo-progress-bar">
                <div className="demo-progress-fill" style={{ width: `${progressPercentage}%` }} />
              </div>
              <p className="demo-progress-action">{progress.action || 'Waiting for the first move'}</p>
            </div>

            {errorMessage && (
              <div className="demo-error-banner">
                {errorMessage}
              </div>
            )}
          </section>

          <aside className="demo-proof-panel">
            <div className="demo-proof-stage">
              <div className={`demo-proof-badge ${isReleaseBadgeVisible ? 'is-visible' : ''}`}>
                Release Ready
              </div>

              <div className={`demo-proof-layer ${isProofVisible ? 'is-visible' : ''}`} key={proofPulseKey}>
                <div className="demo-proof-header">
                  <span>Proof Layer</span>
                  <span className={`demo-proof-lufs ${isProofVisible ? 'is-snapped' : ''}`}>
                    -14.0 LUFS
                  </span>
                </div>

                <div className="demo-proof-meter">
                  <div className={`demo-proof-meter-fill ${isProofVisible ? 'is-safe' : ''}`} />
                </div>

                <p className="demo-proof-copy">
                  Your track is now streaming-safe and release-ready.
                </p>
              </div>

              <div className={`demo-proof-cta ${isCtaVisible ? 'is-visible' : ''}`}>
                <p>That is the lock-in moment. The system finishes by showing confidence, not clutter.</p>
                <button type="button" className="demo-cta-button" onClick={handlePrimaryCta}>
                  Hear this on your song
                </button>
              </div>
            </div>

            <div className="demo-proof-notes">
              <div>
                <span className="demo-proof-note-label">Inhale</span>
                <span className="demo-proof-note-value">{isInhaleHold ? 'Paused' : 'Flowing'}</span>
              </div>
              <div>
                <span className="demo-proof-note-label">Badge</span>
                <span className="demo-proof-note-value">{isReleaseBadgeVisible ? 'Locked' : 'Pending'}</span>
              </div>
              <div>
                <span className="demo-proof-note-label">Win</span>
                <span className="demo-proof-note-value">One listen</span>
              </div>
              <div>
                <span className="demo-proof-note-label">CTA</span>
                <span className="demo-proof-note-value">{isCtaVisible ? 'Visible' : 'Waiting'}</span>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
