import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'
const BASE = 'http://127.0.0.1:5173', PW = 'ChangeMe!Dev123'
let fails = 0
const ok = (c, m) => { console.log(c ? 'PASS' : 'FAIL', m); if (!c) fails++ }
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function apiUser(email) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })
  const cookie = r.headers.get('set-cookie').split(';')[0], csrf = (await r.json()).csrf_token
  return async (method, path, body) => { const x = await fetch(`${BASE}/api/v1${path}`, { method, headers: { cookie, 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }); return { s: x.status, j: await x.json().catch(() => null) } }
}
const browsers = []
async function session(email) {
  const b = await puppeteer.launch({ args: (process.env.CHROME_PATH ? ['--no-sandbox'] : [...chromium.args, '--no-sandbox']), executablePath: process.env.CHROME_PATH || await chromium.executablePath(), headless: 'shell' }); browsers.push(b)   // separate browser = isolated cookies
  const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 })
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle0' }); await p.type('#email', email); await p.type('#password', PW)
  await Promise.all([p.waitForNavigation({ waitUntil: 'networkidle0' }), p.click('button[type=submit]')]); return p
}
const click = async (p, sel) => { const el = await p.waitForSelector(sel, { timeout: 8000 }); await el.click() }
const text = p => p.evaluate(() => document.body.innerText)
const waitText = async (p, re, t = 8000) => { const end = Date.now() + t; while (Date.now() < end) { if (re.test(await text(p))) return true; await sleep(150) } return false }

const sam = await session('sam@newtonite.dev'), api = { priya: await apiUser('priya@newtonite.dev'), lead: await apiUser('lead@newtonite.dev') }
// two unassigned urgent Platform items sam can see (both seeded; if earlier runs claimed some, fresh ones appear)
const list = await sam.evaluate(async () => (await (await fetch('/api/v1/work-items?view=unassigned_urgent&team_id=1&page_size=5')).json()).items.map(i => i.id))
const [X, Y] = list

// A. lost claim race: item loaded as unassigned, priya claims first, sam then clicks Claim
await sam.goto(`${BASE}/work/${X}`, { waitUntil: 'networkidle0' })
ok(await waitText(sam, /Claim this item/), 'A1 unassigned item offers "Claim this item"')
const pc = await api.priya('POST', `/work-items/${X}/assign`, { assignee_id: 5 }); ok(pc.s === 200, 'A2 priya claims through the API first')
await click(sam, 'button ::-p-text(Claim this item)')
ok(await waitText(sam, /Someone else claimed this item first/), 'A3 UI shows the lost-race banner (409 already_assigned)')
const t = await text(sam); ok(/Priya Member/.test(t), 'A4 UI refreshed to the winner as assignee')
ok(!(await sam.$('[role=status]')), 'A5 no false success toast')

// B. claim for real, then stale edit
await sam.goto(`${BASE}/work/${Y}`, { waitUntil: 'networkidle0' })
await click(sam, 'button ::-p-text(Claim this item)')
ok(await waitText(sam, /Item claimed/) && await waitText(sam, /Start work/), 'B1 claim succeeds, next action becomes "Start work"')
const cur = (await api.lead('GET', `/work-items/${Y}`)).j
const bump = await api.lead('PATCH', `/work-items/${Y}`, { expected_version: cur.version, title: 'Edited by lead meanwhile' }); ok(bump.s === 200, 'B2 lead edits the item behind sam\'s back')
const target = cur.priority === 'critical' ? 'low' : 'critical'
await sam.select('select[aria-label="Change priority"]', target)
ok(await waitText(sam, /changed while you were working/), 'B3 stale change shows the conflict banner')
ok((await text(sam)).includes('Edited by lead meanwhile'), 'B4 UI refreshed to the newer server record')
ok((await api.lead('GET', `/work-items/${Y}`)).j.priority === cur.priority, `B5 server priority still ${cur.priority}: the stale request did not overwrite it`)
await click(sam, 'button ::-p-text(retry on latest)')
ok(await waitText(sam, /Priority set to/), 'B6 explicit retry succeeds against the reviewed version')
ok((await api.lead('GET', `/work-items/${Y}`)).j.priority === target, `B7 server now has the retried value (${target})`)

// C. create via UI with a double-click on submit -> exactly one item
const title = `E2E duplicate guard ${Date.now()}`
await sam.goto(`${BASE}/work`, { waitUntil: 'networkidle0' })
await click(sam, 'button ::-p-text(Create work item)'); await sam.waitForSelector('#c-title'); await sam.type('#c-title', title)
const btn = await sam.waitForSelector('dialog[open] button[type=submit]'); await Promise.all([btn.click({ clickCount: 2, delay: 5 }), sleep(10)])
ok(await waitText(sam, /created/), 'C1 success only after the server confirms (toast)')
await sleep(500)
const found = await sam.evaluate(async q => (await (await fetch('/api/v1/work-items?q=' + encodeURIComponent(q))).json()).total, title); ok(found === 1, `C2 double-click created exactly one item (found ${found})`)

// D. workflow: sam submits for approval; cannot approve; lead approves via a second isolated session
await sam.goto(`${BASE}/work/${Y}`, { waitUntil: 'networkidle0' })
await click(sam, 'button ::-p-text(Start work)'); ok(await waitText(sam, /Status changed to In progress|In progress/), 'D1 assignee starts work')
await sleep(400); await click(sam, 'button ::-p-text(Submit for approval)'); ok(await waitText(sam, /Awaiting approval/), 'D2 assignee submits for approval')
await sleep(300); const approveBtn = await sam.$$eval('button', bs => bs.filter(x => x.textContent.trim() === 'Approve').map(x => x.disabled)); ok(approveBtn.length === 0 || approveBtn.every(Boolean), 'D3 a member sees no enabled Approve control')
const direct = await (await apiUser('sam@newtonite.dev'))('POST', `/work-items/${Y}/transition`, { to_status: 'resolved', expected_version: (await api.lead('GET', `/work-items/${Y}`)).j.version }); ok(direct.s === 403, 'D4 direct API call by the member is rejected (403)')
const leadP = await session('lead@newtonite.dev'); await leadP.goto(`${BASE}/work/${Y}`, { waitUntil: 'networkidle0' })
await click(leadP, 'button ::-p-text(Approve)'); await click(leadP, 'dialog[open] button ::-p-text(Approve)')
ok(await waitText(leadP, /Resolved/), 'D5 lead approves through the confirmation dialog'); ok((await api.lead('GET', `/work-items/${Y}`)).j.status === 'resolved', 'D6 server status is resolved')
const acts = (await api.lead('GET', `/work-items/${Y}/activity`)).j.items.map(a => a.action); ok(acts.includes('approved') && acts.includes('claimed'), 'D7 activity timeline recorded claim and approval: ' + acts.join(','))
console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nALL BROWSER CHECKS PASSED'); for (const x of browsers) await x.close()
