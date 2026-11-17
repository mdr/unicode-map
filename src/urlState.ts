import { ModeId } from "./map/colorModes"
import type { Camera } from "./map/MapView"
import type { CodePoint } from "./units"

export interface UrlState {
  cp?: CodePoint
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

// How each colour mode is written in the URL; region, the default, is left out.
const MODE_IN_URL: Record<ModeId, string> = {
  [ModeId.REGION]: "region",
  [ModeId.GENERAL_CATEGORY]: "gc",
  [ModeId.SCRIPT]: "script",
  [ModeId.AGE]: "age",
  [ModeId.ASSIGNED]: "assigned"
}
const MODE_FROM_URL = new Map(Object.entries(MODE_IN_URL).map(([mode, text]) => [text, mode as ModeId]))

const CODE_POINT = /^U\+([0-9A-Fa-f]{1,6})$/
const HEX = /^[0-9A-Fa-f]{1,6}$/

const parseCodePoint = (part: string): number | undefined => {
  const digits = CODE_POINT.exec(part)?.[1]
  const cp = digits === undefined ? undefined : parseInt(digits, 16)
  return cp !== undefined && cp <= 0x10ffff ? cp : undefined
}

const parseView = (value: string): Partial<UrlState> => {
  const [cx = NaN, cy = NaN, k = NaN] = value.split(",").map(Number)
  return [cx, cy, k].every(Number.isFinite) && k > 0 ? { view: { cx, cy, k } } : {}
}

const parseMode = (value: string): Partial<UrlState> => {
  const mode = MODE_FROM_URL.get(value)
  return mode ? { mode } : {}
}

/** What each `key=value` part of the hash sets; nothing if it can't be read. */
const PARAMETERS: Record<string, (value: string) => Partial<UrlState>> = {
  mode: parseMode,
  prop: (value) => ({ prop: value }),
  asof: (value) => ({ asOf: value }),
  chart: (value) => (HEX.test(value) ? { chart: parseInt(value, 16) } : {}),
  view: parseView
}

const parsePart = (part: string): Partial<UrlState> => {
  const cp = parseCodePoint(part)
  if (cp !== undefined) return { cp }
  if (part === "pure") return { pure: true }
  const [key = "", value] = part.split("=")
  const parse = PARAMETERS[key]
  return parse && value ? parse(value) : {}
}

const hex = (cp: CodePoint): string => cp.toString(16).toUpperCase().padStart(4, "0")

/** The state in a URL hash, without its `#`: `U+2603&mode=gc&view=1234.5,567.25,40`. */
export const parseHash = (hash: string): UrlState =>
  Object.assign({}, ...decodeURIComponent(hash).split("&").map(parsePart)) as UrlState

export const formatHash = (s: UrlState): string => {
  const parts: string[] = []
  if (s.cp !== undefined) parts.push("U+" + hex(s.cp))
  if (s.mode && s.mode !== ModeId.REGION) parts.push(`mode=${MODE_IN_URL[s.mode]}`)
  if (s.prop) parts.push(`prop=${s.prop}`)
  if (s.asOf) parts.push(`asof=${s.asOf}`)
  if (s.pure) parts.push("pure")
  if (s.chart !== undefined) parts.push("chart=" + hex(s.chart))
  if (s.view) parts.push(`view=${s.view.cx.toFixed(1)},${s.view.cy.toFixed(1)},${+s.view.k.toPrecision(3)}`)
  return parts.join("&")
}

export const readHash = (): UrlState => parseHash(location.hash.slice(1))

export const writeHash = (s: UrlState, push: boolean): void => {
  const hash = "#" + formatHash(s)
  if (hash === location.hash) return
  if (push) history.pushState(undefined, "", hash)
  else history.replaceState(undefined, "", hash)
}
