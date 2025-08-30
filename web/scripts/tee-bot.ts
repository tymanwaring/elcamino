// book-tee.ts
// Run:
//   PWDEBUG=1 npx ts-node book-tee.ts
//
// Minimal .env:
// user=UnderPar
// password=Golfer@111
// hostURL=https://www.elcaminoclub.com/
// MEMBER_NAME=Scott Manwaring
// TARGET_YEAR=2025
//
// # Optional (skip wait if blank/missing):
// EXECUTE_TIME=11:23:00
// SPAM_BURST=30
// SPAM_SLEEP_MS=2
// MAX_SPAM_SECONDS=180
//
// # Optional calendar rules:
// DAYS_OFF=Saturday,Sunday
// OVERLAY_SELECTOR=.foreTeesMemberCalendarIndicator
// FAST_OVERLAY_TIMEOUT_MS=400
//
// # Optional time picking:
// EARLIEST_TIME=6:45 AM      # leave blank to pick the earliest available
// TIME_SUFFIX=:57 AM         # optional suffix filter
//
// # Optional golfers (JSON array):
// GOLFERS=["Scott Manwaring","Leslie Manwaring","Paul Woznik","Marilyn Woznik"]
//
// # Safety toggle (no final confirm step is implemented in this file):
// DRY_RUN=1
//
// # One toggle for all debug behaviors:
// DEBUG=0        # set to 1 for slowMo+DevTools+tracing+verbose logs+keep-open

import type { Page, BrowserContext, Locator, Frame } from 'playwright-core';
// Load .env only in local/dev; Vercel provides envs without dotenv
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
  try { require('dotenv').config(); } catch {}
}

const {
  user: USER,
  password: PASS,
  hostURL,
  MEMBER_NAME = 'Scott Manwaring',

  EXECUTE_TIME,
  SPAM_BURST = '20',
  SPAM_SLEEP_MS = '5',
  MAX_SPAM_SECONDS = '120',

  OVERLAY_SELECTOR = '.foreTeesMemberCalendarIndicator',
  FAST_OVERLAY_TIMEOUT_MS = '400',

  DAYS_OFF = '',
  TARGET_YEAR,

  EARLIEST_TIME = '',
  TIME_SUFFIX = '',

  GOLFERS,
  DRY_RUN = '1',

  DEBUG = '0',
} = process.env;

const IS_DEBUG = DEBUG === '1' || DEBUG?.toLowerCase() === 'true';
const DEBUG_SLOW_MS = 120; // auto slowMo when DEBUG=1
const IS_DRY_RUN = DRY_RUN === '1' || DRY_RUN?.toLowerCase() === 'true';

async function getChromiumForRuntime() {
  const isProd = process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (isProd) {
    const mod = await import('playwright-core');
    return mod.chromium;
  }
  // Dev/local uses full playwright (with managed browsers)
  const mod = await import('playwright');
  return (mod as any).chromium as typeof import('playwright-core')['chromium'];
}

function slog(message: string) {
  // Single-line, prefix for easy parsing in logs
  console.log(`[STEP] ${message}`);
}

// Parse golfers from JSON array in env
const GOLFER_LIST: string[] = (() => {
  try {
    if (!GOLFERS) return [];
    const parsed = JSON.parse(GOLFERS);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    console.warn('⚠️  GOLFERS is not valid JSON — expected ["Name 1","Name 2",...]. Ignoring.');
    return [];
  }
})();

function dlog(...args: any[]) { if (IS_DEBUG) console.log('[DEBUG]', ...args); }

// --- sanity checks ---
if (!USER || !PASS || !hostURL) { console.error('Missing env: user, password, hostURL'); process.exit(1); }
if (!TARGET_YEAR) { console.error('Missing env: TARGET_YEAR'); process.exit(1); }

// ---------- tracing (auto in DEBUG) ----------
async function startTracing(ctx: BrowserContext) {
  if (!IS_DEBUG) return;
  await ctx.tracing.start({ screenshots: true, snapshots: true, sources: true });
}
async function stopTracing(ctx: BrowserContext) {
  if (!IS_DEBUG) return;
  await ctx.tracing.stop({ path: 'trace.zip' });
  console.log('[DEBUG] trace.zip saved');
}

