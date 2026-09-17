/* Shared SVG icons (24x24, stroke based). */

const s = (body, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" ${extra}>${body}</svg>`;

export const icons = {
  bird: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 5.9c-.7.3-1.5.6-2.3.7.8-.5 1.5-1.3 1.8-2.3-.8.5-1.7.8-2.6 1a4.1 4.1 0 0 0-7 3.8A11.6 11.6 0 0 1 3.4 4.7a4.1 4.1 0 0 0 1.3 5.5c-.7 0-1.3-.2-1.9-.5a4.1 4.1 0 0 0 3.3 4 4.2 4.2 0 0 1-1.9.1 4.1 4.1 0 0 0 3.8 2.9A8.3 8.3 0 0 1 2 18.5a11.6 11.6 0 0 0 6.3 1.8c7.5 0 11.7-6.3 11.7-11.7v-.6c.8-.6 1.5-1.3 2-2.1z"/></svg>`,
  home: s('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  search: s('<circle cx="10.5" cy="10.5" r="7"/><path d="M15.8 15.8 21 21"/>'),
  bell: s('<path d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M13.7 19a2 2 0 0 1-3.4 0"/>'),
  mail: s('<rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><path d="m3 7 9 6 9-6"/>'),
  bookmark: s('<path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z"/>'),
  bookmarkFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z"/></svg>`,
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>'),
  users: s('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6"/>'),
  more: s('<circle cx="5" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.7" fill="currentColor" stroke="none"/>'),
  moreH: s('<circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/>'),
  reply: s('<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.6 9.6 0 0 1-3-.5L3 21l1.6-4.2A8.3 8.3 0 0 1 3 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z"/>'),
  retweet: s('<path d="M17 2.5 21 6.5l-4 4"/><path d="M21 6.5H7.5A4.5 4.5 0 0 0 3 11v1"/><path d="M7 21.5 3 17.5l4-4"/><path d="M3 17.5h13.5A4.5 4.5 0 0 0 21 13v-1"/>'),
  heart: s('<path d="M12 20.4 4.6 13.1a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8a4.7 4.7 0 0 1 6.6 6.7z"/>'),
  heartFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.4 4.6 13.1a4.7 4.7 0 0 1 6.6-6.7l.8.8.8-.8a4.7 4.7 0 0 1 6.6 6.7z"/></svg>`,
  retweetFilled: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 2.5 21 6.5l-4 4V6.5zM21 6.5H7.5A4.5 4.5 0 0 0 3 11v1h2v-1a2.5 2.5 0 0 1 2.5-2.5H21zM7 21.5 3 17.5l4-4v4zM3 17.5h13.5A4.5 4.5 0 0 0 21 13v-1h-2v1a2.5 2.5 0 0 1-2.5 2.5H3z"/></svg>`,
  share: s('<path d="M12 3v12"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 14v5.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V14"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  settings: s('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4.1V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11h.2a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  image: s('<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="m4 17 5-5 4 4 2.5-2.5L20 18"/>'),
  gif: s('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.5H8.8a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1.4v-1.2"/><path d="M13.5 13.5v-3h1.6M13.5 12h1.4"/>'),
  calendar: s('<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  clock: s('<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  trash: s('<path d="M4 7h16"/><path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10.5 11v6M13.5 11v6"/>'),
  edit: s('<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>'),
  check: s('<path d="m5 13 4.5 4.5L19 7"/>'),
  back: s('<path d="M20 12H4"/><path d="m10 6-6 6 6 6"/>'),
  sparkle: s('<path d="M12 3v5M12 16v5M4.5 12h5M15 12h5"/><path d="m6.8 6.8 3 3M14.2 14.2l3 3M17.2 6.8l-3 3M9.8 14.2l-3 3"/>'),
  globe: s('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>'),
  pin: s('<path d="M12 17.5V21"/><path d="M9 3.5h6l-.7 5 3.2 3.5H6.5L9.7 8.5z"/>'),
  logout: s('<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M16 8l4 4-4 4"/><path d="M20 12H9"/>'),
  download: s('<path d="M12 3v12"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 20h15"/>'),
  upload: s('<path d="M12 16V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 20h15"/>'),
  link: s('<path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 1 0-5.7-5.7L11.5 6.5"/><path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.1-1.1"/>'),
  refresh: s('<path d="M20 11a8 8 0 1 0-2 6.3"/><path d="M20 4v7h-7"/>'),
  caret: s('<path d="m6 9.5 6 6 6-6"/>', 'stroke-width="2.2"'),
  shield: s('<path d="M12 3 5 6v6c0 4.5 3 7.7 7 9 4-1.3 7-4.5 7-9V6z"/>'),
  eye: s('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  lock: s('<rect x="4" y="10.5" width="16" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A2.5 2.5 0 0 0 13.5 3h-8A2.5 2.5 0 0 0 3 5.5v8A2.5 2.5 0 0 0 5.5 16H8"/>'),
  warning: s('<path d="M12 3.5 21 19H3z"/><path d="M12 9.5v4.5M12 17h.01"/>'),
  sliders: s('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'),
  at: s('<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/>'),
  grid: s('<rect x="3" y="3" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2"/>'),
  pause: s('<rect x="6.5" y="4.5" width="4" height="15" rx="1.5"/><rect x="13.5" y="4.5" width="4" height="15" rx="1.5"/>'),
  play: s('<path d="M7 4.5 19 12 7 19.5z"/>'),

  /* phone status-bar decorations (filled, so they read at 12px) */
  signal: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="2" y="14" width="3.4" height="6" rx="1"/><rect x="7.2" y="10.5" width="3.4" height="9.5" rx="1"/><rect x="12.4" y="7" width="3.4" height="13" rx="1"/><rect x="17.6" y="3.5" width="3.4" height="16.5" rx="1"/></svg>`,
  wifi: s('<path d="M3.6 9a12.6 12.6 0 0 1 16.8 0"/><path d="M7 12.4a7.6 7.6 0 0 1 10 0"/><path d="M10.3 15.7a3.2 3.2 0 0 1 3.4 0"/><circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none"/>', 'stroke-width="1.6"'),
  battery: s('<rect x="2" y="7.5" width="17" height="9" rx="2.4"/><rect x="4.4" y="9.9" width="12.2" height="4.2" rx="1.2" fill="currentColor" stroke="none"/><path d="M21 11.2v1.6"/>', 'stroke-width="1.5"'),
};

export const badgeSvg = (kind = 'blue') => `
  <svg class="badge-check ${kind}" viewBox="0 0 24 24" aria-label="Verified">
    <path d="M12 1l2.6 2.1 3.3-.5 1.3 3.1 3 1.6-1 3.2 1 3.2-3 1.6-1.3 3.1-3.3-.5L12 23l-2.6-2.1-3.3.5-1.3-3.1-3-1.6 1-3.2-1-3.2 3-1.6L5.1 2.6l3.3.5z" fill="#1d9bf0"/>
    <path d="M10.6 15.5 7.6 12.5l1.3-1.3 1.7 1.7 4-4 1.3 1.3z" fill="#fff"/>
  </svg>`;

export function icon(name, cls = '') {
  const svg = icons[name] || '';
  if (!cls) return svg;
  return svg.replace('<svg ', `<svg class="${cls}" `);
}
