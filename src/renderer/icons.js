// Line icons (24×24 grid, stroke based).
const P = (...d) => d.map((x) => `<path d="${x}"/>`).join('');

const ICONS = {
  folder: P('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
  folderOpen: P('m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'),
  folderPlus: P('M12 10v6', 'M9 13h6', 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
  file: P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M16 13H8', 'M16 17H8', 'M10 9H8'),
  filePlus: P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M9 15h6', 'M12 18v-6'),
  chevron: P('m9 18 6-6-6-6'),
  chevronDown: P('m6 9 6 6 6-6'),
  search: '<circle cx="11" cy="11" r="8"/>' + P('m21 21-4.3-4.3'),
  plus: P('M5 12h14', 'M12 5v14'),
  sun: '<circle cx="12" cy="12" r="4"/>' + P('M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'),
  moon: P('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'),
  monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/>' + P('M8 21h8', 'M12 17v4'),
  download: P('M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'),
  focus: P('M8 3H5a2 2 0 0 0-2 2v3', 'M21 8V5a2 2 0 0 0-2-2h-3', 'M3 16v3a2 2 0 0 0 2 2h3', 'M16 21h3a2 2 0 0 0 2-2v-3'),
  sidebar: '<rect width="18" height="18" x="3" y="3" rx="2"/>' + P('M9 3v18'),
  undo: P('M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'),
  redo: P('M21 7v6h-6', 'M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7'),
  bold: P('M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'),
  italic: P('M19 4h-9', 'M14 20H5', 'M15 4 9 20'),
  underline: P('M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'),
  strike: P('M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'),
  code: P('m16 18 6-6-6-6', 'm8 6-6 6 6 6'),
  list: P('M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'),
  listOrdered: P('M10 12h11', 'M10 18h11', 'M10 6h11', 'M4 10h2', 'M4 6h1v4', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'),
  checklist: P('m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'),
  quote: P('M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z', 'M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z'),
  codeBlock: '<rect width="18" height="18" x="3" y="3" rx="2"/>' + P('m10 9-3 3 3 3', 'm14 15 3-3-3-3'),
  callout: P('M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'),
  minus: P('M5 12h14'),
  table: '<rect width="18" height="18" x="3" y="3" rx="2"/>' + P('M12 3v18', 'M3 9h18', 'M3 15h18'),
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/>' + P('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'),
  link: P('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'),
  alignLeft: P('M15 12H3', 'M17 18H3', 'M21 6H3'),
  alignCenter: P('M17 12H7', 'M19 18H5', 'M21 6H3'),
  alignRight: P('M21 12H9', 'M21 18H7', 'M21 6H3'),
  alignJustify: P('M3 12h18', 'M3 18h18', 'M3 6h18'),
  wrapLeft: '<rect width="8" height="8" x="3" y="4" rx="1.5"/>' + P('M15 5h6', 'M15 9h6', 'M15 13h6', 'M3 17h18', 'M3 21h12'),
  wrapRight: '<rect width="8" height="8" x="13" y="4" rx="1.5"/>' + P('M3 5h6', 'M3 9h6', 'M3 13h6', 'M3 17h18', 'M3 21h12'),
  highlighter: P('m9 11-6 6v3h9l3-3', 'm22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'),
  eraser: P('m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21', 'M22 21H7', 'm5 11 9 9'),
  trash: P('M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'),
  pencil: P('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'),
  external: P('M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'),
  check: P('M20 6 9 17l-5-5'),
  checkCircle: P('M21.801 10A10 10 0 1 1 17 3.335', 'm9 11 3 3L22 4'),
  x: P('M18 6 6 18', 'm6 6 12 12'),
  info: '<circle cx="12" cy="12" r="10"/>' + P('M12 16v-4', 'M12 8h.01'),
  warning: P('m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'),
  book: P('M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20'),
  sparkle: P('M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'),
  pilcrow: P('M13 4v16', 'M17 4v16', 'M19 4H9.5a4.5 4.5 0 0 0 0 9H13'),
  heading: P('M6 12h12', 'M6 20V4', 'M18 20V4'),
  palette: P('M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z') +
    '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  hardDrive: P('M22 12H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z', 'M6 16h.01', 'M10 16h.01'),
  rowsPlus: P('M3 12h18', 'M12 3v6', 'M9 6h6') + '<rect width="18" height="18" x="3" y="3" rx="2"/>',
};

export function icon(name, size = 18, cls = '') {
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

export const LOGO = `<svg class="logo" width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
<defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b7dff"/><stop offset="1" stop-color="#5b3df5"/></linearGradient></defs>
<rect width="64" height="64" rx="16" fill="url(#lg)"/>
<path d="M20 17h17a8 8 0 0 1 8 8v22H28a8 8 0 0 1-8-8z" fill="#fff" opacity=".95"/>
<path d="M27 27h11M27 33h11M27 39h7" stroke="#6d5dfc" stroke-width="3" stroke-linecap="round"/>
</svg>`;
