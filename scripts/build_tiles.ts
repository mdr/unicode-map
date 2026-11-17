// Pre-builds pure view's glyph tiles as WebP files in public/tiles, so the map can fetch them
// instead of drawing every glyph in the browser.
//
// The tiles are drawn by the app itself, in headless Chrome, with the same fonts and code as the
// live rendering, so the two match exactly. Run after `pnpm data`:
//
//   pnpm tiles
//
// It needs Google Chrome (nixpkgs has no Chromium for macOS); set CHROME to use another binary.

import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { createServer } from "vite-plus"

const OUT = "public/tiles"
const CHROME = process.env["CHROME"] ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const BATCH = 16
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

interface CdpTarget {
  type: string
  webSocketDebuggerUrl: string
}
interface CdpResponse {
  id?: number
  result?: {
    result?: { value?: unknown }
    exceptionDetails?: { text: string; exception?: { description?: string } }
  }
}
type TilePosition = [plane: number, tileY: number, tileX: number]
interface DrawnTile {
  p: number
  ty: number
  tx: number
  b64: string
  fontsTimedOut: boolean
}

/** Write a drawn tile to its file; returns its name ("res/plane/ty-tx") and contents. */
const writeTile = (res: number, { p, ty, tx, b64, fontsTimedOut }: DrawnTile): { name: string; buf: Buffer } => {
  if (fontsTimedOut) console.warn(`  fonts didn't load for ${res}/${p}/${ty}-${tx}; drawn anyway`)
  const buf = Buffer.from(b64, "base64")
  mkdirSync(join(OUT, `${res}`, `${p}`), { recursive: true })
  writeFileSync(join(OUT, `${res}`, `${p}`, `${ty}-${tx}.webp`), buf)
  return { name: `${res}/${p}/${ty}-${tx}`, buf }
}

// --- Serve the app and open it in headless Chrome -------------------------------------------

const server = await createServer({ server: { port: 5298 }, logLevel: "warn" })
await server.listen()
const appUrl = server.resolvedUrls?.local[0]
if (!appUrl) throw new Error("Vite didn't say where it's serving")

const profile = mkdtempSync(join(tmpdir(), "umap-tiles-"))
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--window-size=800,600",
    // CI runners (Ubuntu 24.04) don't allow Chrome's sandbox; it's only drawing our own page.
    ...(process.env["CI"] ? ["--no-sandbox"] : []),
    "about:blank"
  ],
  { stdio: ["ignore", "ignore", "pipe"] }
)

// Chrome picks a free port and says which on stderr; keep its output in case it fails to start.
let chromeLog = ""
const debugPort = await new Promise<number>((resolve, reject) => {
  const timer = setTimeout(
    () => reject(new Error(`Chrome at ${CHROME} didn't start within 60s:\n${chromeLog}`)),
    60_000
  )
  chrome.stderr.on("data", (d) => {
    chromeLog += String(d)
    const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(chromeLog)
    if (m) {
      clearTimeout(timer)
      resolve(Number(m[1]))
    }
  })
  chrome.on("error", (e) => reject(new Error(`Couldn't run Chrome at ${CHROME}: ${e.message}`)))
  chrome.on("exit", (code) => reject(new Error(`Chrome exited (${code}) before starting:\n${chromeLog}`)))
})
let page: CdpTarget | undefined
for (let i = 0; i < 100 && !page; i++) {
  const targets = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()) as CdpTarget[]
  page = targets.find((t) => t.type === "page")
  if (!page) await sleep(100)
}
if (!page) throw new Error("Chrome has no page to drive")
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener("open", r))
let nextId = 0
const pending = new Map<number, (msg: CdpResponse) => void>()
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(String(ev.data)) as CdpResponse
  const reply = msg.id === undefined ? undefined : pending.get(msg.id)
  if (msg.id !== undefined && reply) {
    reply(msg)
    pending.delete(msg.id)
  }
})
const send = (method: string, params: object = {}): Promise<CdpResponse> =>
  new Promise((r) => {
    const id = ++nextId
    pending.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
/** Evaluate an expression in the page (awaiting promises) and return its value. */
const run = async (expression: string): Promise<unknown> => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails)
    throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text)
  return r.result?.result?.value
}

