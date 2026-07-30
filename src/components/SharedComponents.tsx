import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FeedbackPayload, RevisionLog, RevisionEntry, TestChecklistState } from '../types';

export const FeedbackButton: React.FC<{ onClick?: () => void; side?: 'left' | 'right' }> = ({ onClick, side = 'right' }) => {
  const handleClick = () => {
    const email = 'liveconsciouslyllc@gmail.com';
    const subject = encodeURIComponent('Echo Sound Lab Beta Feedback');
    const body = encodeURIComponent(
`Type: Bug | Suggestion | UX | Audio Quality | Other

What happened:

What you expected:

How to reproduce:
1.
2.
3.

Track (optional):

Browser / Device:
${navigator.userAgent}

Page:
${window.location.href}
`
    );
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;
    // Use direct navigation for better cross-browser mailto reliability.
    window.location.href = mailtoUrl;
    onClick?.();
  };

  return (
    <button
      onClick={handleClick}
      title="Send feedback to the Echo Sound Lab team."
      style={{ top: '56%' }}
      className={`esl-floating-chrome fixed z-40 -translate-y-1/2 overflow-hidden bg-slate-950/92 text-orange-300 border border-orange-500/18 backdrop-blur-sm shadow-[3px_3px_10px_rgba(0,0,0,0.42),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[5px_5px_14px_rgba(0,0,0,0.5)] hover:text-orange-200 transition-[width,box-shadow,color,transform] duration-700 ease-out hover:duration-500 active:scale-95 flex items-center group will-change-transform focus:outline-none ${
        side === 'left'
          ? 'left-0 w-[2px] rounded-r-full border-l-0 justify-start hover:w-[118px] hover:shadow-[0_0_0_1px_rgba(249,115,22,0.12),5px_5px_14px_rgba(0,0,0,0.5)]'
          : 'right-0 w-[2px] rounded-l-full border-r-0 justify-end hover:w-[118px] hover:shadow-[0_0_0_1px_rgba(249,115,22,0.12),5px_5px_14px_rgba(0,0,0,0.5)]'
      }`}
      aria-label="Send feedback"
    >
      <span className="relative flex h-10 items-center justify-center">
        <span className={`absolute inset-y-2 ${side === 'left' ? 'left-[1px]' : 'right-[1px]'} w-px rounded-full bg-orange-400/90 shadow-[0_0_10px_rgba(249,115,22,0.4)]`} />
        <span className={`flex h-10 items-center ${side === 'left' ? 'pl-3 pr-3.5' : 'pr-3 pl-3.5'} opacity-0 ${side === 'left' ? '-translate-x-2' : 'translate-x-2'} group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-500 delay-75 whitespace-nowrap`}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <span className="ml-2 text-[11px] font-bold tracking-[0.16em] uppercase">Feedback</span>
        </span>
      </span>
    </button>
  );
};

interface FeedbackModalProps {
  isOpen: boolean; onClose: () => void; onSubmit: (payload: any) => void;
  status: "idle" | "sending" | "sent" | "error"; mailtoLink?: string; error?: string | null;
}
export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose, onSubmit, status, mailtoLink, error }) => {
  const [type, setType] = useState<FeedbackPayload['type']>('Bug');
  const [message, setMessage] = useState('');
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!message.trim()) return;
    onSubmit({ type, message, includeTechnicalDetails: true });
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 p-6 rounded-none sm:rounded-2xl w-full h-[100dvh] sm:h-auto max-w-none sm:max-w-md border border-slate-800 shadow-xl overflow-y-auto pt-[calc(18px+var(--esl-safe-top))] sm:pt-6 pb-[calc(18px+var(--esl-safe-bottom))] sm:pb-6">
        {status === 'sent' ? (
            <div className="text-center"><h3 className="text-xl font-bold text-slate-200">Sent!</h3><button onClick={onClose} className="mt-4 px-4 py-2 bg-slate-700 rounded">Close</button></div>
        ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
                <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full bg-slate-800 rounded p-2 text-slate-200"><option>Bug</option><option>Other</option></select>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} className="w-full bg-slate-800 rounded p-2 text-slate-200" placeholder="Message..."></textarea>
                <div className="flex gap-2"><button type="button" onClick={onClose} className="flex-1 bg-slate-800 text-white rounded p-2">Cancel</button><button type="submit" className="flex-1 bg-slate-900 text-orange-400 font-bold rounded p-2 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] transition-all">{status === 'sending' ? 'Sending...' : 'Send'}</button></div>
            </form>
        )}
      </div>
    </div>
  );
};

