import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { tokens, type Theme } from '../lib/tokens'

const lum = (hex: string) => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }

describe.each(['dark', 'light'] as Theme[])('%s theme contrast (WCAG 2.x)', theme => {
  const t = tokens[theme]
  const surfaces = [t.bg, t.nav, t.surface, t.raised]
  it('body and secondary text reach AA (4.5:1) on every surface', () => {
    for (const s of surfaces) { expect(ratio(t.fg, s)).toBeGreaterThanOrEqual(4.5); expect(ratio(t.muted, s)).toBeGreaterThanOrEqual(4.5) }
  })
  it('accent text and semantic colours used as text reach AA on surface and raised', () => {
    for (const s of [t.surface, t.raised, t.bg]) for (const c of [t.accentHi, t.ok, t.warn, t.crit]) expect(ratio(c, s), `${c} on ${s}`).toBeGreaterThanOrEqual(4.5)
  })
  it('primary-button label is readable on the accent and critical fills', () => {
    expect(ratio(t.accentFg, t.accent)).toBeGreaterThanOrEqual(4.5)
    expect(ratio(t.accentFg, t.crit)).toBeGreaterThanOrEqual(4.5)
  })
  it('control borders reach 3:1 against the surfaces they sit on (WCAG 1.4.11)', () => {
    for (const s of [t.bg, t.surface]) expect(ratio(t.lineStrong, s)).toBeGreaterThanOrEqual(3)
  })
})

describe('index.css mirrors the token module', () => {
  const css = readFileSync('src/index.css', 'utf8')
  const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel))).toLowerCase()
  const names: Record<string, string> = { bg: '--bg', nav: '--nav', surface: '--surface', raised: '--raised', line: '--line', lineStrong: '--line-strong', fg: '--fg', muted: '--muted',
    accent: '--accent', accentHi: '--accent-hi', accentFg: '--accent-fg', ok: '--ok', warn: '--warn', crit: '--crit' }
  it.each([['dark', '.dark {'], ['light', ':root {']] as [Theme, string][])('%s variables match tokens.ts', (theme, sel) => {
    const b = block(sel)
    for (const [k, v] of Object.entries(tokens[theme])) expect(b, `${names[k]} in ${theme}`).toContain(`${names[k]}:${v.toLowerCase()}`)
  })
})