// ---------- optional noisy logs in DEBUG ----------
function wireDebugLogs(page: Page) {
  if (!IS_DEBUG) return;
  page.on('console', (msg) => console.log(`[PAGE ${msg.type()}]`, msg.text()));
  page.on('request', (r) => console.log('[REQ]', r.method(), r.url()));
  page.on('response', (r) => console.log('[RES]', r.status(), r.url()));
  page.on('framenavigated', (f) => console.log('[NAV]', 'frame:', f.url()));
}

// ---------- portal actions ----------
async function login(page: Page) {
  slog('Navigating to login');
  await page.goto(new URL('/login', hostURL!).toString(), { waitUntil: 'domcontentloaded' });
  slog('Filling credentials');
  await page.locator('#lgUserName').fill(USER!);
  await page.locator('#lgPassword').fill(PASS!);
  slog('Submitting login');
  await page.getByRole('button', { name: /login/i }).first().click();
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  slog('Post-login settle done');
}

async function openTeeTimes(page: Page) {
  slog('Locating Tee Times link');
  const link = page.getByRole('link', { name: /book a tee time/i }).first();
  await link.waitFor({ state: 'visible', timeout: 10_000 });
  slog('Clicking Tee Times link');
  await link.click();
}

async function selectMember(page: Page) {
  slog(`Selecting member: ${MEMBER_NAME}`);
  const member = page.getByRole('link', { name: new RegExp(`^${MEMBER_NAME}$`, 'i') }).first();
  await member.waitFor({ state: 'visible', timeout: 10_000 });
  await member.click();
}

// ---------- execute-time wait (robust, still mandatory if EXECUTE_TIME set) ----------
async function waitForRelease(page: Page) {
  const exec = (EXECUTE_TIME ?? '').trim();
  if (!exec) { 
    dlog('waitForRelease: EXECUTE_TIME empty → skip immediately');
    return; 
  }
  slog(`Server Execute Time (HH:MM:SS AM/PM): ${exec}`);

  const burst  = Number.parseInt(SPAM_BURST  ?? '20', 10);
  const sleep  = Number.parseInt(SPAM_SLEEP_MS ?? '5', 10);
  const maxMs  = Number.parseInt(MAX_SPAM_SECONDS ?? '120', 10) * 1000;

  const refresh = page.getByRole('link', { name: /refresh calendar/i }).first();
  try {
    await refresh.waitFor({ state: 'visible', timeout: 10_000 });
  } catch {
    throw new Error('waitForRelease: Expected Refresh link, but none found (not on tee sheet?)');
  }

  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    // If we navigated away and refresh vanished, keep looping (but don’t crash).
    let stillHere = 0;
    try { stillHere = await refresh.count(); } catch { stillHere = 0; }
    if (!stillHere) {
      dlog('waitForRelease: refresh link temporarily missing; retrying');
      await page.waitForTimeout(sleep);
      continue;
    }

    // Click burst
    try {
      const h = await refresh.elementHandle();
      if (h) {
        for (let i = 0; i < burst; i++) {
          try { await h.dispatchEvent('click'); } catch {}
        }
      }
    } catch {}

    // Check server time using locator text (avoid context loss)
    let bodyText = '';
    try { bodyText = await page.locator('body').innerText({ timeout: 500 }); } catch {}
    if (bodyText.includes(exec)) {
      dlog(`waitForRelease: server clock reached ${exec}`);
      return; // ✅ success
    }

    if (sleep > 0) {
      try { await page.waitForTimeout(sleep); } catch {}
    }
  }

  throw new Error(`waitForRelease: Timed out after ${maxMs/1000}s waiting for "${exec}"`);
}


