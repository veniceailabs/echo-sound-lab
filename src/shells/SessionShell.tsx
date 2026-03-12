import React from 'react';

interface SessionShellProps {
  workspace: React.ReactNode;
  timelineShell?: React.ReactNode;
}

const SessionShell: React.FC<SessionShellProps> = ({
  workspace,
  timelineShell,
}) => (
  <div className="w-full max-w-7xl space-y-4 relative z-10">
    {workspace}
    {timelineShell}
  </div>
);

export default SessionShell;
