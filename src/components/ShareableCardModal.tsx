/**
 * Shareable Card Modal - Display and download viral assets
 */

import React, { useState } from 'react';
import { ShareableCard } from '../services/venumEngine';
import { useViewport } from '../context/ViewportContext';

interface ShareableCardModalProps {
  card: ShareableCard | null;
  onClose: () => void;
  nudgeText?: string;
}

export const ShareableCardModal: React.FC<ShareableCardModalProps> = ({
  card,
  onClose,
  nudgeText,
}) => {
  const { isPhone } = useViewport();
  const [copied, setCopied] = useState(false);
  const [clientCopied, setClientCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  if (!card) return null;

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = card.imageDataUrl;
    link.download = `echo-${card.type}-${Date.now()}.png`;
    link.click();
  };

  const canNativeShare = (() => {
    const nav: any = navigator;
    return typeof nav !== 'undefined' && typeof nav.share === 'function' && typeof nav.canShare === 'function';
  })();

  const handleNativeShare = async () => {
    setShareError(null);
    try {
      const blob = await (await fetch(card.imageDataUrl)).blob();
      const file = new File([blob], `echo-${card.type}-${Date.now()}.png`, { type: blob.type || 'image/png' });
      const nav: any = navigator;
      if (!nav.canShare?.({ files: [file] })) {
        throw new Error('Sharing is not available on this device.');
      }
      await nav.share({
        title: 'Echo Sound Lab',
        text: card.caption,
        files: [file],
      });
    } catch (e) {
      setShareError((e as Error).message || 'Share failed');
    }
  };

  const handleCopyCaption = () => {
    const fullCaption = `${card.caption}\n\n${card.hashtags.join(' ')}`;
    navigator.clipboard.writeText(fullCaption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyClientSend = () => {
    const clientLine = card.type === 'echo_report'
      ? 'Your updated Echo report is ready. Here is the latest version and summary.'
      : 'Your updated deliverable is ready. Here is the latest export and summary.';
    const fullCopy = [
      clientLine,
      '',
      card.caption,
      '',
      card.hashtags.join(' '),
      '',
      'Delivered via Echo Sound Lab.'
    ].join('\n');
    navigator.clipboard.writeText(fullCopy);
    setClientCopied(true);
    setTimeout(() => setClientCopied(false), 2200);
  };

  const getCardTitle = () => {
    switch (card.type) {
      case 'echo_report': return 'Echo Report Card';
      case 'before_after': return 'Before/After Card';
      case 'chain_recipe': return 'Chain Recipe Card';
      case 'glow_up': return 'Glow Up Card';
      default: return 'Shareable Card';
    }
  };

  return (
    <div
      className={`fixed inset-0 z-[200] flex bg-black/80 backdrop-blur-sm ${
        isPhone ? 'items-stretch justify-stretch p-0' : 'items-center justify-center p-4'
      }`}
    >
      <div
        className={`bg-gradient-to-br from-slate-900 to-slate-950 border border-white/10 shadow-2xl w-full overflow-hidden flex flex-col ${
          isPhone ? 'rounded-none max-w-none h-[100dvh] max-h-none' : 'rounded-2xl max-w-xl max-h-[95vh]'
        }`}
      >
        {/* Header */}
        <div className={`px-4 sm:px-6 py-4 border-b border-white/5 flex items-center justify-between ${isPhone ? 'pt-[calc(18px+var(--esl-safe-top))]' : ''}`}>
          <div>
            <h3 className="text-lg font-bold text-white">{getCardTitle()}</h3>
            {nudgeText && (
              <p className="text-sm text-amber-400 mt-1">{nudgeText}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Card Preview */}
          <div className="p-4 sm:p-6">
            <div className="rounded-xl overflow-hidden border border-white/10 shadow-lg">
              <img
                src={card.imageDataUrl}
                alt={getCardTitle()}
                className="w-full h-auto"
              />
            </div>
          </div>

          {/* Caption */}
          <div className="px-4 sm:px-6 pb-4">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <p className="text-white text-sm">{card.caption}</p>
                  <p className="text-amber-400/70 text-xs mt-2">{card.hashtags.join(' ')}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                  <button
                    onClick={handleCopyCaption}
                    className="px-3 py-1.5 bg-white/10 hover:bg-white/15 rounded-lg text-xs text-white/70 hover:text-white transition-all"
                  >
                    {copied ? 'Copied!' : 'Copy Caption'}
                  </button>
                  <button
                    onClick={handleCopyClientSend}
                    className="px-3 py-1.5 bg-orange-500/15 hover:bg-orange-500/25 rounded-lg text-xs text-orange-200 transition-all border border-orange-400/30"
                  >
                    {clientCopied ? 'Client Copy Ready' : 'Copy Client Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className={`px-4 sm:px-6 pb-6 flex gap-3 ${isPhone ? 'pb-[calc(18px+var(--esl-safe-bottom))]' : ''}`}>
          {canNativeShare && (
            <button
              onClick={handleNativeShare}
              className="px-4 py-3 min-h-[44px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl border border-white/10 transition-all"
            >
              Share
            </button>
          )}
          <button
            onClick={handleDownload}
            className="flex-1 px-4 py-3 bg-slate-900 text-orange-400 font-bold rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6),_2px_2px_4px_rgba(255,255,255,0.04)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.02)] active:translate-y-[1px] transition-all"
          >
            Download Image
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl border border-white/10 transition-all"
          >
            Close
          </button>
        </div>

        {shareError && (
          <div className="px-4 sm:px-6 pb-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-300">
              {shareError}
            </div>
          </div>
        )}

        {/* Subtle branding */}
        <div className="px-4 sm:px-6 pb-4 text-center">
          <p className="text-[10px] text-white/20">Powered by V.E.N.U.M.</p>
        </div>
      </div>
    </div>
  );
};

/**
 * Share button that triggers card generation
 */
interface ShareButtonProps {
  onClick: () => void;
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  nudge?: string;
}

export const ShareButton: React.FC<ShareButtonProps> = ({
  onClick,
  label = 'Share',
  variant = 'secondary',
  size = 'md',
  nudge,
}) => {
  const { isTouch } = useViewport();
  const baseClasses = 'font-medium rounded-xl transition-all flex items-center gap-2';

  const variantClasses = {
    primary: 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]',
    secondary: 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10',
    ghost: 'bg-transparent hover:bg-white/5 text-white/50 hover:text-white',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 min-h-[44px] text-xs',
    md: 'px-4 py-2.5 min-h-[44px] text-sm',
  };

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {label}
      </button>

      {/* Nudge tooltip */}
      {nudge && !isTouch && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-amber-500 text-black text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          {nudge}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-amber-500" />
        </div>
      )}
      {nudge && isTouch && (
        <div className="mt-2 text-[11px] text-amber-300/80">
          {nudge}
        </div>
      )}
    </div>
  );
};

/**
 * Inline nudge banner
 */
interface NudgeBannerProps {
  text: string;
  actionLabel: string;
  onAction: () => void;
  onDismiss: () => void;
}

export const NudgeBanner: React.FC<NudgeBannerProps> = ({
  text,
  actionLabel,
  onAction,
  onDismiss,
}) => {
  return (
    <div className="bg-slate-900/95 backdrop-blur-xl border border-orange-500/30 rounded-xl p-4 flex items-center justify-between gap-4 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
      <div className="flex items-center gap-3">
        <p className="text-white font-semibold text-sm">{text}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onAction}
          className="px-4 py-2 bg-gradient-to-br from-orange-500/80 to-orange-600/60 backdrop-blur-xl text-white text-sm font-bold rounded-lg border border-orange-400/30 shadow-[0_2px_8px_rgba(251,146,60,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-orange-500/90 hover:to-orange-600/70 hover:shadow-[0_4px_12px_rgba(251,146,60,0.25),inset_2px_2px_6px_rgba(0,0,0,0.3)] hover:translate-y-[1px] active:shadow-[inset_3px_3px_8px_rgba(0,0,0,0.5)] active:translate-y-[2px] transition-all duration-200"
        >
          {actionLabel}
        </button>
        <button
          onClick={onDismiss}
          className="p-2 text-white/40 hover:text-white/70 transition-colors"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default ShareableCardModal;
