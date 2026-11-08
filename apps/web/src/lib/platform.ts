import { DEFAULT_APP_URL } from '@diagonale/core';

type DesktopBridge = {
  platform: string;
  version: string;
  onOpenBoard: (cb: (json: string) => void) => void;
};

declare global {
  interface Window {
    diagonaleDesktop?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | undefined = typeof window !== 'undefined' ? window.diagonaleDesktop : undefined;

/** Public URL used in share links (the desktop app has no public origin). */
export function publicAppUrl(): string {
  if (desktop || location.protocol === 'file:' || location.protocol === 'app:') return DEFAULT_APP_URL;
  return `${location.origin}${location.pathname}`;
}
