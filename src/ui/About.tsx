import { useEffect, useState } from "react"
import {
  type AboutData,
  type Article,
  type CharAboutData,
  loadAbout,
  loadCharAbout,
  PSEUDO_SCRIPTS,
  type ScriptInfo
} from "../data/about"
import { hex, type UnicodeData } from "../data/unicode"
import type { CodePoint, BlockIndex } from "../units"

const useAbout = () => {
  const [about, setAbout] = useState<AboutData>()
  useEffect(() => {
    let live = true
    void loadAbout().then((a) => live && setAbout(a))
    return () => {
      live = false
    }
  }, [])
  return about
}

const USAGE: Record<ScriptInfo["usage"], string> = {
  widespread: "In widespread use",
  limited: "Used by particular communities",
  emerging: "Emerging use",
  rare: "Historic, specialised or little used"
}

const people = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} bn`
  if (n >= 1e6) return `${Math.round(n / 1e6)} m`
  if (n >= 1e3) return `${Math.round(n / 1e3)} k`
  return ""
}

/** Facts about a script from CLDR, as a few short lines. */
const ScriptFacts = ({ info }: { info: ScriptInfo }) => {
  const tags = [
    USAGE[info.usage],
    info.origin && `From ${info.origin}`,
    info.rtl && "Right to left",
    info.hasCase && "Upper and lower case"
  ].filter(Boolean)
  const langs = info.languages ?? []
  const more = (info.languageCount ?? langs.length) - langs.length
  return (
    <div className="about-facts">
      <div className="about-tags">
        {tags.map((t) => (
          <span key={t as string} className="about-tag">
            {t}
          </span>
        ))}
      </div>
      {langs.length > 0 && (
        <div className="about-langs">
          <span className="muted">Writes </span>
          {langs.map((l, i) => (
            <span key={l.name}>
              {i > 0 && ", "}
              {l.name}
              {people(l.people) && <span className="muted small"> {people(l.people)}</span>}
            </span>
          ))}
          {more > 0 && <span className="muted"> and {more} more</span>}
        </div>
      )}
    </div>
  )
}

const ArticleText = ({ a }: { a: Article }) => (
  <>
    <p className="about-text">{a.extract}</p>
    <a className="about-more" href={a.url} target="_blank" rel="noreferrer">
      More on Wikipedia ↗
    </a>
  </>
)

/**
 * What a script and a block are: CLDR facts and a Wikipedia summary for the script, and the
 * block's own summary where it has one (and it isn't just the script's article again).
 */
export const AboutCards = ({ data, script, block }: { data: UnicodeData; script?: string; block?: BlockIndex }) => {
  const about = useAbout()
  const sc = script && !PSEUDO_SCRIPTS.has(script) ? script : undefined
  const scriptName = sc ? data.meta.scripts.find((s) => s.code === sc)?.name : undefined
  const info = sc ? (data.meta.scriptInfo[sc] as ScriptInfo | undefined) : undefined
  const sa = sc ? about?.scripts[sc] : undefined
  const b = block !== undefined && block >= 0 ? data.meta.blocks[block] : undefined
  const ba = b ? about?.blocks[b.name] : undefined
  if (!about) return undefined
  if (!sa && !info && !ba) return undefined
  return (
    <div className="about">
      {sc && (sa !== undefined || info !== undefined) && (
        <div className="about-card">
          <h3>
            {scriptName} <span className="muted">script</span>
          </h3>
          {sa?.description && <div className="about-desc">{sa.description}</div>}
          {info && <ScriptFacts info={info} />}
          {sa && <ArticleText a={sa} />}
        </div>
      )}
      {b && ba && ba.url !== sa?.url && (
        <div className="about-card">
          <h3>
            {b.name} <span className="muted">block</span>
          </h3>
          <ArticleText a={ba} />
        </div>
      )}
      <div className="about-credit muted small">
        Summaries from {about.source} (fetched {about.fetched}); script facts from Unicode CLDR.
      </div>
    </div>
  )
}

/** The main script of a block: the commonest real script among its assigned characters. */
export const blockScript = (data: UnicodeData, block: BlockIndex): string | undefined => {
  const b = data.blockAt(block)
  const counts = new Map<string, number>()
  for (let cp = b.s; cp <= b.e; cp++) {
    if (!data.isAssigned(cp)) continue
    const code = data.script(cp).code
    if (!PSEUDO_SCRIPTS.has(code)) counts.set(code, (counts.get(code) ?? 0) + 1)
  }
  let best: string | undefined,
    n = 0
  for (const [code, c] of counts) if (c > n) [best, n] = [code, c]
  return best
}

/** The Wikipedia summary of a character that has an article of its own, if it has one. */
export const CharAboutCard = ({ cp }: { cp: CodePoint }) => {
  const [about, setAbout] = useState<CharAboutData>()
  useEffect(() => {
    let live = true
    void loadCharAbout().then((a) => live && setAbout(a))
    return () => {
      live = false
    }
  }, [])
  const a = about?.chars[hex(cp)]
  if (!a) return undefined
  return (
    <section className="section">
      <h2>This character</h2>
      <div className="about char-about">
        <div className="about-card">
          <h3>{a.title}</h3>
          {a.description && <div className="about-desc">{a.description}</div>}
          <ArticleText a={a} />
        </div>
        <div className="about-credit muted small">
          From {about.source} (fetched {about.fetched}).
        </div>
      </div>
    </section>
  )
}
