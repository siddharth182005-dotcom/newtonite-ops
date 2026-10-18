import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
const [,, tag = 'x', ...pages] = process.argv
const W = { desktop: [1440, 900], laptop: [1280, 800], tablet: [768, 1024], mobile: [390, 844] }
const widths = (process.env.W || 'desktop').split(',')
const b = await puppeteer.launch({ args: (process.env.CHROME_PATH ? ['--no-sandbox'] : [...chromium.args, '--no-sandbox']), executablePath: process.env.CHROME_PATH || await chromium.executablePath(), headless: 'shell' })
for (const w of widths) {
  const [width, height] = W[w]
  const p = await b.newPage(); await p.setViewport({ width, height, deviceScaleFactor: 1 })
  await p.goto('http://127.0.0.1:5173/login', { waitUntil: 'networkidle0' })
  await p.type('#email', process.env.USER_EMAIL || 'lead@newtonite.dev'); await p.type('#password', 'ChangeMe!Dev123')
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')])
  await p.evaluate(t => localStorage.setItem('theme', t), process.env.THEME || 'dark')
  for (const path of pages) {
    await p.goto('http://127.0.0.1:5173' + path, { waitUntil: 'networkidle0' }); await new Promise(r => setTimeout(r, 300))
    const over = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
    const name = `out/${tag}-${w}-${path.replace(/[\/?=&]/g, '_') || 'home'}.png`
    await p.screenshot({ path: name, fullPage: false })
    console.log(w, path, over.sw > over.iw + 1 ? `OVERFLOW sw=${over.sw} iw=${over.iw}` : 'no h-overflow', name)
  }
  await p.close()
}
await b.close()
