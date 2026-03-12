import React from 'react';
import BranchSelector from '../components/BranchSelector';
import TransportBar from '../components/TransportBar';
import HistoryScrubber from '../components/HistoryScrubber';
import TimelineWorkspace from '../components/TimelineWorkspace';

export interface TimelineShellProps {
  branchSelectorProps: React.ComponentProps<typeof BranchSelector>;
  transportBarProps: React.ComponentProps<typeof TransportBar>;
  historyScrubberProps: React.ComponentProps<typeof HistoryScrubber>;
  timelineWorkspaceProps: React.ComponentProps<typeof TimelineWorkspace>;
}

const shellCardClassName = 'bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)] transition-shadow duration-300 overflow-hidden';

const TimelineShell: React.FC<TimelineShellProps> = ({
  branchSelectorProps,
  transportBarProps,
  historyScrubberProps,
  timelineWorkspaceProps,
}) => (
  <>
    <div className={shellCardClassName}>
      <BranchSelector {...branchSelectorProps} />
    </div>
    <div className={shellCardClassName}>
      <TransportBar {...transportBarProps} />
    </div>
    <div className={shellCardClassName}>
      <HistoryScrubber {...historyScrubberProps} />
    </div>
    <div className={shellCardClassName}>
      <TimelineWorkspace {...timelineWorkspaceProps} />
    </div>
  </>
);

export default TimelineShell;
