import React from 'react';
import { debugTelemetryService } from '../services/debugTelemetryService';

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  errorId?: string;
};

export class ErrorBoundary extends React.Component<
  React.PropsWithChildren<{
    title?: string;
    onReset?: () => void;
  }>,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(err: Error): ErrorBoundaryState {
    const errorId = `esl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { hasError: true, error: err, errorId };
  }

  componentDidCatch(error: Error) {
    // Keep a minimal console trace for debugging in beta without hard-crashing the whole app.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error);
    debugTelemetryService.recordError('react.errorboundary', error, {
      errorId: this.state.errorId,
      title: this.props.title,
    });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorId: undefined });
    this.props.onReset?.();
  };

  private handleReport = () => {
    const email = 'liveconsciouslyllc@gmail.com';
    const subject = encodeURIComponent('Echo Sound Lab Beta Crash Report');
    const body = encodeURIComponent(
      `Error ID: ${this.state.errorId ?? 'n/a'}\n` +
        `Page: ${typeof window !== 'undefined' ? window.location.href : 'n/a'}\n` +
        `User Agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}\n\n` +
        `Message: ${this.state.error?.message ?? 'n/a'}\n\n` +
        `Stack:\n${this.state.error?.stack ?? 'n/a'}\n`
    );
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="w-full max-w-3xl mx-auto">
        <div className="bg-slate-950/70 backdrop-blur-3xl rounded-3xl border border-white/12 shadow-[0_30px_80px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Recovery Mode</p>
            <h2 className="text-xl sm:text-2xl font-semibold text-white">
              {this.props.title ?? 'This workspace hit an error.'}
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Nothing is lost. You can reset just this workspace or reload the app.
            </p>
          </div>

          <div className="p-6">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-slate-500">Error ID</p>
                  <p className="text-sm font-mono text-orange-300">{this.state.errorId ?? 'n/a'}</p>
                </div>
                <button
                  onClick={this.handleReport}
                  className="px-4 py-2.5 min-h-[44px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl border border-white/10 transition-all"
                >
                  Report Bug
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400 break-words">
                {this.state.error?.message ?? 'Unknown error'}
              </p>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-5 py-3 min-h-[44px] bg-slate-900 text-orange-400 rounded-xl shadow-[4px_4px_12px_rgba(0,0,0,0.5),_1px_1px_3px_rgba(255,255,255,0.03)] hover:shadow-[6px_6px_16px_rgba(0,0,0,0.6)] hover:text-orange-300 active:shadow-[inset_2px_2px_6px_rgba(0,0,0,0.8)] transition-all font-bold uppercase tracking-wider text-xs"
              >
                Reset Workspace
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-3 min-h-[44px] bg-white/5 hover:bg-white/10 text-white/70 hover:text-white font-medium rounded-xl border border-white/10 transition-all"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
