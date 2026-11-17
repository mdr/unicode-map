// Descriptions of scripts and blocks: Wikipedia summaries (src/data/about.json, from
// scripts/build_about.mjs) and CLDR facts (meta.scriptInfo, from scripts/build_data.py).

export interface Article {
  title: string
  url: string
  description?: string
  extract: string
}
export interface AboutData {
  source: string
  fetched: string
  scripts: Record<string, Article>
  blocks: Record<string, Article>
}
/** CLDR facts about a script. */
export interface ScriptInfo {
  /** How widely it's used today, from CLDR's identifier usage (UAX #31). */
  usage: "widespread" | "limited" | "emerging" | "rare"
  origin?: string
  rtl?: boolean
  hasCase?: boolean
  languages?: { name: string; people: number }[]
  languageCount?: number
}

let loading: Promise<AboutData> | null = null
/** The Wikipedia summaries, loaded (as their own chunk) on first use. */
export function loadAbout(): Promise<AboutData> {
  loading ??= import("./about.json").then((m) => m.default as AboutData)
  return loading
}

export interface CharAboutData {
  source: string
  fetched: string
  /** Keyed by code point in hex, as in "20AC". */
  chars: Record<string, Article>
}
let loadingChars: Promise<CharAboutData> | null = null
/**
 * Summaries of the characters that have an English Wikipedia article of their own (about 2,400),
 * from scripts/build_about.mjs. Loaded as their own chunk the first time a character is shown.
 */
export function loadCharAbout(): Promise<CharAboutData> {
  loadingChars ??= import("./about-chars.json").then((m) => m.default as CharAboutData)
  return loadingChars
}

/** Codes of the Unicode "scripts" that aren't writing systems. */
export const PSEUDO_SCRIPTS = new Set(["Zyyy", "Zinh", "Zzzz"])
