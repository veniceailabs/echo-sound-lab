import React from 'react';
import { motion } from 'framer-motion';
import { useFlavor, FLAVORS, type Flavor, type FlavorMeta } from '../context/FlavorContext';

type Group = 'classic' | 'spring' | 'summer' | 'fall' | 'winter';

const GROUP_LABELS: Record<Group, string> = {
  classic: 'Classic',
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

const GROUPS: Group[] = ['classic', 'spring', 'summer', 'fall', 'winter'];

function FlavorButton({ fl, active, onClick }: { key?: React.Key; fl: FlavorMeta; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex flex-col items-start gap-2 p-3 rounded-xl border transition-all text-left overflow-hidden ${
        active
          ? 'border-white/30 bg-white/[0.08] shadow-[0_0_16px_rgba(255,255,255,0.06)]'
          : 'border-white/[0.06] bg-white/[0.03] hover:border-white/15'
      }`}
    >
      <div className="flex gap-1 w-full">
        {fl.preview.map((hex, i) => (
          <div
            key={i}
            className="h-4 flex-1 rounded-md"
            style={{ backgroundColor: hex, opacity: i === 0 ? 1 : 0.9 }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between w-full">
        <div>
          <p className="text-xs font-semibold text-slate-200 leading-none">
            {fl.name}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{fl.description}</p>
        </div>
        {active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: fl.accent }}
          >
            <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
            </svg>
          </motion.div>
        )}
      </div>

      {active && (
        <motion.div
          layoutId="flavor-active-glow"
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ boxShadow: `inset 0 0 0 1.5px ${fl.accent}50` }}
        />
      )}
    </motion.button>
  );
}

export const FlavorsPanel: React.FC = () => {
  const { flavor, setFlavor } = useFlavor();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-[11px] font-semibold text-slate-300">
          FS
        </span>
        <p className="text-xs uppercase tracking-[0.25em] text-slate-400 font-semibold">Brand Skins</p>
      </div>
      <p className="text-xs text-slate-500 -mt-3">Choose a visual skin for the studio shell.</p>

      {GROUPS.map((group) => {
        const groupFlavors = FLAVORS.filter(fl => fl.group === group);
        if (!groupFlavors.length) return null;
        return (
          <div key={group} className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
              {GROUP_LABELS[group]}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {groupFlavors.map((fl) => (
                <FlavorButton
                  key={fl.id}
                  fl={fl}
                  active={flavor === fl.id}
                  onClick={() => setFlavor(fl.id as Flavor)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <p className="text-[10px] text-slate-600 text-center pt-1">
        Changes save automatically.
      </p>
    </div>
  );
};
