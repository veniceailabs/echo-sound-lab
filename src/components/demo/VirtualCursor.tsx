import React, { useEffect, useState, useRef } from 'react';
import './VirtualCursor.css';

interface CursorState {
  x: number;
  y: number;
  isClicking: boolean;
  isHolding: boolean;
  progress: number; // 0-100 for hold progress
}

/**
 * VirtualCursor
 * Renders a visible cursor controlled by GhostUser
 * Sits at z-index 9999 to always be visible
 * Does not interfere with real user input (pointerEvents: none)
 */
export const VirtualCursor: React.FC = () => {
  const [cursor, setCursor] = useState<CursorState>({
    x: 0,
    y: 0,
    isClicking: false,
    isHolding: false,
    progress: 0,
  });

  const holdProgressRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Listen for GHOST_CURSOR_MOVE events from GhostUser
    const handleMove = (e: Event) => {
      const customEvent = e as CustomEvent<{ x: number; y: number }>;
      setCursor((prev) => ({
        ...prev,
        x: customEvent.detail.x,
        y: customEvent.detail.y,
      }));
    };

    // Listen for GHOST_CURSOR_CLICK events
    const handleClick = (e: Event) => {
      const customEvent = e as CustomEvent<{ down: boolean }>;
      setCursor((prev) => ({
        ...prev,
        isClicking: customEvent.detail.down,
      }));
    };

    // Listen for GHOST_CURSOR_HOLD events
    const handleHold = (e: Event) => {
      const customEvent = e as CustomEvent<{
        active: boolean;
        progress?: number;
      }>;
      setCursor((prev) => ({
        ...prev,
        isHolding: customEvent.detail.active,
        progress: customEvent.detail.progress ?? 0,
      }));
    };

    window.addEventListener('GHOST_CURSOR_MOVE', handleMove);
    window.addEventListener('GHOST_CURSOR_CLICK', handleClick);
    window.addEventListener('GHOST_CURSOR_HOLD', handleHold);

    return () => {
      window.removeEventListener('GHOST_CURSOR_MOVE', handleMove);
      window.removeEventListener('GHOST_CURSOR_CLICK', handleClick);
      window.removeEventListener('GHOST_CURSOR_HOLD', handleHold);
      if (holdProgressRef.current) clearTimeout(holdProgressRef.current);
    };
  }, []);

  return (
    <div
      className="virtual-cursor-container"
      style={{
        position: 'fixed',
        left: cursor.x,
        top: cursor.y,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      {/* Main cursor icon */}
      <div
        className={`virtual-cursor ${cursor.isClicking ? 'clicking' : ''} ${
          cursor.isHolding ? 'holding' : ''
        }`}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
          <path d="M5.64 3.64L20.59 18.59" stroke="currentColor" strokeWidth="2" />
          <path d="M3 3v10.34a1 1 0 0 0 1 1h10.34" />
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
      </div>

      {/* Hold progress ring (shows when holding) */}
      {cursor.isHolding && (
        <div
          className="hold-progress-ring"
          style={{
            background: `conic-gradient(from 0deg, #8ab4f8 0deg, #8ab4f8 ${
              cursor.progress * 3.6
            }deg, rgba(138, 180, 248, 0.2) ${cursor.progress * 3.6}deg)`,
          }}
        />
      )}

      {/* Click indicator */}
      {cursor.isClicking && (
        <>
          <div className="click-ripple" />
          <div className="click-ripple click-ripple-2" />
        </>
      )}
    </div>
  );
};
