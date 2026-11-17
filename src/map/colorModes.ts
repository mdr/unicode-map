import { MAX_CP, type UnicodeData, VERSION_YEARS } from "../data/unicode"

export type RGB = [number, number, number]

export enum ModeId {
  REGION = "REGION",
  GENERAL_CATEGORY = "GENERAL_CATEGORY",
  SCRIPT = "SCRIPT",
  AGE = "AGE",
  ASSIGNED = "ASSIGNED"
}

interface LegendItem {
  key: string
  label: string
  sublabel?: string
  color: string
  values: number[]
  count: number
}
interface LegendGroup {
  label?: string
  items: LegendItem[]
}

export interface ColorMode {
  id: ModeId
  label: string
  description: string
  /** Value index per code point; colors[value] gives its colour. */
  valueOf: Uint16Array
  colors: RGB[]
  legend: LegendGroup[]
}

export const MODES: { id: ModeId; label: string; description: string }[] = [
  {
    id: ModeId.REGION,
    label: "Region",
    description: "Blocks grouped by the part of the world (or kind of thing) they cover"
  },
  {
    id: ModeId.GENERAL_CATEGORY,
    label: "Category",
    description: "General Category: letter, mark, number, punctuation, symbol, separator, other"
  },
  { id: ModeId.SCRIPT, label: "Script", description: "The writing system each character belongs to" },
  { id: ModeId.AGE, label: "Age", description: "The Unicode version in which each character was added" },
  { id: ModeId.ASSIGNED, label: "Assigned", description: "What is assigned, reserved or set aside" }
]

export const PLANE_BG: RGB = [22, 26, 34]

// Special values shared by all modes (value indices 0..3).
const V_UNASSIGNED = 0
const V_NONCHAR = 1
const SPECIAL_COLORS: RGB[] = [PLANE_BG, [58, 31, 42]]
const OFFSET = 2

const hexToRgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const rgbToCss = ([r, g, b]: RGB): string => `rgb(${r}, ${g}, ${b})`

const rgbToHsl = ([r, g, b]: RGB): [number, number, number] => {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}
const hslToRgb = (h: number, s: number, l: number): RGB => {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}
const shade = (rgb: RGB, dl: number, ds = 0): RGB => {
  const [h, s, l] = rgbToHsl(rgb)
  return hslToRgb(h, Math.max(0, Math.min(1, s + ds)), Math.max(0.05, Math.min(0.92, l + dl)))
}

const specialValue = (data: UnicodeData, cp: number): number => {
  if (data.gcIdx[cp] === data.gcCn) return data.nonchar[cp] ? V_NONCHAR : V_UNASSIGNED
  return -1
}

const specialLegend = (data: UnicodeData): LegendGroup => {
  let nonchars = 0
  for (const [a, b] of data.meta.nonchars) nonchars += b - a + 1
  let unassigned = 0
  for (let cp = 0; cp < MAX_CP; cp++) if (data.gcIdx[cp] === data.gcCn) unassigned++
  return {
    label: "Not assigned",
    items: [
      {
        key: "unassigned",
        label: "Unassigned (reserved)",
        color: "rgb(40, 46, 58)",
        values: [V_UNASSIGNED],
        count: unassigned - nonchars
      },
      {
        key: "nonchar",
        label: "Noncharacters",
        color: rgbToCss(SPECIAL_COLORS[V_NONCHAR]),
        values: [V_NONCHAR],
        count: nonchars
      }
    ]
  }
}

const build = (
  data: UnicodeData,
  id: ModeId,
  modeValue: (cp: number) => number,
  modeColors: RGB[],
  legend: LegendGroup[]
): ColorMode => {
  const valueOf = new Uint16Array(MAX_CP)
  for (let cp = 0; cp < MAX_CP; cp++) {
    const s = specialValue(data, cp)
    valueOf[cp] = s >= 0 ? s : modeValue(cp) + OFFSET
  }
  const info = MODES.find((m) => m.id === id)!
  for (const g of legend) for (const it of g.items) it.values = it.values.map((v) => v + OFFSET)
  return {
    ...info,
    valueOf,
    colors: [...SPECIAL_COLORS, ...modeColors],
    legend: [...legend, specialLegend(data)]
  }
}

