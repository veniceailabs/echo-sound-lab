import React from 'react';
import MergeModal from '../components/MergeModal';
import { CapabilityACCModal } from '../components/CapabilityACCModal';
import { APLProposalPanel } from '../components/APL/APLProposalPanel';

export interface OrchestrationShellProps {
  mergeModalProps: React.ComponentProps<typeof MergeModal>;
  accModalProps: React.ComponentProps<typeof CapabilityACCModal>;
  proposalPanelProps: React.ComponentProps<typeof APLProposalPanel> | null;
}

const OrchestrationShell: React.FC<OrchestrationShellProps> = ({
  mergeModalProps,
  accModalProps,
  proposalPanelProps,
}) => (
  <>
    <MergeModal {...mergeModalProps} />
    <CapabilityACCModal {...accModalProps} />
    {proposalPanelProps ? <APLProposalPanel {...proposalPanelProps} /> : null}
  </>
);

export default OrchestrationShell;
