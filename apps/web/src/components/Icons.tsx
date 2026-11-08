import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const S = (props: P & { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props} />
);

export const Icon = {
  select: (p: P) => (<S {...p}><path d="M5 3l14 8-6 2-2 6z" /></S>),
  playerHome: (p: P) => (<S {...p}><circle cx="12" cy="12" r="7" fill="#D7263D" stroke="#fff" /></S>),
  playerAway: (p: P) => (<S {...p}><circle cx="12" cy="12" r="7" fill="#1F5FAD" stroke="#fff" /></S>),
  ball: (p: P) => (<S {...p}><circle cx="12" cy="12" r="6" fill="#fff" stroke="#111" /><path d="M12 9l2.5 1.8-1 3h-3l-1-3z" fill="#111" stroke="none" /></S>),
  pass: (p: P) => (<S {...p}><path d="M4 18L18 6" /><path d="M11 6h7v7" /></S>),
  run: (p: P) => (<S {...p}><path d="M4 18L18 6" strokeDasharray="3 3" /><path d="M11 6h7v7" /></S>),
  carry: (p: P) => (<S {...p}><path d="M3 17c2-3 3 1 5-2s3 1 5-2 3 1 5-4" /><path d="M14 6h5v5" /></S>),
  press: (p: P) => (<S {...p} strokeWidth="3"><path d="M4 18L17 7" /><path d="M10 6h8v8M7 9h8v8" strokeWidth="2" /></S>),
  lofted: (p: P) => (<S {...p}><path d="M4 18Q8 2 20 10" strokeDasharray="2 3" /><path d="M15 7l5 3-4 4" /></S>),
  block: (p: P) => (<S {...p}><path d="M4 18L16 8" /><path d="M13 5l6 6" strokeWidth="3" /></S>),
  shot: (p: P) => (<S {...p} strokeWidth="2.5"><path d="M4 18L16 8" /><path d="M20 4l-2 8-6-6z" fill="currentColor" /></S>),
  zoneRect: (p: P) => (<S {...p}><rect x="4" y="6" width="16" height="12" rx="1" fill="currentColor" fillOpacity="0.25" /></S>),
  zoneEllipse: (p: P) => (<S {...p}><ellipse cx="12" cy="12" rx="8" ry="6" fill="currentColor" fillOpacity="0.25" /></S>),
  line: (p: P) => (<S {...p}><path d="M4 18L20 6" strokeDasharray="4 3" /></S>),
  text: (p: P) => (<S {...p}><path d="M5 6h14M12 6v13" /></S>),
  cone: (p: P) => (<S {...p}><path d="M7 19l5-14 5 14z" fill="#FF7A1A" stroke="#FF7A1A" /></S>),
  tap: (p: P) => (<S {...p}><circle cx="12" cy="9" r="3" /><path d="M12 12v8M8 20h8" /></S>),
  names: (p: P) => (<S {...p}><path d="M4 7h16M4 12h10M4 17h13" /></S>),
  ghost: (p: P) => (<S {...p}><circle cx="8" cy="12" r="4" strokeDasharray="2 2" /><circle cx="17" cy="12" r="3" /><path d="M12 12h2" strokeDasharray="1 2" /></S>),
  undo: (p: P) => (<S {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10h-3" /></S>),
  redo: (p: P) => (<S {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 000 10h3" /></S>),
  play: (p: P) => (<S {...p}><path d="M7 4l13 8-13 8z" fill="currentColor" /></S>),
  pause: (p: P) => (<S {...p}><path d="M7 4v16M17 4v16" strokeWidth="3" /></S>),
  prev: (p: P) => (<S {...p}><path d="M18 5l-9 7 9 7zM6 5v14" /></S>),
  next: (p: P) => (<S {...p}><path d="M6 5l9 7-9 7zM18 5v14" /></S>),
  loop: (p: P) => (<S {...p}><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 01-4 4H3" /></S>),
  plus: (p: P) => (<S {...p}><path d="M12 5v14M5 12h14" /></S>),
  trash: (p: P) => (<S {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></S>),
  copy: (p: P) => (<S {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4H4v12h4" /></S>),
  ai: (p: P) => (<S {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></S>),
  share: (p: P) => (<S {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></S>),
  download: (p: P) => (<S {...p}><path d="M12 4v12M7 11l5 5 5-5M5 20h14" /></S>),
  folder: (p: P) => (<S {...p}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></S>),
  settings: (p: P) => (<S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></S>),
  close: (p: P) => (<S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>),
  upload: (p: P) => (<S {...p}><path d="M12 20V8M7 13l5-5 5 5M5 4h14" /></S>),
  image: (p: P) => (<S {...p}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></S>),
  send: (p: P) => (<S {...p}><path d="M4 12l16-8-6 16-2-6z" /></S>),
  stop: (p: P) => (<S {...p}><rect x="6" y="6" width="12" height="12" rx="1" fill="currentColor" /></S>),
};

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#0F3D2E" />
      <path d="M18 14h13c11 0 19 7.6 19 18s-8 18-19 18H18z" fill="none" stroke="#F4F1EA" strokeWidth="6" strokeLinejoin="round" />
      <path d="M12 54L46 18" stroke="#F2C230" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="6 5" />
      <path d="M50 14l-2 12-10-10z" fill="#F2C230" />
    </svg>
  );
}
