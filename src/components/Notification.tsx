import React, { useEffect, useState } from 'react';

export type NotificationType = 'success' | 'error' | 'info';

interface NotificationProps {
  message: string;
  type: NotificationType;
  duration?: number; // milliseconds, default 2000
  onDismiss: () => void;
}

export const Notification: React.FC<NotificationProps> = ({
  message,
  type,
  duration = 2000,
  onDismiss
}) => {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Auto-dismiss after duration
    const dismissTimer = setTimeout(() => {
      setIsExiting(true);
      // Wait for exit animation to complete
      setTimeout(onDismiss, 300);
    }, duration);

    return () => clearTimeout(dismissTimer);
  }, [duration]); // Remove onDismiss from dependencies to prevent timer reset

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500/95 border-green-400/50';
      case 'error':
        return 'bg-red-500/95 border-red-400/50';
      case 'info':
        return 'bg-blue-500/95 border-blue-400/50';
      default:
        return 'bg-slate-800/95 border-slate-700/50';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  return (
    <div
      className={`fixed top-6 right-6 z-[100] flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] ${getStyles()} ${
        isExiting
          ? 'animate-out slide-out-to-right-full fade-out duration-300'
          : 'animate-in slide-in-from-right-full fade-in duration-300'
      }`}
    >
      {getIcon()}
      <span className="text-white font-semibold text-sm pr-2">{message}</span>
    </div>
  );
};

// Notification Manager Component
interface NotificationManagerProps {
  notifications: Array<{
    id: string;
    message: string;
    type: NotificationType;
    duration?: number;
  }>;
  onDismiss: (id: string) => void;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({
  notifications,
  onDismiss
}) => {
  return (
    <>
      {notifications.map((notification, index) => (
        <div
          key={notification.id}
          style={{
            top: `${24 + index * 80}px`, // Stack notifications vertically
            right: '24px'
          }}
          className="fixed z-[100]"
        >
          <Notification
            message={notification.message}
            type={notification.type}
            duration={notification.duration}
            onDismiss={() => onDismiss(notification.id)}
          />
        </div>
      ))}
    </>
  );
};
