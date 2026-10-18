/** Single source of truth for the NEWTONITE COMMAND palette. index.css mirrors these values (a test enforces it). */
export const tokens = {
  dark: {
    bg: '#080B14', nav: '#0C1120', surface: '#11182A', raised: '#171F34', line: '#27324B', lineStrong: '#6B7A9E',
    fg: '#F5F7FF', muted: '#9AA8C4', accent: '#8175FF', accentHi: '#A69CFF', accentFg: '#080B14',
    ok: '#3AD6A0', warn: '#F6BD60', crit: '#FF5578',
  },
  light: {
    bg: '#F6F7FB', nav: '#FFFFFF', surface: '#FFFFFF', raised: '#EEF0F7', line: '#DDE1EE', lineStrong: '#7C87A3',
    fg: '#10162A', muted: '#4F5A78', accent: '#5B4FE0', accentHi: '#4A3EC9', accentFg: '#FFFFFF',
    ok: '#0A7452', warn: '#8A5A00', crit: '#B80E33',
  },
} as const
export type Theme = keyof typeof tokens