const cleanup = async (): Promise<void> => {
  ws.close()
  // Let Chrome finish exiting before removing its profile, which it writes to as it shuts down.
  const exited = new Promise((r) => chrome.once("exit", r))
  chrome.kill()
  await Promise.race([exited, sleep(5000)])
  await server.close()
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
  } catch (e) {
    console.warn(`Couldn't remove Chrome's temporary profile (${(e as NodeJS.ErrnoException).code}): ${profile}`)
  }
}

try {
  await send("Page.navigate", { url: `${appUrl}#pure` })
  for (let i = 0; i < 300; i++) {
    if (await run("!!window.__view").catch(() => false)) break
    await sleep(100)
  }

  // Helpers in the page: list a level's non-empty tiles, and draw and encode a batch of them.
  await run(`(async () => {
    const { GLYPH_LEVELS } = await import("/src/map/view/glyphLevels.ts");
    const v = window.__view, data = v.data;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const toB64 = (c) => new Promise((r) => c.toBlob((b) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result.split(",")[1]);
      fr.readAsDataURL(b);
    }, "image/webp", 1));  // quality 1: lossless
    window.__tiles = {
      levels: () => GLYPH_LEVELS.filter((l) => l.prebuilt),
      list(span) {
        const out = [], n = 256 / span;
        for (let p = 0; p < 17; p++) for (let ty = 0; ty < n; ty++) for (let tx = 0; tx < n; tx++) {
          let any = false;
          for (let y = 0; y < span && !any; y++) for (let x = 0; x < span && !any; x++) {
            // Anything assigned draws something: a glyph, or a placeholder for one with none.
            if (data.isAssigned((p << 16) | ((ty * span + y) << 8) | (tx * span + x))) any = true;
          }
          if (any) out.push([p, ty, tx]);
        }
        return out;
      },
      async render(res, span, batch) {
        const out = [];
        for (const [p, ty, tx] of batch) {
          let t = 0;
          while (!v.tileFontsReady(p, ty * span, span) && t++ < 600) await sleep(25);
          const c = v.buildGlyphTile(p, ty, tx, res, span);
          if (c) out.push({ p, ty, tx, b64: await toB64(c), fontsTimedOut: t > 600 });
        }
        return out;
      },
    };
    return true;
  })()`)

  rmSync(OUT, { recursive: true, force: true })
  const hash = createHash("sha256")
  const names: string[] = []
  let bytes = 0
  for (const { res, span } of (await run("window.__tiles.levels()")) as { res: number; span: number }[]) {
    const tiles = (await run(`window.__tiles.list(${span})`)) as TilePosition[]
    let levelBytes = 0
    for (let i = 0; i < tiles.length; i += BATCH) {
      const done = (await run(
        `window.__tiles.render(${res}, ${span}, ${JSON.stringify(tiles.slice(i, i + BATCH))})`
      )) as DrawnTile[]
      for (const tile of done) {
        const { name, buf } = writeTile(res, tile)
        names.push(name)
        hash.update(name).update(buf)
        levelBytes += buf.length
      }
      process.stdout.write(`\r  ${res}px: ${Math.min(i + BATCH, tiles.length)}/${tiles.length} tiles`)
    }
    bytes += levelBytes
    console.log(
      `\r  ${res}px (${span}×${span} code points per tile): ${tiles.length} tiles, ${(levelBytes / 1e6).toFixed(1)} MB`
    )
  }
  const version = hash.digest("hex").slice(0, 12)
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ version, tiles: names }))
  console.log(`Wrote ${names.length} tiles, ${(bytes / 1e6).toFixed(1)} MB, to ${OUT} (version ${version})`)
} finally {
  await cleanup()
}
