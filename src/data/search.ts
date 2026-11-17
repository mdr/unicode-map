import { type Block, MAX_CP, type UnicodeData } from "./unicode"

export enum SearchResultType {
  CODE_POINT = "CODE_POINT",
  BLOCK = "BLOCK"
}
interface CodePointResult {
  type: SearchResultType.CODE_POINT
  cp: number
  why?: string
}
interface BlockResult {
  type: SearchResultType.BLOCK
  block: Block
  index: number
}
export type SearchResult = CodePointResult | BlockResult

const CP_PATTERN = /^(?:u\+|0x|\\u\{?|\\x\{?|&#x|U\+)?([0-9a-f]{1,6})\}?;?$/i

export const search = (data: UnicodeData, raw: string, limit = 60): SearchResult[] => {
  const q = raw.trim()
  if (!q) return []
  const out: SearchResult[] = []
  const seen = new Set<number>()
  const pushCp = (cp: number, why?: string): void => {
    if (cp < 0 || cp >= MAX_CP || seen.has(cp)) return
    seen.add(cp)
    out.push({ type: SearchResultType.CODE_POINT, cp, why })
  }

  // Pasted characters: anything outside printable ASCII, or a single character.
  const chars = Array.from(q)
  if (chars.some((c) => c.codePointAt(0)! > 0x7e) || chars.length === 1) {
    for (const c of chars.slice(0, 40))
      pushCp(c.codePointAt(0)!, chars.length > 1 ? "in pasted text" : "pasted character")
    if (chars.some((c) => c.codePointAt(0)! > 0x7e)) return out
  }

  // Code point notation
  const hexDigits = CP_PATTERN.exec(q)?.[1]
  if (hexDigits) pushCp(parseInt(hexDigits, 16), "code point")
  const decimalDigits = /^&#(\d+);?$/.exec(q)?.[1]
  if (decimalDigits) pushCp(parseInt(decimalDigits, 10), "decimal code point")

  const lower = q.toLowerCase()

  // Blocks
  const blocks = data.meta.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.name.toLowerCase().includes(lower))
    .sort((a, b) => a.block.name.length - b.block.name.length)
    .slice(0, 6)

  // Algorithmic names, e.g. "CJK UNIFIED IDEOGRAPH-4E00"
  const algorithmicDigits = /-([0-9a-f]{4,6})$/.exec(lower)?.[1]
  if (algorithmicDigits) {
    const cp = parseInt(algorithmicDigits, 16)
    if (data.name(cp).toLowerCase() === lower) pushCp(cp, "name")
  }

  // Names and aliases
  const tokens = lower.split(/\s+/).filter(Boolean)
  if (tokens.join("").length >= 2) {
    const scored: { cp: number; score: number; len: number }[] = []
    for (const e of data.searchEntries) {
      let ok = true
      for (const t of tokens) {
        if (!e.text.includes(t)) {
          ok = false
          break
        }
      }
      if (!ok) continue
      const name = e.text.split("|")[0] ?? ""
      let score = 4
      if (name === lower) score = 0
      else if (e.text.split("|").includes(lower)) score = 1
      else if (wordStart(name, tokens)) score = 2
      else if (wordStart(e.text, tokens)) score = 3
      scored.push({ cp: e.cp, score, len: name.length || 99 })
    }
    scored.sort((a, b) => a.score - b.score || a.len - b.len || a.cp - b.cp)
    const blockResults: SearchResult[] = blocks.map(({ block, index }) => ({
      type: SearchResultType.BLOCK,
      block,
      index
    }))
    // Put exact name hits before blocks, the rest after.
    for (const s of scored.filter((s) => s.score <= 1)) pushCp(s.cp)
    out.push(...blockResults)
    for (const s of scored) {
      if (out.length >= limit) break
      pushCp(s.cp)
    }
  } else {
    out.push(...blocks.map(({ block, index }): SearchResult => ({ type: SearchResultType.BLOCK, block, index })))
  }
  return out.slice(0, limit)
}

const wordStart = (text: string, tokens: string[]): boolean =>
  tokens.every((t) => new RegExp(`(^|[ |\\-])${escapeRe(t)}`).test(text))

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
