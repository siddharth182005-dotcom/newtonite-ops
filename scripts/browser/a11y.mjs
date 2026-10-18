import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
import { readFileSync } from 'node:fs'
const axe = readFileSync('node_modules/axe-core/axe.min.js', 'utf8'), BASE = 'http://127.0.0.1:5173'
const b = await puppeteer.launch({ args: (process.env.CHROME_PATH ? ['--no-sandbox'] : [...chromium.args, '--no-sandbox']), executablePath: process.env.CHROME_PATH || await chromium.executablePath(), headless: 'shell' })
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 })
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle0' })
// keyboard: Tab focus ring on login
await p.keyboard.press('Tab'); const ring = await p.evaluate(() => { const s = getComputedStyle(document.activeElement); return `${document.activeElement.tagName}#${document.activeElement.id} outline=${s.outlineStyle} ${s.outlineWidth}` })
console.log('login focus ring:', ring)
const run = async (name) => { await p.evaluate(axe); const r = await p.evaluate(() => axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] }))
  const v = r.violations; console.log(`${name}: ${v.length ? v.length + ' violation type(s)' : 'no violations'} (${r.passes.length} rules passed)`)
  for (const x of v) console.log(`   - ${x.id} [${x.impact}] x${x.nodes.length}: ${x.nodes[0].target.join(' ')} :: ${(x.nodes[0].failureSummary || '').split('\n')[1] || ''}`.slice(0, 260)) }
await run('login (dark)')
await p.type('#email', 'lead@newtonite.dev'); await p.type('#password', 'ChangeMe!Dev123')
await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')])
const id = await p.evaluate(async () => (await (await fetch('/api/v1/work-items?page_size=1&view=needs_attention')).json()).items[0].id)
for (const theme of ['dark', 'light']) {
  await p.evaluate(t => { localStorage.setItem('theme', t) }, theme)
  for (const path of ['/', '/work', '/attention', '/teams', '/activity', '/settings', `/work/${id}`]) {
    await p.goto(BASE + path, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 300)); await run(`${theme} ${path.replace(/\d+$/, ':id')}`) }
  // dialog open
  await p.goto(BASE + '/work', { waitUntil: 'networkidle0' }); await (await p.waitForSelector('button ::-p-text(Create work item)')).click(); await p.waitForSelector('#c-title'); await new Promise(r => setTimeout(r, 300)); await run(`${theme} create dialog`)
}
// keyboard: "/" focuses search, Escape closes dialog
await p.goto(BASE + '/', { waitUntil: 'networkidle0' }); await p.keyboard.press('/'); console.log('"/" focuses search:', await p.evaluate(() => document.activeElement.getAttribute('aria-label')))
await (await p.waitForSelector('button ::-p-text(Create work item)')).click(); await new Promise(r => setTimeout(r, 300)); await p.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 300))
console.log('Escape closes dialog:', await p.evaluate(() => !document.querySelector('dialog[open]')))
console.log('reduced-motion rule present:', await p.evaluate(() => [...document.styleSheets].some(s => [...s.cssRules].some(r => r.media && r.media.mediaText.includes('prefers-reduced-motion')))))
await b.close()