const countBy = (data: UnicodeData, arr: Uint8Array | Int16Array, n: number): number[] => {
  const counts = new Array<number>(n).fill(0)
  for (let cp = 0; cp < MAX_CP; cp++) if (data.gcIdx[cp] !== data.gcCn && arr[cp] >= 0) counts[arr[cp]]++
  return counts
}

let regionColorCache: RGB[] | undefined = undefined
const regionColors = (data: UnicodeData): RGB[] => {
  if (regionColorCache) return regionColorCache
  const seen = new Map<number, number>()
  const shades: [number, number][] = [
    [0, 0],
    [0.09, -0.05],
    [-0.08, 0.02],
    [0.04, -0.12]
  ]
  regionColorCache = data.meta.blocks.map((b) => {
    const k = seen.get(b.region) ?? 0
    seen.set(b.region, k + 1)
    const [dl, ds] = shades[k % shades.length]
    return shade(hexToRgb(data.meta.regions[b.region].color), dl, ds)
  })
  return regionColorCache
}

const regionMode = (data: UnicodeData): ColorMode => {
  const blocks = data.meta.blocks
  const colors = regionColors(data)
  const items: LegendItem[] = data.meta.regions.map((r, ri) => {
    const values = blocks.map((b, i) => (b.region === ri ? i : -1)).filter((i) => i >= 0)
    return {
      key: r.id,
      label: r.name,
      sublabel: `${values.length} blocks`,
      color: r.color,
      values,
      count: values.reduce((n, i) => n + blocks[i].assigned, 0)
    }
  })
  return build(data, ModeId.REGION, (cp) => data.blockIdx[cp], colors, [{ items }])
}

const GC_COLORS: Record<string, string> = {
  Lu: "#7cb4ff",
  Ll: "#5592f2",
  Lt: "#a9ccff",
  Lm: "#93a5ff",
  Lo: "#3f74db",
  Mn: "#c58cff",
  Mc: "#a45cf2",
  Me: "#eab2ff",
  Nd: "#ff9d4d",
  Nl: "#ffc58a",
  No: "#f07a2a",
  Pc: "#f5d142",
  Pd: "#ffe066",
  Ps: "#e8b923",
  Pe: "#e8b923",
  Pi: "#fff0a0",
  Pf: "#fff0a0",
  Po: "#d6a91c",
  Sm: "#36d1b8",
  Sc: "#3ddc84",
  Sk: "#7fe8d8",
  So: "#1ea896",
  Zs: "#9aa6b8",
  Zl: "#c9d2df",
  Zp: "#c9d2df",
  Cc: "#f26d6d",
  Cf: "#ff8fa3",
  Cs: "#6b2a35",
  Co: "#5a6273",
  Cn: "#283040"
}
const GC_GROUPS: [string, string][] = [
  ["L", "Letters"],
  ["M", "Marks"],
  ["N", "Numbers"],
  ["P", "Punctuation"],
  ["S", "Symbols"],
  ["Z", "Separators"],
  ["C", "Other"]
]

const gcMode = (data: UnicodeData): ColorMode => {
  const gcs = data.meta.gc
  const counts = countBy(data, data.gcIdx, gcs.length)
  const colors = gcs.map((g) => hexToRgb(GC_COLORS[g.code] ?? "#888888"))
  const legend: LegendGroup[] = GC_GROUPS.map(([prefix, label]) => ({
    label,
    items: gcs
      .map((g, i) => ({ g, i }))
      .filter(({ g }) => g.code.startsWith(prefix) && g.code !== "Cn")
      .map(({ g, i }) => ({
        key: g.code,
        label: g.name,
        sublabel: g.code,
        color: GC_COLORS[g.code],
        values: [i],
        count: counts[i]
      }))
  }))
  return build(data, ModeId.GENERAL_CATEGORY, (cp) => data.gcIdx[cp], colors, legend)
}

