import { useMemo } from "react"
import { blockRange } from "../../data/ranges"
import { hex, planeName } from "../../data/unicode"
import { Row, Rows, Section } from "../detail/Rows"
import type { DetailProps } from "../detail/detailProps"
import type { Plane } from "../../units"
import { RangeHero } from "./RangeHero"
import { rangeStats } from "./rangeStats"
import detail from "../detail/detail.module.css"
import styles from "./range.module.css"

/** What each plane is for, in brief. */
const ABOUT: Record<number, string> = {
  0: "Characters for almost every modern script, with punctuation and symbols, and the CJK ideographs in everyday use. It also holds the surrogates that UTF-16 uses to reach the other planes, and a Private Use Area.",
  1: "Historic scripts, such as Egyptian hieroglyphs and cuneiform, scripts for living languages added since the 2000s, and symbols: most emoji, and musical and mathematical notation.",
  2: "CJK ideographs beyond the everyday ones, from Extension B on: rare and historic characters found in names, classical texts and dictionaries.",
  3: "Further extensions of CJK ideographs, and since Unicode 18, the Seal script.",
  14: "Tag characters and the supplementary variation selectors: format characters that aren't seen on their own, but change how the characters around them are shown.",
  15: "A Supplementary Private Use Area: like the one in plane 0, left for private agreements, such as registries of invented scripts.",
  16: "A second Supplementary Private Use Area, left for private agreements like plane 15."
}
const UNASSIGNED = "Nothing has been allocated here yet: it's room for future versions of Unicode."

/** Each plane's section of Wikipedia's article on planes. */
const WIKIPEDIA_ANCHORS: Record<number, string> = {
  0: "Basic_Multilingual_Plane",
  1: "Supplementary_Multilingual_Plane",
  2: "Supplementary_Ideographic_Plane",
  3: "Tertiary_Ideographic_Plane",
  14: "Supplementary_Special-purpose_Plane",
  15: "Private_Use_Area_Planes",
  16: "Private_Use_Area_Planes"
}
const wikipediaAnchor = (p: Plane): string => WIKIPEDIA_ANCHORS[p] ?? "Unassigned_planes"

/** A selected plane: what it's for, and its blocks. */
export const PlaneDetail = ({ data, plane: p, onSelectRange, onPreview, onClose }: DetailProps & { plane: Plane }) => {
  const s = p << 16,
    e = s | 0xffff
  const stats = useMemo(() => rangeStats(data, s, e), [data, s, e])
  const blocks = data.meta.blocks.map((b, i) => ({ b, i })).filter(({ b }) => b.s >> 16 === p)
  const [name, abbr] = planeName(p)
  return (
    <div className="detail-scroll" key={p}>
      <RangeHero
        kind={`Plane ${p}${abbr ? ` · ${abbr}` : ""}`}
        title={name}
        s={s}
        e={e}
        accent="#7cb4ff"
        onClose={onClose}
      >
        <a
          href={`https://en.wikipedia.org/wiki/Plane_(Unicode)#${wikipediaAnchor(p)}`}
          target="_blank"
          rel="noreferrer"
          title="This plane on Wikipedia"
        >
          Wikipedia ↗
        </a>
      </RangeHero>
      <Section title="In this plane">
        <p className={styles.about}>{ABOUT[p] ?? UNASSIGNED}</p>
        <Rows>
          <Row label="Assigned">
            {stats.assigned.toLocaleString()} <span className="muted">of 65,536</span>
          </Row>
          <Row label="Blocks">{blocks.length}</Row>
        </Rows>
      </Section>
      {blocks.length > 0 && (
        <Section title="Blocks">
          <div className={detail.blockList}>
            {blocks.map(({ b, i }) => (
              <button
                key={i}
                className={detail.blockRow}
                onClick={() => {
                  onPreview(undefined)
                  onSelectRange(blockRange(data, i))
                }}
                onMouseEnter={() => onPreview({ s: b.s, e: b.e, name: b.name })}
                onMouseLeave={() => onPreview(undefined)}
              >
                <span className="swatch" style={{ background: data.regionOf(b).color }} />
                <span className={detail.blockName}>{b.name}</span>
                <span className="muted small mono">{hex(b.s)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
