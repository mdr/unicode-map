import { required } from "../required"
import type { CodePoint, Plane, BlockIndex } from "../units"
// Loads the compiled UCD (see scripts/build_data.py) and exposes fast per-code-point lookups.

export const MAX_CP = 0x110000
const LAST_RESORT = '"UMap Last Resort"'

export interface Block {
  s: CodePoint
  e: CodePoint
  name: string
  region: number
  assigned: number
}
export interface Region {
  id: string
  name: string
  color: string
}
interface ValueInfo {
  code: string
  name: string
}
interface ScriptInfo extends ValueInfo {
  region: number
}

interface Meta {
  version: string
  regions: Region[]
  blocks: Block[]
  gc: ValueInfo[]
  scripts: ScriptInfo[]
  ages: string[]
  runs: { gc: number[]; script: number[]; age: number[] }
  nameRanges: [number, number, string][]
  binaryProps: string[]
  fonts: { file: string; family: string }[]
  abbr: Record<string, string>
  nonchars: [number, number][]
  valueNames: Record<"bc" | "ea" | "lb" | "ccc", Record<string, string>>
  fontRuns: number[]
  /** Code chart sections within blocks: [start, end, title], in code point order. */
  sections: [number, number, string][]
  /** CLDR facts per script code (see data/about.ts ScriptInfo). */
  scriptInfo: Record<string, unknown>
  dottedCircleFont: number
  fontsWithDottedCircle: number[]
}

/**
 * An interpretation of the Private Use Areas (see scripts/build_pua.py): names, general categories
 * and fonts for private-use code points, which Unicode itself leaves without meaning.
 */
export interface Interpretation {
  id: string
  name: string
  /** The registry it comes from, and its web page. */
  source: string
  url: string
  fonts: { family: string; file: string }[]
  /** The registry's blocks, shown as sections within Unicode's private-use blocks. */
  blocks: [number, number, string][]
  /** [code point, name, general category, index into fonts or -1]. */
  chars: [number, string, string, number][]
}

/** A private-use code point as an interpretation has it. */
export interface InterpretedChar {
  name: string
  gc: string
  font: number
}

/** The CSS font family for an interpretation's nth font. */
export const interpretationFamily = (interp: Interpretation, n: number): string => `"UMapPua-${interp.id}-${n}"`

export interface Detail {
  ccc?: number
  decomp?: { type: string; cps: number[] }
  num?: string
  mirrored?: boolean
  upper?: number
  lower?: number
  title?: number
  bidi?: string
  eaw?: string
  lb?: string
  scx?: string[]
  aliases?: [string, string][]
  section?: string
  alsoKnownAs?: string[]
  notes?: string[]
  formalAlias?: string[]
  variations?: string[]
  seeAlso?: number[]
  props?: number[]
  confusableWith?: number[]
  confusables?: number[]
  unihan?: {
    def?: string
    mandarin?: string
    cantonese?: string
    japanese?: string
    jaOn?: string
    jaKun?: string
    korean?: string
    hangul?: string
    vietnamese?: string
    radical?: { num: string; char?: string; extra: number }
    strokes?: number
    simplified?: number[]
    traditional?: number[]
    semantic?: number[]
    zvariant?: number[]
    grade?: string
    joyo?: string
  }
  font?: number
}

const PLANE_NAMES: Record<number, [string, string]> = {
  0: ["Basic Multilingual Plane", "BMP"],
  1: ["Supplementary Multilingual Plane", "SMP"],
  2: ["Supplementary Ideographic Plane", "SIP"],
  3: ["Tertiary Ideographic Plane", "TIP"],
  14: ["Supplementary Special-purpose Plane", "SSP"],
  15: ["Supplementary Private Use Area-A", "SPUA-A"],
  16: ["Supplementary Private Use Area-B", "SPUA-B"]
}
export const planeName = (p: Plane): [string, string] => PLANE_NAMES[p] ?? ["Unassigned plane", ""]

export const VERSION_YEARS: Record<string, number> = {
  "1.1": 1993,
  "2.0": 1996,
  "2.1": 1998,
  "3.0": 1999,
  "3.1": 2001,
  "3.2": 2002,
  "4.0": 2003,
  "4.1": 2005,
  "5.0": 2006,
  "5.1": 2008,
  "5.2": 2009,
  "6.0": 2010,
  "6.1": 2012,
  "6.2": 2012,
  "6.3": 2013,
  "7.0": 2014,
  "8.0": 2015,
  "9.0": 2016,
  "10.0": 2017,
  "11.0": 2018,
  "12.0": 2019,
  "12.1": 2019,
  "13.0": 2020,
  "14.0": 2021,
  "15.0": 2022,
  "15.1": 2023,
  "16.0": 2024,
  "17.0": 2025,
  "18.0": 2026
}

