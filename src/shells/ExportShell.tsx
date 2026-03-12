import React from 'react';
import { NudgeBanner, ShareableCardModal } from '../components/ShareableCardModal';

export interface ExportShellProps {
  nudgeBannerProps: React.ComponentProps<typeof NudgeBanner> | null;
  shareableCardModalProps: React.ComponentProps<typeof ShareableCardModal> | null;
}

const ExportShell: React.FC<ExportShellProps> = ({
  nudgeBannerProps,
  shareableCardModalProps,
}) => (
  <>
    {nudgeBannerProps ? (
      <div className="fixed bottom-20 right-4 z-50 max-w-sm animate-in slide-in-from-right">
        <NudgeBanner {...nudgeBannerProps} />
      </div>
    ) : null}
    {shareableCardModalProps ? <ShareableCardModal {...shareableCardModalProps} /> : null}
  </>
);

export default ExportShell;
