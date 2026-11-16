// Pre-builds pure view's glyph tiles as WebP files in public/tiles, so the map can fetch them
// instead of drawing every glyph in the browser.
//
// The tiles are drawn by the app itself, in headless Chrome, with the same fonts and code as the
// live rendering, so the two match exactly. Run after `pnpm data`:
//
//   pnpm tiles
//
// It needs Google Chrome (nixpkgs has no Chromium for macOS); set CHROME to use another binary.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "vite";

const OUT = "public/tiles";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DEBUG_PORT = 9334;
const BATCH = 16;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Serve the app and open it in headless Chrome -------------------------------------------

const server = await createServer({ server: { port: 5298 }, logLevel: "warn" });
await server.listen();
const appUrl = server.resolvedUrls.local[0];

const profile = mkdtempSync(join(tmpdir(), "umap-tiles-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--window-size=800,600",
  // CI runners (Ubuntu 24.04) don't allow Chrome's sandbox; it's only drawing our own page.
  ...(process.env.CI ? ["--no-sandbox"] : []),
  "about:blank",
], { stdio: "ignore" });

let page;
for (let i = 0; i < 100 && !page; i++) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
    page = targets.find((t) => t.type === "page");
  } catch {
    await sleep(100);
  }
}
if (!page) throw new Error(`Couldn't start Chrome at ${CHROME}`);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++nextId;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
/** Evaluate an expression in the page (awaiting promises) and return its value. */
async function run(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result.result.value;
}

const cleanup = async () => {
  ws.close();
  chrome.kill();
  await server.close();
  rmSync(profile, { recursive: true, force: true });
};

try {
  await send("Page.navigate", { url: `${appUrl}#pure` });
  for (let i = 0; i < 300; i++) {
    if (await run("!!window.__view").catch(() => false)) break;
    await sleep(100);
  }

  // Helpers in the page: list a level's non-empty tiles, and draw and encode a batch of them.
  await run(`(async () => {
    const { GLYPH_LEVELS } = await import("/src/map/MapView.ts");
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
  })()`);

  rmSync(OUT, { recursive: true, force: true });
  const hash = createHash("sha256");
  const names = [];
  let bytes = 0;
  for (const { res, span } of await run("window.__tiles.levels()")) {
    const tiles = await run(`window.__tiles.list(${span})`);
    let levelBytes = 0;
    for (let i = 0; i < tiles.length; i += BATCH) {
      const done = await run(`window.__tiles.render(${res}, ${span}, ${JSON.stringify(tiles.slice(i, i + BATCH))})`);
      for (const { p, ty, tx, b64, fontsTimedOut } of done) {
        if (fontsTimedOut) console.warn(`  fonts didn't load for ${res}/${p}/${ty}-${tx}; drawn anyway`);
        const buf = Buffer.from(b64, "base64");
        mkdirSync(join(OUT, `${res}`, `${p}`), { recursive: true });
        writeFileSync(join(OUT, `${res}`, `${p}`, `${ty}-${tx}.webp`), buf);
        const name = `${res}/${p}/${ty}-${tx}`;
        names.push(name);
        hash.update(name).update(buf);
        levelBytes += buf.length;
      }
      process.stdout.write(`\r  ${res}px: ${Math.min(i + BATCH, tiles.length)}/${tiles.length} tiles`);
    }
    bytes += levelBytes;
    console.log(`\r  ${res}px (${span}×${span} code points per tile): ${tiles.length} tiles, ${(levelBytes / 1e6).toFixed(1)} MB`);
  }
  const version = hash.digest("hex").slice(0, 12);
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ version, tiles: names }));
  console.log(`Wrote ${names.length} tiles, ${(bytes / 1e6).toFixed(1)} MB, to ${OUT} (version ${version})`);
} finally {
  await cleanup();
}