export class UnicodeData {
  readonly meta: Meta
  readonly gcIdx = new Uint8Array(MAX_CP)
  readonly scriptIdx = new Uint8Array(MAX_CP)
  readonly ageIdx = new Uint8Array(MAX_CP)
  readonly blockIdx = new Int16Array(MAX_CP).fill(-1)
  readonly names = new Map<number, string>()
  readonly aliasIndex = new Map<number, string[]>()
  readonly nonchar = new Uint8Array(MAX_CP)
  /** Font id + 1 per code point (0 = no Noto font covers it). */
  readonly fontIdx = new Uint8Array(MAX_CP)
  private readonly hasDottedCircle: Set<number>
  private readonly detailChunks = new Map<number, Promise<Record<string, Detail>>>()
  /** Lowercased "name|alias|alias" per code point, for search. */
  readonly searchEntries: { cp: CodePoint; text: string }[] = []
  readonly gcCn: number
  readonly gcCo: number
  readonly gcCs: number
  /** The interpretation of the Private Use Areas in effect, if any (see withInterpretation). */
  readonly interpretation: Interpretation | undefined = undefined
  private readonly interpreted = new Map<number, InterpretedChar>()
  /** Rows of 256 code points (cp >> 8) with interpreted characters. */
  readonly interpretedRows = new Set<number>()

  constructor(meta: Meta, namesTxt: string) {
    this.meta = meta
    expandRuns(meta.runs.gc, this.gcIdx)
    expandRuns(meta.runs.script, this.scriptIdx)
    expandRuns(meta.runs.age, this.ageIdx)
    meta.blocks.forEach((b, i) => this.blockIdx.fill(i, b.s, b.e + 1))
    for (const [a, b] of meta.nonchars) this.nonchar.fill(1, a, b + 1)
    expandRuns(meta.fontRuns, this.fontIdx)
    this.hasDottedCircle = new Set(meta.fontsWithDottedCircle)
    this.gcCn = meta.gc.findIndex((g) => g.code === "Cn")
    this.gcCo = meta.gc.findIndex((g) => g.code === "Co")
    this.gcCs = meta.gc.findIndex((g) => g.code === "Cs")

    for (const line of namesTxt.split("\n")) {
      if (!line) continue
      const [hexDigits = "", name, als] = line.split("\t")
      const cp = parseInt(hexDigits, 16)
      if (name) this.names.set(cp, name)
      const aliasList = als ? als.split("|") : []
      if (aliasList.length) this.aliasIndex.set(cp, aliasList)
      this.searchEntries.push({ cp, text: [name, ...aliasList].join("|").toLowerCase() })
    }
  }

  static async load(): Promise<UnicodeData> {
    const [meta, names] = await Promise.all([
      fetch("./data/meta.json").then((r) => r.json() as Promise<Meta>),
      fetch("./data/names.txt").then((r) => r.text())
    ])
    return new UnicodeData(meta, names)
  }

  /**
   * The same data, with an interpretation of the Private Use Areas laid over it: its characters'
   * names, glyphs and search entries, and its blocks as sections. Shares everything else.
   */
  withInterpretation(interp: Interpretation): UnicodeData {
    const interpreted = new Map(interp.chars.map(([cp, name, gc, font]) => [cp, { name, gc, font }]))
    const sections = [...this.meta.sections, ...interp.blocks].sort((a, b) => a[0] - b[0])
    const extra = interp.chars.map(([cp, name]) => ({ cp, text: name.toLowerCase() }))
    return Object.assign(Object.create(UnicodeData.prototype) as UnicodeData, this, {
      meta: { ...this.meta, sections },
      searchEntries: [...this.searchEntries, ...extra],
      interpretation: interp,
      interpreted,
      interpretedRows: new Set(interp.chars.map(([cp]) => cp >> 8))
    })
  }

  /** A private-use code point as the interpretation in effect has it. */
  interpretedChar(cp: CodePoint): InterpretedChar | undefined {
    return this.interpreted.get(cp)
  }

  isAssigned(cp: CodePoint): boolean {
    return this.gcIdx[cp] !== this.gcCn
  }

  gc(cp: CodePoint): ValueInfo {
    return required(this.meta.gc[this.gcIdx[cp] ?? this.gcCn], `general category of ${hex(cp)}`)
  }
  script(cp: CodePoint): ScriptInfo {
    return required(this.meta.scripts[this.scriptIdx[cp] ?? 0], `script of ${hex(cp)}`)
  }
  age(cp: CodePoint): string {
    return required(this.meta.ages[this.ageIdx[cp] ?? 0], `age of ${hex(cp)}`)
  }
  block(cp: CodePoint): Block | undefined {
    return this.meta.blocks[this.blockIdx[cp] ?? -1]
  }
  /** The block at an index into meta.blocks, as blockIdx, search results and the URL give them. */
  blockAt(index: BlockIndex): Block {
    return required(this.meta.blocks[index], `block ${index}`)
  }
  regionOf(block: Block): Region {
    return required(this.meta.regions[block.region], `region of ${block.name}`)
  }
  region(cp: CodePoint): Region | undefined {
    const b = this.block(cp)
    return b ? this.meta.regions[b.region] : undefined
  }