const scriptMode = (data: UnicodeData): ColorMode => {
  const scripts = data.meta.scripts
  const counts = countBy(data, data.scriptIdx, scripts.length)
  const colors: RGB[] = scripts.map((s, i) => {
    if (s.code === "Zyyy") return [138, 147, 166]
    if (s.code === "Zinh") return [182, 166, 217]
    if (s.code === "Zzzz") return [60, 66, 80]
    // Spread hues with the golden angle; vary lightness a little so neighbours differ.
    return hslToRgb(i * 137.508, 0.62, 0.5 + ((i % 3) - 1) * 0.08)
  })
  const order = scripts
    .map((_, i) => i)
    .filter((i) => counts[i] > 0)
    .sort((a, b) => counts[b] - counts[a])
  const toItem = (i: number): LegendItem => ({
    key: scripts[i].code,
    label: scripts[i].name,
    sublabel: scripts[i].code,
    color: rgbToCss(colors[i]),
    values: [i],
    count: counts[i]
  })
  const shared = order.filter((i) => ["Zyyy", "Zinh"].includes(scripts[i].code))
  const specific = order.filter((i) => !["Zyyy", "Zinh", "Zzzz"].includes(scripts[i].code))
  return build(data, ModeId.SCRIPT, (cp) => data.scriptIdx[cp], colors, [
    { label: "Shared", items: shared.map(toItem) },
    { label: `Scripts (${specific.length})`, items: specific.map(toItem) }
  ])
}

const AGE_STOPS = ["#5b3a8e", "#3e5ba8", "#2a8c9e", "#3fb87a", "#a6d64a", "#ffe14d"].map(hexToRgb)
const ramp = (t: number): RGB => {
  const x = t * (AGE_STOPS.length - 1)
  const i = Math.min(AGE_STOPS.length - 2, Math.floor(x))
  const f = x - i
  const a = AGE_STOPS[i],
    b = AGE_STOPS[i + 1]
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as RGB
}

const ageMode = (data: UnicodeData): ColorMode => {
  const ages = data.meta.ages
  const counts = countBy(data, data.ageIdx, ages.length)
  const n = ages.length - 1
  const colors: RGB[] = ages.map((a, i) => (a ? ramp((i - 1) / Math.max(1, n - 1)) : [60, 66, 80]))
  const items = ages
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a)
    .reverse()
    .map(({ a, i }) => ({
      key: a,
      label: `Unicode ${a}`,
      sublabel: VERSION_YEARS[a] ? String(VERSION_YEARS[a]) : undefined,
      color: rgbToCss(colors[i]),
      values: [i],
      count: counts[i]
    }))
  return build(data, ModeId.AGE, (cp) => data.ageIdx[cp], colors, [{ items }])
}

const assignedMode = (data: UnicodeData): ColorMode => {
  // 0 graphic, 1 format & control, 2 private use, 3 surrogate
  const colors: RGB[] = ["#5ec4ff", "#ff8fa3", "#7c8396", "#8a3445"].map(hexToRgb)
  const labels = ["Graphic characters", "Format & control", "Private use", "Surrogates"]
  const value = (cp: number): number => {
    const g = data.gc(cp).code
    if (g === "Co") return 2
    if (g === "Cs") return 3
    if (g === "Cc" || g === "Cf" || g === "Zl" || g === "Zp") return 1
    return 0
  }
  const counts = [0, 0, 0, 0]
  for (let cp = 0; cp < MAX_CP; cp++) if (data.gcIdx[cp] !== data.gcCn) counts[value(cp)]++
  return build(data, ModeId.ASSIGNED, value, colors, [
    {
      label: "Assigned",
      items: labels.map((label, i) => ({
        key: String(i),
        label,
        color: rgbToCss(colors[i]),
        values: [i],
        count: counts[i]
      }))
    }
  ])
}

const cache = new Map<ModeId, ColorMode>()
const MODE_BUILDERS: Record<ModeId, (data: UnicodeData) => ColorMode> = {
  [ModeId.REGION]: regionMode,
  [ModeId.GENERAL_CATEGORY]: gcMode,
  [ModeId.SCRIPT]: scriptMode,
  [ModeId.AGE]: ageMode,
  [ModeId.ASSIGNED]: assignedMode
}

export const getMode = (data: UnicodeData, id: ModeId): ColorMode => {
  let m = cache.get(id)
  if (!m) {
    const f = MODE_BUILDERS[id]
    m = f(data)
    cache.set(id, m)
  }
  return m
}

/** Colour of a single code point in a mode, as CSS. */
export const cpColor = (mode: ColorMode, cp: number): string => rgbToCss(mode.colors[mode.valueOf[cp]])
