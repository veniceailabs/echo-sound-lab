import React from 'react';

interface SessionShellProps {
  workspace: React.ReactNode;
  timelineShell?: React.ReactNode;
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
  serviceTemplateBar = null,
}) => (
  <div className="w-full max-w-7xl space-y-4 relative z-10">
    {serviceTemplateBar ? (
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.03] backdrop-blur-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300">Service Templates (Instant Apply)</p>
            <p className="mt-1 text-sm text-slate-300">One-click deterministic macro chains for fast freelance delivery.</p>
          </div>
          {serviceTemplateBar.isBusy ? (
            <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">Applying…</span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {serviceTemplateBar.templates.map((template) => (
            <button
              key={template.templateId}
              type="button"
              onClick={() => {
                void serviceTemplateBar.onApplyTemplate(template.templateId);
              }}
              disabled={serviceTemplateBar.isBusy}
              className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-left transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-300">{template.category}</p>
              <p className="mt-1 text-sm font-semibold text-white">{template.name}</p>
              <p className="mt-1 text-xs text-slate-400">{template.summary}</p>
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
