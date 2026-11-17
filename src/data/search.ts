import { type Block, MAX_CP, type UnicodeData } from "./unicode"
import type { CodePoint, BlockIndex } from "../units"

export enum SearchResultType {
  CODE_POINT = "CODE_POINT",
  BLOCK = "BLOCK"
}
interface CodePointResult {
  type: SearchResultType.CODE_POINT
  cp: CodePoint
  why?: string
}
interface BlockResult {
  type: SearchResultType.BLOCK
  block: Block
  index: BlockIndex
}
export type SearchResult = CodePointResult | BlockResult

const CP_PATTERN = /^(?:u\+|0x|\\u\{?|\\x\{?|&#x|U\+)?([0-9a-f]{1,6})\}?;?$/i

interface NameEntry {
  cp: CodePoint
  /** Name and aliases, lower case, joined by "|". */
  text: string
}

/** How well a name entry matches: 0 its name, 1 an alias, 2 word starts in its name, 3 in an alias, 4 anywhere. */
const nameScore = (entry: NameEntry, lower: string, tokens: string[]): number => {
  const names = entry.text.split("|")
  const name = names[0] ?? ""
  if (name === lower) return 0
  if (names.includes(lower)) return 1
  if (wordStart(name, tokens)) return 2
  if (wordStart(entry.text, tokens)) return 3
  return 4
}

/** Code points whose name or aliases contain every word of the query, best matches first. */
export const matchNames = (entries: NameEntry[], lower: string): { cp: CodePoint; score: number }[] => {
  const tokens = lower.split(/\s+/).filter(Boolean)
  return entries
    .filter((entry) => tokens.every((t) => entry.text.includes(t)))
    .map((entry) => ({ cp: entry.cp, score: nameScore(entry, lower, tokens), length: nameLength(entry) }))
    .sort((a, b) => a.score - b.score || a.length - b.length || a.cp - b.cp)
}

// Entries without a name (controls have only aliases) sort after named ones of any length.
const nameLength = (entry: NameEntry): number => (entry.text.split("|")[0] ?? "").length || 99

/** Code points written in a notation: U+2603, 0x2603, \u2603, &#x2603;, &#9731; or bare hex. */
export const notationCodePoints = (q: string): { cp: CodePoint; why: string }[] => {
  const hexDigits = CP_PATTERN.exec(q)?.[1]
  const decimalDigits = /^&#(\d+);?$/.exec(q)?.[1]
  return [
    ...(hexDigits ? [{ cp: parseInt(hexDigits, 16), why: "code point" }] : []),
    ...(decimalDigits ? [{ cp: parseInt(decimalDigits, 10), why: "decimal code point" }] : [])
  ]
}

const isPasted = (c: string): boolean => (c.codePointAt(0) ?? 0) > 0x7e

const matchingBlocks = (data: UnicodeData, lower: string): BlockResult[] =>
  data.meta.blocks
    .map((block, index): BlockResult => ({ type: SearchResultType.BLOCK, block, index }))
    .filter(({ block }) => block.name.toLowerCase().includes(lower))
    .sort((a, b) => a.block.name.length - b.block.name.length)
    .slice(0, 6)

/** "CJK UNIFIED IDEOGRAPH-4E00" and the like, whose names aren't in the names list. */
const algorithmicName = (data: UnicodeData, lower: string): number | undefined => {
  const digits = /-([0-9a-f]{4,6})$/.exec(lower)?.[1]
  const cp = digits === undefined ? undefined : parseInt(digits, 16)
  return cp !== undefined && data.name(cp).toLowerCase() === lower ? cp : undefined
}

export const search = (data: UnicodeData, raw: string, limit = 60): SearchResult[] => {
  const q = raw.trim()
  if (!q) return []
  const out: SearchResult[] = []
  const seen = new Set<number>()
  const pushCp = (cp: CodePoint, why?: string): void => {
    if (cp < 0 || cp >= MAX_CP || seen.has(cp)) return
    seen.add(cp)
    out.push({ type: SearchResultType.CODE_POINT, cp, why })
  }

  // Pasted characters: anything outside printable ASCII, or a single character.
  const chars = Array.from(q)
  const pasted = chars.some(isPasted)
  if (pasted || chars.length === 1) {
    const why = chars.length > 1 ? "in pasted text" : "pasted character"
    for (const c of chars.slice(0, 40)) pushCp(c.codePointAt(0) ?? 0, why)
    if (pasted) return out
  }

  for (const { cp, why } of notationCodePoints(q)) pushCp(cp, why)
  const lower = q.toLowerCase()
  const blocks = matchingBlocks(data, lower)
  const algorithmic = algorithmicName(data, lower)
  if (algorithmic !== undefined) pushCp(algorithmic, "name")

  if (lower.replace(/\s+/g, "").length < 2) return [...out, ...blocks].slice(0, limit)
  const names = matchNames(data.searchEntries, lower)
  // Exact name and alias hits come before blocks, the rest after.
  for (const n of names.filter((n) => n.score <= 1)) pushCp(n.cp)
  out.push(...blocks)
  for (const n of names) {
    if (out.length >= limit) break
    pushCp(n.cp)
  }
  return out.slice(0, limit)
}

const wordStart = (text: string, tokens: string[]): boolean =>
  tokens.every((t) => new RegExp(`(^|[ |\\-])${escapeRe(t)}`).test(text))

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
