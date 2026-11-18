import { useMemo } from "react"
import { blockRange } from "../../data/ranges"
import { AboutCards, blockScript, InterpretationAboutCard } from "../About"
import { Glyph } from "../Glyph"
import { Row, Rows, Section } from "../detail/Rows"
import type { DetailProps } from "../detail/detailProps"
import type { CodePoint } from "../../units"
import { RangeHero } from "./RangeHero"
import { rangeStats } from "./rangeStats"
import { VersionChips } from "./VersionChips"
import styles from "./range.module.css"

/** Characters shown in a section's grid; a longer section is opened as a chart for the rest. */
const GRID_MAX = 256

/** A selected code chart section: its characters, and the block it's in. */
export const SectionDetail = ({
  data,
  s,
  e,
  onSelect,
  onSelectRange,
  onChart,
  onClose
}: DetailProps & { s: CodePoint; e: CodePoint }) => {
  const title = data.section(s) ?? ""
  const bi = data.blockIdx[s] ?? -1
  const block = data.block(s)
  // A section from an interpretation of the Private Use Areas, rather than Unicode's charts:
  // what it holds is the characters the interpretation gives it.
  const interp = data.interpretation
  const fromInterp = interp?.blocks.some(([a, b]) => a === s && b === e) ? interp : undefined
  const { stats, cps } = useMemo(() => {
    const holds = (cp: CodePoint): boolean => (fromInterp ? !!data.interpretedChar(cp) : data.isAssigned(cp))
    const out: CodePoint[] = []
    for (let cp = s; cp <= e && out.length < GRID_MAX; cp++) if (holds(cp)) out.push(cp)
    return { stats: rangeStats(data, s, e, holds), cps: out }
  }, [data, s, e, fromInterp])
  return (
    <div className="detail-scroll" key={s}>
      <RangeHero
        kind={fromInterp ? `Section · from ${fromInterp.name}` : "Section"}
        title={title}
        s={s}
        e={e}
        accent={block ? data.regionOf(block).color : "#7cb4ff"}
        onClose={onClose}
      >
        {bi >= 0 && (
          <button onClick={() => onChart(bi, [s, e])} title="Open its block as a code chart, at this section">
            Chart
          </button>
        )}
        {fromInterp && (
          <a href={fromInterp.url} target="_blank" rel="noreferrer" title={fromInterp.source}>
            {fromInterp.name} ↗
          </a>
        )}
      </RangeHero>
      <Section title="In this section">
        <Rows>
          {block && (
            <Row label="Block">
              <button className="link" onClick={() => onSelectRange(blockRange(data, bi))}>
                {block.name}
              </button>
            </Row>
          )}
          <Row label="Assigned">
            {stats.assigned.toLocaleString()} <span className="muted">of {(e - s + 1).toLocaleString()}</span>
          </Row>
        </Rows>
        {stats.byAge.length > 0 && !fromInterp && (
          <>
            <div className="muted small">Added in Unicode</div>
            <VersionChips byAge={stats.byAge} />
          </>
        )}
      </Section>
      {cps.length > 0 && (
        <Section title="Characters">
          <div className={styles.glyphGrid}>
            {cps.map((cp) => (
              <button key={cp} title={data.name(cp)} onClick={() => onSelect(cp)}>
                <Glyph data={data} cp={cp} />
              </button>
            ))}
          </div>
          {stats.assigned > cps.length && (
            <p className="muted small">
              The first {cps.length} of {stats.assigned.toLocaleString()}: open the chart for the rest.
            </p>
          )}
        </Section>
      )}
      {fromInterp && (
        <Section title="About">
          <InterpretationAboutCard interpretation={fromInterp.id} section={title} />
        </Section>
      )}
      {bi >= 0 && !fromInterp && (
        <Section title="About its block">
          <AboutCards data={data} script={blockScript(data, bi)} block={bi} />
        </Section>
      )}
    </div>
  )
}
