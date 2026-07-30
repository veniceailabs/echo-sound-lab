import React from 'react';

interface StudioBrandProps {
  className?: string;
  onClick?: () => void;
}

export function StudioBrand({ className = '', onClick }: StudioBrandProps) {
  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className="group relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 hover:-translate-y-0.5 hover:rotate-[-1.5deg] active:scale-95 active:translate-y-[1px]"
        title="Return to Echo Sound Lab"
        aria-label="Echo Sound Lab"
      >
        <span className="absolute -inset-1 rounded-[18px] bg-gradient-to-br from-amber-500/15 via-orange-400/5 to-amber-700/20 blur-md opacity-60 transition-opacity duration-300 group-hover:opacity-80" />
        <span className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-900 border border-amber-300/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]" />
        <span className="absolute inset-[3px] rounded-xl bg-[linear-gradient(145deg,#a9642f_0%,#b7723b_45%,#8d4e25_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]" />
        <span className="absolute inset-[3px] rounded-xl bg-[repeating-linear-gradient(35deg,rgba(18,14,10,0.16)_0,rgba(18,14,10,0.16)_1px,rgba(255,255,255,0.015)_1px,rgba(255,255,255,0.015)_3px)] opacity-30" />
        <span className="absolute inset-[3px] rounded-xl bg-[radial-gradient(90%_80%_at_30%_25%,rgba(255,255,255,0.18),transparent_60%)] opacity-60" />
        <svg
          className="relative w-6 h-6 text-[#2b1c12] drop-shadow-[0_1px_0_rgba(255,255,255,0.25)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.1}
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden="true"
        >
          <path d="M7 5h10" />
          <path d="M7 12h7.5" />
          <path d="M7 19h10" />
          <path d="M7 5v14" />
        </svg>
      </button>

      <div>
        <h1 className="text-sm text-white tracking-tight flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="font-bold">Echo</span>
            <span className="font-normal text-slate-600">Sound Lab</span>
          </span>
          <span className="text-slate-600">||</span>
          <span className="text-slate-400 font-normal -ml-0.5">VENICEAI LABS</span>
        </h1>
        <p className="text-[10px] text-orange-400 font-semibold tracking-widest uppercase mt-1">
          Second Light OS
        </p>
      </div>
    </div>
  );
}

export default StudioBrand;