// ---------- overlay helpers (evaluate-free, frame-aware, no-throw) ----------
async function isOverlayBlockingIn(frame: Page | Frame, sel: string): Promise<boolean> {
  if (!sel) return false;
  let loc = frame.locator(sel).first();

  // If the frame is detaching, any of these can throw—wrap individually.
  try {
    const exists = await loc.count();
    if (!exists) return false;
  } catch { return false; }

  try {
    const visible = await loc.isVisible();
    if (!visible) return false;
  } catch { return false; }

  try {
    const box = await loc.boundingBox();
    if (!box || box.width < 2 || box.height < 2) return false;
  } catch { return false; }

  // Consider it blocking if it’s visible & has a real box.
  return true;
}

async function waitOverlayGoneSafe(page: Page, sel: string, timeoutMs: number) {
  if (!sel || !timeoutMs || timeoutMs <= 0) return;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Tolerate navigation churn; don’t throw.
    try { await page.waitForLoadState('domcontentloaded', { timeout: 200 }); } catch {}

    // Check main page
    try {
      if (!(await isOverlayBlockingIn(page, sel))) return;
    } catch {}

    // Check frames snapshot (avoid live mutation during iteration)
    let frames: Frame[] = [];
    try { frames = page.frames().slice(); } catch { frames = []; }

    let blockingInFrames = false;
    for (const f of frames) {
      try {
        if (await isOverlayBlockingIn(f, sel)) { blockingInFrames = true; break; }
      } catch {}
    }
    if (!blockingInFrames) return;

    // Small slice for spinner to clear; never blocks long.
    try { await page.waitForTimeout(15); } catch {}
  }
  // Timeboxed → proceed without throwing
}


// ---------- helpers ----------
function weekdayNorm(h: string) {
  const k = h.trim().slice(0, 2).toLowerCase();
  return k === 'su' ? 'sunday'
       : k === 'mo' ? 'monday'
       : k === 'tu' ? 'tuesday'
       : k === 'we' ? 'wednesday'
       : k === 'th' ? 'thursday'
       : k === 'fr' ? 'friday'
       : k === 'sa' ? 'saturday'
       : h.trim().toLowerCase();
}

