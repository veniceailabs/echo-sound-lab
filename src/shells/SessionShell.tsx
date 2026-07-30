import React from 'react';

interface SessionShellProps {
  workspace: React.ReactNode;
  timelineShell?: React.ReactNode;
  friendlyMode?: boolean;
  serviceTemplateBar?: {
    templates: Array<{
      templateId: string;
      name: string;
      category: string;
      summary: string;
    }>;
    isBusy?: boolean;
    onApplyTemplate: (templateId: string) => void | Promise<void>;
  } | null;
}

const SessionShell: React.FC<SessionShellProps> = ({
  workspace,
  timelineShell,
  friendlyMode = false,
  serviceTemplateBar = null,
}) => (
  <div className="w-full max-w-7xl space-y-6 relative z-10">
    {serviceTemplateBar ? (
      <section
        data-testid="service-template-bar"
        className="rounded-[2rem] border border-white/10 bg-[#12141a]/60 backdrop-blur-3xl shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.05)] p-5 transition-all"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">
              {friendlyMode ? 'Start Here' : 'Service Templates (Instant Apply)'}
            </p>
            <p className="mt-1 text-sm text-slate-300">
              {friendlyMode
                ? 'Choose one option below. Echo Sound Lab will do the setup, then you can press play, compare, and export.'
                : 'One-click deterministic macro chains for fast freelance delivery.'}
            </p>
          </div>
          {serviceTemplateBar.isBusy ? (
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Applying…</span>
          ) : null}
        </div>
        {friendlyMode ? (
          <div className="mt-5 grid gap-4 rounded-[1.5rem] border border-emerald-500/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.05),rgba(52,211,153,0.02))] p-5 md:grid-cols-3 shadow-[inset_0_1px_2px_rgba(255,255,255,0.05)] backdrop-blur-xl">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-400 font-bold">1. Pick a goal</p>
              <p className="mt-1 text-sm text-slate-300 font-medium">Start with the option that matches what you want this audio to do.</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-400 font-bold">2. Listen back</p>
              <p className="mt-1 text-sm text-slate-300 font-medium">Use Play and A/B to hear the before and after without guessing.</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-emerald-400 font-bold">3. Export</p>
              <p className="mt-1 text-sm text-slate-300 font-medium">When it sounds right, export a WAV. No advanced studio knowledge required.</p>
            </div>
          </div>
        ) : null}
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {serviceTemplateBar.templates.map((template) => (
            <button
              key={template.templateId}
              data-testid={`service-template-${template.templateId}`}
              type="button"
              onClick={() => {
                void serviceTemplateBar.onApplyTemplate(template.templateId);
              }}
              disabled={serviceTemplateBar.isBusy}
              title={template.summary}
              className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-left shadow-[0_4px_12px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.05)] transition-all hover:bg-white/[0.06] hover:scale-[1.02] hover:border-emerald-500/30 hover:shadow-[0_8px_24px_rgba(16,185,129,0.15)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 group"
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">
                {friendlyMode
                  ? template.templateId === 'podcast-cleanup'
                    ? 'Voice / Podcast'
                    : template.templateId === 'pro-vocal-polish'
                      ? 'Song Vocal'
                      : 'Whole Track'
                  : template.category}
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {friendlyMode
                  ? template.templateId === 'podcast-cleanup'
                    ? 'Clean up spoken voice'
                    : template.templateId === 'pro-vocal-polish'
                      ? 'Polish my vocal'
                      : 'Make this track release-ready'
                  : template.name}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {friendlyMode
                  ? template.templateId === 'podcast-cleanup'
                    ? 'Best for podcasts, voice notes, and dialogue.'
                    : template.templateId === 'pro-vocal-polish'
                      ? 'Best for rap, singing, and melodic vocals.'
                      : 'Best for loudness, glue, and final polish.'
                  : template.summary}
              </p>
            </button>
          ))}
        </div>
      </section>
    ) : null}
    {workspace}
    {timelineShell}
  </div>
);

export default SessionShell;
