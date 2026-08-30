export type IconName =
  | 'atom'
  | 'table'
  | 'grid'
  | 'molecule'
  | 'dna'
  | 'book'
  | 'glossary'
  | 'help'
  | 'intro'
  | 'sliders'
  | 'controls'
  | 'chart'
  | 'physics'
  | 'camera'
  | 'export'
  | 'info'
  | 'eye'
  | 'eye-off'
  | 'zen'
  | 'close'
  | 'search'
  | 'chevron-down'
  | 'chevron-up'
  | 'chevron-left'
  | 'chevron-right'
  | 'maximize'
  | 'minimize'
  | 'rotate-ccw'
  | 'play'
  | 'pause'
  | 'turntable'
  | 'angle';

const ICON_PATHS: Record<IconName, string> = {
  angle: `
    <path d="M21 20H3V4"/>
    <path d="M12 20a9 9 0 0 0-9-9"/>
    <circle cx="3" cy="20" r="1" fill="currentColor"/>
  `,
  atom: `
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
    <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(30 12 12)"/>
    <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-30 12 12)"/>
    <ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(90 12 12)"/>
  `,
  table: `
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
    <line x1="3" y1="9" x2="21" y2="9"/>
    <line x1="3" y1="15" x2="21" y2="15"/>
    <line x1="9" y1="3" x2="9" y2="21"/>
    <line x1="15" y1="3" x2="15" y2="21"/>
  `,
  grid: `
    <rect x="3" y="3" width="7" height="7"/>
    <rect x="14" y="3" width="7" height="7"/>
    <rect x="14" y="14" width="7" height="7"/>
    <rect x="3" y="14" width="7" height="7"/>
  `,
  molecule: `
    <circle cx="18.5" cy="5.5" r="2.5"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="12" cy="12" r="3"/>
    <line x1="7.5" y1="16.5" x2="10" y2="14"/>
    <line x1="14" y1="10" x2="16.5" y2="7.5"/>
    <circle cx="18.5" cy="18.5" r="2"/>
    <line x1="14" y1="14" x2="17" y2="17"/>
  `,
  dna: `
    <path d="M2 15c6.667-6 13.333 0 20-6"/>
    <path d="M9 22c1.798-1.998 2.518-3.995 2.807-5.993"/>
    <path d="M15 2c-1.798 1.998-2.518 3.995-2.807 5.993"/>
    <path d="M17 6l-2.5-2.5"/>
    <path d="M14 8l-1-1"/>
    <path d="M7 18l2.5 2.5"/>
    <path d="M3.5 14.5l.5.5"/>
    <path d="M20 9.5l.5.5"/>
    <path d="M6.5 12.5l1 1"/>
    <path d="M16.5 10.5l1 1"/>
    <path d="M10 16l1.5 1.5"/>
  `,
  book: `
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  `,
  glossary: `
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="9" y1="7" x2="15" y2="7"/>
    <line x1="9" y1="11" x2="13" y2="11"/>
  `,
  help: `
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  `,
  intro: `
    <circle cx="12" cy="12" r="10"/>
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  `,
  sliders: `
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  `,
  controls: `
    <line x1="4" y1="21" x2="4" y2="14"/>
    <line x1="4" y1="10" x2="4" y2="3"/>
    <line x1="12" y1="21" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12" y2="3"/>
    <line x1="20" y1="21" x2="20" y2="16"/>
    <line x1="20" y1="12" x2="20" y2="3"/>
    <line x1="1" y1="14" x2="7" y2="14"/>
    <line x1="9" y1="8" x2="15" y2="8"/>
    <line x1="17" y1="16" x2="23" y2="16"/>
  `,
  chart: `
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  `,
  physics: `
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  `,
  camera: `
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  `,
  export: `
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  `,
  info: `
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  `,
  eye: `
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
    <circle cx="12" cy="12" r="3"/>
  `,
  'eye-off': `
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  `,
  zen: `
    <circle cx="12" cy="12" r="9"/>
    <path d="M12 3v18"/>
    <path d="M12 8a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4 4 0 0 1-4-4 4 4 0 0 1 4-4z" fill="currentColor"/>
  `,
  close: `
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  `,
  search: `
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
  `,
  'chevron-down': `
    <polyline points="6 9 12 15 18 9"/>
  `,
  'chevron-up': `
    <polyline points="18 15 12 9 6 15"/>
  `,
  'chevron-left': `
    <polyline points="15 18 9 12 15 6"/>
  `,
  'chevron-right': `
    <polyline points="9 18 15 12 9 6"/>
  `,
  maximize: `
    <polyline points="15 3 21 3 21 9"/>
    <polyline points="9 21 3 21 3 15"/>
    <line x1="21" y1="3" x2="14" y2="10"/>
    <line x1="3" y1="21" x2="10" y2="14"/>
  `,
  minimize: `
    <polyline points="4 14 10 14 10 20"/>
    <polyline points="20 10 14 10 14 4"/>
    <line x1="14" y1="10" x2="21" y2="3"/>
    <line x1="10" y1="14" x2="3" y2="21"/>
  `,
  'rotate-ccw': `
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <polyline points="3 3 3 8 8 8"/>
  `,
  play: `
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>
  `,
  pause: `
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/>
    <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>
  `,
  turntable: `
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a10 10 0 0 1 10 10"/>
    <path d="M12 6a6 6 0 0 1 6 6"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
  `,
};

export function icon(name: IconName, className: string = ''): string {
  const innerPath = ICON_PATHS[name] || ICON_PATHS.atom;
  const classes = ['svg-icon', `icon-${name}`, className].filter(Boolean).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${classes}">${innerPath}</svg>`;
}
