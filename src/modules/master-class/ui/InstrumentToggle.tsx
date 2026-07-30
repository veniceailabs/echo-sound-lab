/**
 * INSTRUMENT TOGGLE COMPONENT
 *
 * Sprint 1: Skeleton
 * Focus buttons for isolating individual instruments/stems
 *
 * Allows users to mute all but one instrument (focus mode)
 * Provides intuitive UI for stem isolation without exporting stems
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import React from 'react';
import type { InstrumentToggleProps } from '../types';

/**
 * Instrument metadata for display
 */
interface InstrumentInfo {
  id: 'vocals' | 'drums' | 'bass' | 'other';
  label: string;
  emoji: string;
  description: string;
}

const INSTRUMENT_INFO: Record<'vocals' | 'drums' | 'bass' | 'other', InstrumentInfo> = {
  vocals: {
    id: 'vocals',
    label: 'Vocals',
    emoji: '🎤',
    description: 'Lead and background vocals',
  },
  drums: {
    id: 'drums',
    label: 'Drums',
    emoji: '🥁',
    description: 'Drum kit and percussion',
  },
  bass: {
    id: 'bass',
    label: 'Bass',
    emoji: '🎸',
    description: 'Bass guitar and low-end',
  },
  other: {
    id: 'other',
    label: 'Keys & Strings',
    emoji: '🎹',
    description: 'Keyboards, strings, pads',
  },
};

/**
 * InstrumentToggle Component
 *
 * Displays clickable buttons for each instrument stem.
 * Clicking a button focuses on that instrument (mutes others).
 * Shows visual feedback for which instrument is currently focused.
 */
export const InstrumentToggle: React.FC<InstrumentToggleProps> = ({
  instruments = ['vocals', 'drums', 'bass', 'other'],
  currentFocus,
  onFocusChange,
  disabled = false,
}) => {
  const handleButtonClick = (instrument: string) => {
    if (disabled) return;

    // If clicking the same button again, deselect it
    if (currentFocus === instrument) {
      onFocusChange('all');
    } else {
      onFocusChange(instrument);
    }
  };

  return (
    <div
      className="instrument-toggle-container"
      style={{
        display: 'flex',
        gap: '8px',
        flexWrap: 'wrap',
      }}
    >
      {instruments.map((instrument) => {
        const info = INSTRUMENT_INFO[instrument];
        const isSelected = currentFocus === instrument;

        return (
          <button
            key={instrument}
            onClick={() => handleButtonClick(instrument)}
            disabled={disabled}
            title={info.description}
            style={{
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isSelected ? '#007bff' : '#333',
              color: '#fff',
              border: isSelected ? '2px solid #0056b3' : '1px solid #555',
              borderRadius: '4px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: isSelected ? 600 : 500,
              fontSize: '14px',
              transition: 'all 0.2s ease',
              opacity: disabled ? 0.5 : 1,
              transform: isSelected ? 'scale(1.05)' : 'scale(1)',
            }}
            onMouseEnter={(e) => {
              if (!disabled && !isSelected) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#444';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && !isSelected) {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#333';
              }
            }}
          >
            <span style={{ fontSize: '18px' }}>{info.emoji}</span>
            <span>{info.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default InstrumentToggle;
