import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ViewportDeviceClass = 'phone' | 'tablet' | 'desktop';

export interface ViewportState {
  width: number;
  height: number;
  device: ViewportDeviceClass;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  orientation: 'portrait' | 'landscape';
}

const PHONE_MAX = 767; // < md (Tailwind md = 768)
const TABLET_MAX = 1023; // < lg (Tailwind lg = 1024)

function classifyDevice(width: number): ViewportDeviceClass {
  if (width <= PHONE_MAX) return 'phone';
  if (width <= TABLET_MAX) return 'tablet';
  return 'desktop';
}

function getOrientation(width: number, height: number): 'portrait' | 'landscape' {
  return height >= width ? 'portrait' : 'landscape';
}

function detectTouch(): boolean {
  if (typeof window === 'undefined') return false;
  // Coarse pointer is a good signal for phones/tablets, but keep maxTouchPoints as well.
  const coarse = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false;
  const touchPoints = typeof navigator !== 'undefined' ? (navigator.maxTouchPoints || 0) : 0;
  return coarse || touchPoints > 0;
}

const ViewportContext = createContext<ViewportState | null>(null);

export const ViewportProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') return { width: 1024, height: 768 };
    return { width: window.innerWidth, height: window.innerHeight };
  });
  const [isTouch, setIsTouch] = useState(() => detectTouch());

  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize);

    // Touch capability can change when e.g. device emulation toggles.
    const onPointerChange = () => setIsTouch(detectTouch());
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    mq?.addEventListener?.('change', onPointerChange);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      mq?.removeEventListener?.('change', onPointerChange);
    };
  }, []);

  const value = useMemo<ViewportState>(() => {
    const device = classifyDevice(size.width);
    return {
      width: size.width,
      height: size.height,
      device,
      isPhone: device === 'phone',
      isTablet: device === 'tablet',
      isDesktop: device === 'desktop',
      isTouch,
      orientation: getOrientation(size.width, size.height),
    };
  }, [size.width, size.height, isTouch]);

  return <ViewportContext.Provider value={value}>{children}</ViewportContext.Provider>;
};

export function useViewport(): ViewportState {
  const ctx = useContext(ViewportContext);
  if (ctx) return ctx;

  // Emergency-safe fallback so the app never hard-crashes in production
  // if context wiring is temporarily out of sync during deploy/runtime.
  const width = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const height = typeof window === 'undefined' ? 768 : window.innerHeight;
  const device = classifyDevice(width);
  const orientation = getOrientation(width, height);

  return {
    width,
    height,
    device,
    isPhone: device === 'phone',
    isTablet: device === 'tablet',
    isDesktop: device === 'desktop',
    isTouch: detectTouch(),
    orientation,
  };
}