  /** Official character name, or a descriptive label for code points without one. */
  name(cp: CodePoint): string {
    const n = this.names.get(cp) ?? this.interpreted.get(cp)?.name
    if (n) return n
    for (const [a, b, prefix] of this.meta.nameRanges) {
      if (cp >= a && cp <= b) return prefix + hex(cp)
    }
    const gc = this.gc(cp).code
    if (gc === "Cc") return this.aliasIndex.get(cp)?.[0] ?? `<control-${hex(cp)}>`
    if (gc === "Co") return `<private-use-${hex(cp)}>`
    if (gc === "Cs") return `<surrogate-${hex(cp)}>`
    if (this.nonchar[cp]) return `<noncharacter-${hex(cp)}>`
    return `<reserved-${hex(cp)}>`
  }

  /** Whether name() is a real Unicode name rather than a code point label. */
  hasName(cp: CodePoint): boolean {
    return !this.name(cp).startsWith("<")
  }

  /** The code chart section a code point falls in, if any. */
  section(cp: CodePoint): string | undefined {
    return this.sectionRange(cp)?.[2]
  }

  /** The code chart section a code point falls in, as [start, end, title]. */
  sectionRange(cp: CodePoint): [number, number, string] | undefined {
    const secs = this.meta.sections
    let lo = 0,
      hi = secs.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const sec = required(secs[mid], "section")
      if (sec[1] < cp) lo = mid + 1
      else if (sec[0] > cp) hi = mid - 1
      else return sec
    }
    return undefined
  }

  /** Index into meta.fonts of the font that draws this code point, if any. */
  fontOf(cp: CodePoint): number | undefined {
    const f = this.fontIdx[cp]
    return f ? f - 1 : undefined
  }

  /** CSS font-family list for drawing a code point. */
  glyphFamily(cp: CodePoint): string {
    const ic = this.interpreted.get(cp)
    if (this.interpretation && ic)
      return ic.font < 0 ? LAST_RESORT : `${interpretationFamily(this.interpretation, ic.font)}, ${LAST_RESORT}`
    const f = this.fontOf(cp)
    return f === undefined ? LAST_RESORT : `"UMapF${f}", ${LAST_RESORT}`
  }

  /**
   * Base to show a combining mark on. A dotted circle, from the mark's own font so the two combine;
   * for the few fonts without one, a no-break space.
   */
  markBase(cp: CodePoint): string {
    if (this.interpreted.has(cp)) return "\u00A0"
    const f = this.fontOf(cp)
    return f !== undefined && !this.hasDottedCircle.has(f) ? "\u00A0" : "\u25CC"
  }

  abbr(cp: CodePoint): string | undefined {
    return this.meta.abbr[cp.toString(16).toUpperCase()]
  }

  detail(cp: CodePoint): Promise<Detail | undefined> {
    const key = cp >> 12
    let chunk = this.detailChunks.get(key)
    if (!chunk) {
      const file = key.toString(16).toUpperCase().padStart(2, "0")
      chunk = fetch(`./data/detail/${file}.json`).then((r) => (r.ok ? r.json() : {}))
      this.detailChunks.set(key, chunk)
    }
    return chunk.then((c) => c[cp.toString(16).toUpperCase()])
  }
}

const expandRuns = (runs: number[], out: Uint8Array): void => {
  // Pairs of [start, value]; each run ends where the next starts.
  for (let i = 0; i + 1 < runs.length; i += 2) {
    out.fill(runs[i + 1] ?? 0, runs[i], runs[i + 2] ?? MAX_CP)
  }
}

export const hex = (cp: CodePoint): string => cp.toString(16).toUpperCase().padStart(4, "0")

export const uplus = (cp: CodePoint): string => "U+" + hex(cp)

/** The string to draw for a code point (marks get a dotted-circle base). */
export const displayString = (data: UnicodeData, cp: CodePoint): string | undefined => {
  const gc = data.interpretedChar(cp)?.gc ?? data.gc(cp).code
  if (
    gc === "Cn" ||
    gc === "Cs" ||
    gc === "Co" ||
    gc === "Cc" ||
    gc === "Cf" ||
    gc === "Zl" ||
    gc === "Zp" ||
    gc === "Zs"
  ) {
    return undefined
  }
  if (data.abbr(cp)) return undefined // invisible, e.g. variation selectors: drawn as a label
  const ch = String.fromCodePoint(cp)
  if (gc === "Mn" || gc === "Me" || gc === "Mc") return data.markBase(cp) + ch
  return ch
}
