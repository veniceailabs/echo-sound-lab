import React, { useEffect, useMemo, useState } from 'react';

export interface StudioTourStep {
  title: string;
  body: string;
  targetSelector?: string;
  note?: string;
}

interface StudioCoachmarkTourProps {
  isVisible: boolean;
  stepIndex: number;
  steps: StudioTourStep[];
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

type Placement = 'dock' | 'right' | 'left' | 'below';

interface TourLayout {
  placement: Placement;
  panelStyle: React.CSSProperties;
  highlightStyle: React.CSSProperties | null;
  targetLabel: string | null;
}

const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 220;
const PANEL_GAP = 16;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getViewportSize() {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function buildDockLayout(step: StudioTourStep | undefined): TourLayout {
  const { width, height } = getViewportSize();
  return {
    placement: 'dock',
    panelStyle: {
      right: 24,
      left: 'auto',
      top: clamp(96, 16, height - PANEL_HEIGHT - 24),
      width: PANEL_WIDTH,
    },
    highlightStyle: null,
    targetLabel: step?.note || null,
  };
}

function measureLayout(step: StudioTourStep | undefined, stepIndex: number): TourLayout {
  const { width, height } = getViewportSize();
  const mobileLayout = width < 900;

  if (mobileLayout) {
    return {
      placement: 'dock',
      panelStyle: {
        left: '50%',
        right: 'auto',
        top: 'calc(72px + var(--esl-safe-top, 0px))',
        bottom: 'auto',
        transform: 'translateX(-50%)',
        width: 'min(320px, calc(100vw - 24px))',
        maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100dvh - 96px - var(--esl-safe-top, 0px) - var(--esl-safe-bottom, 0px))',
        overflow: 'auto',
      },
      highlightStyle: null,
      targetLabel: step?.note || null,
    };
  }

  if (stepIndex === 0) {
    return buildDockLayout(step);
  }

  if (!step?.targetSelector || typeof document === 'undefined') {
    return buildDockLayout(step);
  }

  const target = document.querySelector(step.targetSelector);
  if (!(target instanceof HTMLElement)) {
    return buildDockLayout(step);
  }

  const rect = target.getBoundingClientRect();
  const spaceRight = width - rect.right;
  const spaceLeft = rect.left;
  const spaceBelow = height - rect.bottom;
  const spaceAbove = rect.top;
  const panelWidth = Math.min(PANEL_WIDTH, width - 24);
  const panelHeight = PANEL_HEIGHT;

  let placement: Placement = 'dock';
  let left = clamp(width - panelWidth - 24, 16, width - panelWidth - 16);
  let top = clamp(rect.top, 16, height - panelHeight - 16);

  if (spaceRight >= panelWidth + PANEL_GAP) {
    placement = 'right';
    left = clamp(rect.right + PANEL_GAP, 16, width - panelWidth - 16);
    top = clamp(rect.top - 8, 16, height - panelHeight - 16);
  } else if (spaceLeft >= panelWidth + PANEL_GAP) {
    placement = 'left';
    left = clamp(rect.left - panelWidth - PANEL_GAP, 16, width - panelWidth - 16);
    top = clamp(rect.top - 8, 16, height - panelHeight - 16);
  } else if (spaceBelow >= panelHeight + PANEL_GAP) {
    placement = 'below';
    left = clamp(rect.left, 16, width - panelWidth - 16);
    top = clamp(rect.bottom + PANEL_GAP, 16, height - panelHeight - 16);
  } else if (spaceAbove >= panelHeight + PANEL_GAP) {
    placement = 'dock';
    left = clamp(rect.left, 16, width - panelWidth - 16);
    top = clamp(rect.top - panelHeight - PANEL_GAP, 16, height - panelHeight - 16);
  }

  return {
    placement,
    panelStyle: {
      left,
      top,
      width: panelWidth,
    },
    highlightStyle: {
      left: clamp(rect.left - 8, 8, width - rect.width - 8),
      top: clamp(rect.top - 8, 8, height - rect.height - 8),
      width: rect.width + 16,
      height: rect.height + 16,
    },
    targetLabel: step.note || null,
  };
}

export default function StudioCoachmarkTour({
  isVisible,
  stepIndex,
  steps,
  onNext,
  onBack,
  onSkip,
}: StudioCoachmarkTourProps) {
  const step = steps[stepIndex];
  const [layout, setLayout] = useState<TourLayout>(() => buildDockLayout(step));

  useEffect(() => {
    if (!isVisible) return;

    const update = () => setLayout(measureLayout(step, stepIndex));
    update();

    const handleResize = () => update();
    const shouldTrackScroll = typeof window !== 'undefined' && window.innerWidth >= 900;

    window.addEventListener('resize', handleResize);
    if (shouldTrackScroll) {
      window.addEventListener('scroll', update, { passive: true });
    }

    const interval = shouldTrackScroll ? window.setInterval(update, 750) : null;
    return () => {
      window.removeEventListener('resize', handleResize);
      if (shouldTrackScroll) {
        window.removeEventListener('scroll', update);
      }
      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [isVisible, step, stepIndex]);

  const instruction = useMemo(() => {
    if (!step) return null;
    return `${stepIndex + 1}/${steps.length}`;
  }, [step, stepIndex, steps.length]);

  if (!isVisible || !step) return null;

  return (
    <div className="fixed inset-0 z-[240] pointer-events-none">
      {layout.highlightStyle ? (
        <div
          data-testid="studio-tour-highlight"
          className="fixed rounded-2xl border border-orange-400/70 bg-orange-400/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.38),0_0_0_1px_rgba(251,146,60,0.22)]"
          style={layout.highlightStyle}
        />
      ) : null}

      <div
        data-testid="studio-tour-tooltip"
        className="fixed pointer-events-auto w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-orange-500/20 bg-slate-950/95 backdrop-blur-xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.55)]"
        style={layout.panelStyle}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-300">
            Start Here · {instruction}
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500 hover:text-slate-300"
          >
            Skip
          </button>
        </div>

        <h4 className="text-lg font-bold text-white" data-testid="studio-tour-title">{step.title}</h4>
        <p className="mt-2 text-sm leading-6 text-slate-400">{step.body}</p>
        {layout.targetLabel ? (
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-cyan-300">
            {layout.targetLabel}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={stepIndex === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.14em] text-slate-300 transition-colors disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/10"
          >
            Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="rounded-lg border border-orange-400/30 bg-orange-500 px-4 py-2 text-xs uppercase tracking-[0.14em] text-white shadow-[0_0_24px_rgba(249,115,22,0.25)] transition-colors hover:bg-orange-400"
          >
            {stepIndex >= steps.length - 1 ? 'Done' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
