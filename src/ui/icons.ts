export type IconName =
  | 'atom'
  | 'table'
  | 'grid'
  | 'molecule'
  | 'book'
  | 'help'
  | 'sliders'
  | 'chart'
  | 'camera'
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
  | 'rotate-ccw'
  | 'turntable'
  | 'angle'
  | 'dipole'
  | 'pi-bond'
  | 'spectrum'
  | 'play'
  | 'pause'
  | 'bond'
  | 'history'
  | 'zap'
  | 'nucleus'
  | 'radiation'
  | 'share'
  | 'compass'
  | 'trophy'
  | 'check'
  | 'lightbulb';

const ICON_PATHS: Record<IconName, string> = {
  share: `
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  `,
  compass: `
    <circle cx="12" cy="12" r="10"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>
  `,
  trophy: `
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
  `,
  check: `
    <polyline points="20 6 9 17 4 12"/>
  `,
  lightbulb: `
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>
    <path d="M9 18h6"/>
    <path d="M10 22h4"/>
  `,
  nucleus: `
    <circle cx="12" cy="12" r="9.5" stroke-dasharray="3 3"/>
    <circle cx="10" cy="10" r="3"/>
    <circle cx="14.5" cy="10.5" r="2.8"/>
    <circle cx="11.5" cy="14.5" r="3"/>
  `,
  radiation: `
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
    <path d="M12 2a10 10 0 0 1 8.66 5l-5.2 3a4 4 0 0 0-3.46-2V2z"/>
    <path d="M20.66 17A10 10 0 0 1 12 22v-6a4 4 0 0 0 3.46-2l5.2 3z"/>
    <path d="M3.34 17l5.2-3a4 4 0 0 0 0-4l-5.2-3a10 10 0 0 0 0 10z"/>
  `,
  history: `
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <path d="M3 3v5h5"/>
    <path d="M12 7v5l3.5 2"/>
  `,
  zap: `
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  `,
  bond: `
    <circle cx="8" cy="12" r="5"/>
    <circle cx="16" cy="12" r="5"/>
    <circle cx="8" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    <circle cx="16" cy="12" r="1.5" fill="currentColor" stroke="none"/>
  `,
  spectrum: `
    <line x1="4" y1="4" x2="4" y2="20"/>
    <line x1="9" y1="7" x2="9" y2="20"/>
    <line x1="14" y1="3" x2="14" y2="20"/>
    <line x1="19" y1="9" x2="19" y2="20"/>
  `,
  play: `
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>
  `,
  pause: `
    <rect x="6" y="4" width="4" height="16" fill="currentColor" stroke="none"/>
    <rect x="14" y="4" width="4" height="16" fill="currentColor" stroke="none"/>
  `,
  dipole: `
    <line x1="3" y1="12" x2="20" y2="12"/>
    <line x1="7" y1="8" x2="7" y2="16"/>
    <polyline points="15 7 21 12 15 17"/>
  `,
  'pi-bond': `
    <ellipse cx="12" cy="6.5" rx="7" ry="3"/>
    <line x1="3" y1="12" x2="21" y2="12" stroke-dasharray="2 3"/>
    <ellipse cx="12" cy="17.5" rx="7" ry="3"/>
  `,
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
  book: `
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  `,
  help: `
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
  chart: `
    <line x1="18" y1="20" x2="18" y2="10"/>
    <line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/>
    <line x1="2" y1="20" x2="22" y2="20"/>
  `,
  camera: `
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
  'rotate-ccw': `
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
    <polyline points="3 3 3 8 8 8"/>
  `,
  turntable: `
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 2a10 10 0 0 1 10 10"/>
    <path d="M12 6a6 6 0 0 1 6 6"/>
    <circle cx="12" cy="12" r="2" fill="currentColor"/>
  `,
};

export function icon(name: IconName, className: string = ''): string {
  const innerPath = ICON_PATHS[name];
  const classes = ['svg-icon', `icon-${name}`, className].filter(Boolean).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${classes}">${innerPath}</svg>`;
}