export const TestChecklistCard: React.FC<{ testChecklist: TestChecklistState }> = ({ testChecklist }) => (
    <div className="bg-slate-900 rounded-3xl p-6 shadow-lg border border-slate-700/50 w-full max-w-sm mx-auto mt-8">
      <h3 className="text-lg font-bold text-slate-200 mb-4">Test Checklist</h3>
      {Object.entries(testChecklist).map(([key, val]) => (
        key !== 'lastUpdatedAt' && <div key={key} className="flex items-center gap-2"><span className={`font-bold ${val ? 'text-green-500' : 'text-slate-600'}`}>{val ? '✓' : '○'}</span><span className="text-sm text-slate-300">{key}</span></div>
      ))}
    </div>
);

export const SystemCheckPanel: React.FC<any> = ({ status, onRunRequested }) => (
    <div className="bg-slate-900 rounded-3xl p-6 border border-slate-700 mx-auto mt-8 max-w-2xl">
        <div className="flex justify-between items-center"><h2 className="text-xl font-bold text-slate-300">System Check</h2><button onClick={onRunRequested} disabled={status === 'running'} className="px-4 py-2 bg-blue-600 text-white rounded">{status === 'running' ? 'Running...' : 'Run Check'}</button></div>
    </div>
);

export const SystemCheckPasscodeModal: React.FC<any> = ({ open, onClose, onSubmit }) => {
    const [code, setCode] = useState('');
    if (!open) return null;
    return (
        <div className="fixed inset-0 z-[110] bg-slate-900/90 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-slate-900 p-6 rounded-none sm:rounded-2xl w-full h-[100dvh] sm:h-auto max-w-none sm:max-w-sm border border-slate-800 overflow-y-auto pt-[calc(18px+var(--esl-safe-top))] sm:pt-6 pb-[calc(18px+var(--esl-safe-bottom))] sm:pb-6">
                <h3 className="text-xl font-bold text-slate-300 mb-4">Admin Check</h3>
                <input type="password" value={code} onChange={e => setCode(e.target.value)} className="w-full bg-slate-800 rounded p-2 mb-4 text-white" placeholder="Passcode" />
                <div className="flex gap-2"><button onClick={onClose} className="flex-1 bg-slate-700 text-white rounded p-2">Cancel</button><button onClick={() => onSubmit(code)} className="flex-1 bg-blue-600 text-white rounded p-2">Run</button></div>
            </div>
        </div>
    );
};

export const RevisionLogModal: React.FC<{ revisionLog: RevisionLog; onRevert: (entry: RevisionEntry) => Promise<void>; onClose: () => void }> = ({ revisionLog, onRevert, onClose }) => (
    <div className="fixed inset-0 z-50 bg-slate-900/90 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-slate-900 p-6 rounded-none sm:rounded-2xl w-full h-[100dvh] sm:h-auto max-w-none sm:max-w-xl border border-slate-800 overflow-y-auto pt-[calc(18px+var(--esl-safe-top))] sm:pt-6 pb-[calc(18px+var(--esl-safe-bottom))] sm:pb-6 sm:max-h-[80vh]">
            <h3 className="text-xl font-bold text-slate-300 mb-4">Revision History</h3>
            {revisionLog.slice().reverse().map(entry => (
                <div key={entry.id} className="bg-slate-800 p-4 rounded mb-2">
                    <div className="flex justify-between"><span className="font-bold text-blue-400">{entry.id}</span><span className="text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</span></div>
                    <p className="text-sm text-slate-300">{entry.summary}</p>
                    <button onClick={() => { onRevert(entry); onClose(); }} className="mt-2 text-xs bg-orange-600 text-white px-2 py-1 rounded">Revert</button>
                </div>
            ))}
            <button onClick={onClose} className="w-full mt-4 bg-slate-700 text-white p-2 rounded">Close</button>
        </div>
    </div>
);

export const EchoReportConfirmationModal: React.FC<any> = ({ isOpen, onConfirm, onCancel, isProcessing }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-50 bg-slate-900/90 flex items-stretch sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-slate-900 p-6 rounded-none sm:rounded-2xl w-full h-[100dvh] sm:h-auto max-w-none sm:max-w-sm border border-slate-800 text-center overflow-y-auto pt-[calc(18px+var(--esl-safe-top))] sm:pt-6 pb-[calc(18px+var(--esl-safe-bottom))] sm:pb-6">
                <h3 className="text-xl font-bold text-slate-300 mb-2">Generate Report?</h3>
                <div className="flex gap-4 mt-6">
                    <button onClick={onCancel} className="flex-1 bg-slate-800 text-slate-300 rounded p-2">Cancel</button>
                    <button onClick={onConfirm} disabled={isProcessing} className="flex-1 bg-slate-900 text-orange-400 font-bold rounded p-2 shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] active:translate-y-[1px] transition-all disabled:opacity-50">{isProcessing ? 'Analyzing...' : 'Yes'}</button>
                </div>
            </div>
        </div>
    );
};
