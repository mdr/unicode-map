import { type ModeId, MODES } from "./map/colorModes"
import type { Camera } from "./map/MapView"

export interface UrlState {
  cp?: number
  mode?: ModeId
  view?: Camera
  /** Property highlight key, e.g. "b:Emoji" or "bc:R". */
  prop?: string
  /** Timeline version, e.g. "6.0". */
  asOf?: string
  /** Pure view (no interface or colouring). */
  pure?: boolean
  /** Chart view: the start of the block shown as a code chart. */
  chart?: number
}

// Hash format: #U+2603&mode=gc&view=1234.5,567.25,40
export function readHash(): UrlState {
  const h = decodeURIComponent(location.hash.slice(1))
  const out: UrlState = {}
  for (const part of h.split("&")) {
    const cpm = /^U\+([0-9A-Fa-f]{1,6})$/.exec(part)
    if (cpm) {
      const cp = parseInt(cpm[1], 16)
      if (cp <= 0x10ffff) out.cp = cp
      continue
    }
    if (part === "pure") {
      out.pure = true
      continue
    }
    const [k, v] = part.split("=")
    if (k === "mode" && MODES.some((m) => m.id === v)) out.mode = v as ModeId
    if (k === "prop" && v) out.prop = v
    if (k === "asof" && v) out.asOf = v
    if (k === "chart" && /^[0-9A-Fa-f]{1,6}$/.test(v ?? "")) out.chart = parseInt(v, 16)
    if (k === "view") {
      const [cx, cy, z] = (v ?? "").split(",").map(Number)
      if ([cx, cy, z].every(Number.isFinite) && z > 0) out.view = { cx, cy, k: z }
    }
  }
  return out
}

export function writeHash(s: UrlState, push: boolean) {
  const parts: string[] = []
  if (s.cp !== undefined) parts.push("U+" + s.cp.toString(16).toUpperCase().padStart(4, "0"))
  if (s.mode && s.mode !== "region") parts.push(`mode=${s.mode}`)
  if (s.prop) parts.push(`prop=${s.prop}`)
  if (s.asOf) parts.push(`asof=${s.asOf}`)
  if (s.pure) parts.push("pure")
  if (s.chart !== undefined) parts.push("chart=" + s.chart.toString(16).toUpperCase().padStart(4, "0"))
  if (s.view) parts.push(`view=${s.view.cx.toFixed(1)},${s.view.cy.toFixed(1)},${+s.view.k.toPrecision(3)}`)
  const hash = "#" + parts.join("&")
  if (hash === location.hash) return
  if (push) history.pushState(null, "", hash)
  else history.replaceState(null, "", hash)
}