function timeToMinutes12h(label: string): number | null {
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

// ---------- calendar (day) picking ----------
/** FAST path: pick bottom-right **open** day (skip ft_code_0 / "View Only" / disabled + DAYS_OFF) */
async function pickDayFast(page: Page, daysOff: string[]): Promise<boolean> {
  return await page.evaluate(({ daysOff, overlaySel }) => {
    const norm = (h: string) => {
      const k = h.trim().slice(0, 2).toLowerCase();
      return k === 'su' ? 'sunday'
           : k === 'mo' ? 'monday'
           : k === 'tu' ? 'tuesday'
           : k === 'we' ? 'wednesday'
           : k === 'th' ? 'thursday'
           : k === 'fr' ? 'friday'
           : k === 'sa' ? 'saturday'
           : h.trim().toLowerCase();
    };

    // If overlay still covers, bail
    const overlay = overlaySel ? document.querySelector(overlaySel) as HTMLElement | null : null;
    if (overlay) {
      const cs = getComputedStyle(overlay);
      const r = overlay.getBoundingClientRect();
      const block = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' &&
        r.width > 1 && r.height > 1 && cs.pointerEvents !== 'none' &&
        r.left <= 1 && r.top <= 1 && r.right >= (innerWidth - 1) && r.bottom >= (innerHeight - 1);
      if (block) return false;
    }

    const headers = Array.from(document.querySelectorAll('[role="columnheader"], th')) as HTMLElement[];
    const boxes = headers.map(h => h.getBoundingClientRect());
    const texts = headers.map(h => (h.innerText || h.textContent || '').trim());
    const headerBottom = boxes.length ? Math.max(...boxes.map(b => b.top + b.height)) : 0;

    // TDs with numeric <a>, not closed/view-only
    const tds = Array.from(document.querySelectorAll('td')) as HTMLTableCellElement[];
    const cells = tds.map(td => {
      const a = td.querySelector('a');
      const label = (a?.textContent || '').trim();
      const rect = (a || td).getBoundingClientRect();
      return { td, a, label, rect };
    })
    .filter(x => /^\d{1,2}$/.test(x.label))
    .filter(x => x.rect.top > headerBottom + 1)
    .filter(x => {
      const td = x.td;
      const cls = (td.className || '').toLowerCase();
      const title = (td.getAttribute('title') || '').toLowerCase();
      const closed = cls.includes('ft_code_0') || title.includes('view only') ||
                     cls.includes('ui-state-disabled') || cls.includes('ui-datepicker-unselectable');
      return !closed;
    });

    if (!cells.length) return false;

    // bottom-right first
    cells.sort((a, b) => (b.rect.top - a.rect.top) || (b.rect.left - a.rect.left));

    for (const c of cells) {
      // map to weekday
      let weekday = '';
      for (let i = 0; i < boxes.length; i++) {
        const hb = boxes[i];
        const centerX = c.rect.left + c.rect.width / 2;
        if (centerX >= hb.left && centerX <= hb.right) { weekday = norm(texts[i] || ''); break; }
      }
      if (weekday && daysOff.includes(weekday)) continue;

      (c.a as HTMLElement | null)?.scrollIntoView?.({ behavior: 'instant', block: 'center', inline: 'center' });
      (c.a as HTMLElement | null)?.click?.();
      if (!c.a) (c.td as HTMLElement).click();
      return true;
    }
    return false;
  }, { daysOff, overlaySel: OVERLAY_SELECTOR });
}

/** Fallback via locators (also respects view-only + DAYS_OFF) */
async function pickDayFallback(page: Page, daysOff: string[]) {
  const headers = await page.getByRole('columnheader').all();
  const boxes = await Promise.all(headers.map(h => h.boundingBox()));
  const texts = await Promise.all(headers.map(h => h.innerText()));
  const headerBottom = Math.max(...boxes.filter(Boolean).map(b => (b as any).y + (b as any).height), 0);

  const links = await page.getByRole('link', { name: /^\d{1,2}$/ }).elementHandles();

  type Cand = { label: string; x: number; y: number; cx: number };
  const cands: Cand[] = [];

  for (const h of links) {
    const closed = await h.evaluate((node) => {
      const el = node as unknown as Element;
      const td = (el as any)?.closest?.('td') as HTMLTableCellElement | null;
      if (!td) return false;
      const cls = (td.className || '').toLowerCase();
      const title = (td.getAttribute('title') || '').toLowerCase();
      return cls.includes('ft_code_0') || title.includes('view only') ||
             cls.includes('ui-state-disabled') || cls.includes('ui-datepicker-unselectable');
    });
    if (closed) continue;

    const label = (await h.evaluate(el => (el.textContent || '').trim())) || '';
    const box = await h.boundingBox();
    if (!box) continue;
    if (box.y < headerBottom + 1) continue;

    cands.push({ label, x: box.x, y: box.y, cx: box.x + box.width / 2 });
  }

  if (!cands.length) throw new Error('No open days found');

  // bottom-right first
  cands.sort((a, b) => (b.y - a.y) || (b.x - a.x));

  for (const c of cands) {
    let weekday = '';
    for (let i = 0; i < headers.length; i++) {
      const hb = boxes[i];
      if (!hb) continue;
      if (c.cx >= hb.x && c.cx <= hb.x + hb.width) { weekday = weekdayNorm(texts[i] || ''); break; }
    }
    if (weekday && daysOff.includes(weekday)) continue;

    const target: Locator = page.getByRole('link', { name: new RegExp(`^${c.label}$`) }).last();
    await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
    await target.click({ timeout: 1000 });
    return;
  }

  throw new Error('All candidate days were filtered out (view-only or DAYS_OFF).');
}

async function pickLastValidDay(page: Page) {
  const daysOff = (DAYS_OFF || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  slog('Picking a valid day');

  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
  if (await pickDayFast(page, daysOff)) return;

  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
  await pickDayFallback(page, daysOff);
}

// ---------- time list helpers ----------
async function findTimesContext(page: Page): Promise<Page | Frame> {
  const cls = 'a.teetime_button';
  if (await page.locator(cls).first().count()) return page;
  for (const f of page.frames()) { try { if (await f.locator(cls).first().count()) return f; } catch {} }

  const rx = /^\d{1,2}:\d{2}\s*[AP]M$/i;
  if (await page.getByText(rx).first().count()) return page;
  for (const f of page.frames()) { try { if (await f.getByText(rx).first().count()) return f; } catch {} }

  return page;
}

async function waitForTimesReady(page: Page) {
  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
  await page.waitForFunction(() => {
    const rx = /^\d{1,2}:\d{2}\s*[AP]M$/i;
    const inMain = document.querySelector('a.teetime_button') ||
      Array.from(document.querySelectorAll('a,button,[role="button"]'))
        .some(n => rx.test((n.textContent || '').trim()));
    if (inMain) return true;
    for (const w of Array.from(window.frames)) {
      try {
        const d = w.document;
        if (!d) continue;
        if (d.querySelector('a.teetime_button')) return true;
        const nodes = Array.from(d.querySelectorAll('a,button,[role="button"]'));
        if (nodes.some(n => rx.test((n.textContent || '').trim()))) return true;
      } catch {}
    }
    return false;
  }, undefined, { timeout: 5000 }).catch(() => {});
  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
}

// ---------- time picking (slim) ----------
async function clickFirstTimeAfter(page: Page) {
  slog('Scanning for tee times');
  await waitForTimesReady(page);

  const earliestStr = (EARLIEST_TIME || '').trim(); // blank = allow earliest
  const suffix = (TIME_SUFFIX || '').trim();
  const earliestMin = earliestStr ? timeToMinutes12h(earliestStr) : 0;
  if (earliestStr && earliestMin == null) throw new Error(`Bad EARLIEST_TIME format: "${earliestStr}"`);

  const ctx = await findTimesContext(page);

  const buckets: Locator[] = [
    ctx.locator('a.teetime_button'),
    ctx.getByRole('button'),
    ctx.getByRole('link'),
    ctx.locator('[role="button"]'),
    ctx.getByText(/^\d{1,2}:\d{2}\s*[AP]M$/i),
  ];

  type Item = { loc: Locator; label: string; min: number };
  const items: Item[] = [];

  for (const b of buckets) {
    const list = await b.all();
    for (const loc of list) {
      const tx = (await loc.innerText()).trim();
      const m = timeToMinutes12h(tx);
      if (m == null) continue;
      if (suffix && !tx.endsWith(suffix)) continue;
      items.push({ loc, label: tx, min: m });
    }
    if (items.length) break; // stop once class bucket yields results
  }

  if (!items.length) throw new Error('No tee time buttons found.');

  items.sort((a, b) => a.min - b.min);
  const target = items.find(i => i.min >= (earliestMin ?? 0)) ?? items[0];

  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
  await target.loc.scrollIntoViewIfNeeded({ timeout: 300 });

  // Probe to avoid spinner intercept; then real click to navigate to golfer page
  const canClick = await target.loc.click({ trial: true }).then(() => true).catch(() => false);
  if (!canClick) await page.waitForTimeout(40);
  await waitOverlayGoneSafe(page, OVERLAY_SELECTOR!, parseInt(FAST_OVERLAY_TIMEOUT_MS || '400', 10));
  await target.loc.click({ timeout: 600 });

  dlog('Clicked time:', target.label);
  slog(`Clicked tee time: ${target.label}`);
}

// ---------- golfers fill (final page) ----------
/**
 * Fill golfers on the reservation page:
 * - Click "Members" tab (exact)
 * - Type into `.ftMs-input`
 * - Click exact match for the golfer name
 * (Names assumed unique as per your note.)
 */
/**
 * Add golfers on the member select screen.
 * Expects GOLFER_LIST like ["Scott Manwaring","Leslie Manwaring", ...]
 * Clicks: Members tab -> .ftMs-input -> "Last, First" suggestion -> .ftMs-clear
 */
async function fillGolfers(page: Page, names: string[]) {
  if (!names.length) {
    console.log('No golfers to add');
    return;
  }
  slog(`Adding golfers: ${names.join(', ')}`);

  // Scope everything to the ForeTees member picker block
  const container = page.locator('.ftMs-memberSelect, .ftMs-memberSearch').first();

  // Make sure the Members tab is active
  const membersTab = page.getByText('Members', { exact: true }).first();
  console.log('membersTab', membersTab);
  await membersTab.waitFor({ state: 'visible', timeout: 5000 });
  await membersTab.click();

  const input = container.locator('.ftMs-input').first();
  const clearBtn = container.locator('.ftMs-clear').first();

  for (const raw of names) {
    // Convert "First Last" -> "Last, First" (UI label form)
    // If the env already provides "Last, First", we use it as-is.
    let searchText = raw.trim();
    let uiLabel = searchText;

    if (!/,/.test(searchText)) {
      const parts = searchText.split(/\s+/);
      const first = parts.shift() ?? '';
      const last = parts.join(' ');
      uiLabel = `${last}, ${first}`.replace(/\s+,/g, ',').trim();
    }

    // Type the raw name (what a user would type), click exact "Last, First"
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('');
    await input.fill(searchText);

    const suggestion = page.getByText(uiLabel, { exact: true }).first();
    await suggestion.waitFor({ state: 'visible', timeout: 5000 });
    await suggestion.click();

    // Clear search box to be safe for next name (matches your codegen)
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click().catch(() => {});
    } else {
      // fallback: quick clear if the clear button isn't present
      await input.fill('');
    }

    // tiny settle (UI often animates a chip/pill into the slot)
    await page.waitForTimeout(50);
  }
}

/**
 * Finalize the booking by clicking the "Submit Changes" button.
 */
async function submitBooking(page: Page) {
  slog('Submitting booking');
  const button = page.getByRole('link', { name: 'Submit Changes' }).first();
  await button.waitFor({ state: 'visible', timeout: 5000 });
  await button.click();
  console.log('✅ Submitted booking');
}



// ---------- main ----------
async function main() {
  const chromium = await getChromiumForRuntime();

  const isProd = process.env.VERCEL || process.env.NODE_ENV === 'production';
  let browser: any;
  if (isProd) {
    // Hint Sparticuz to extract required AWS Lambda libs on Vercel
    if (!process.env.AWS_EXECUTION_ENV && !process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs20.x';
    }
    const lambdaMod = await import('@sparticuz/chromium');
    const lambdaChromium: any = (lambdaMod as any).default ?? lambdaMod;
    const executablePath: string = await lambdaChromium.executablePath();
    browser = await chromium.launch({
      args: lambdaChromium.args,
      executablePath,
      headless: true,
    });
  } else {
    browser = await chromium.launch({
      headless: false,
      slowMo: IS_DEBUG ? DEBUG_SLOW_MS : 0,  // auto slowMo in DEBUG
      devtools: IS_DEBUG,                    // auto DevTools in DEBUG
    });
  }
  const ctx = await browser.newContext();
  await startTracing(ctx); // auto tracing in DEBUG
  await ctx.clearCookies();

  const page = await ctx.newPage();
  wireDebugLogs(page);     // auto noisy logs in DEBUG

  if (IS_DRY_RUN) console.log('🛟 DRY_RUN=1 — running without any final booking confirmation.');

  try {
    slog('Start flow');
    await login(page);
    await openTeeTimes(page);
    await selectMember(page);

    await waitForRelease(page);      // no-op if EXECUTE_TIME empty
    await pickLastValidDay(page);    // fast + fallback, skips view-only & DAYS_OFF
    await clickFirstTimeAfter(page); // pick a time (navigates to golfer page)
    await fillGolfers(page, GOLFER_LIST); // add golfers by name
    await submitBooking(page);

    if (IS_DEBUG) {
      console.log('👀 DEBUG=1 — leaving the browser open. Press Ctrl+C to exit.');
      await new Promise(() => {});
    }
  } finally {
    await stopTracing(ctx);
    // if (!IS_DEBUG) await browser.close(); // Commented out to keep the browser open for debugging
  }
}

main().catch(err => { console.error(err); process.exit(1); });
