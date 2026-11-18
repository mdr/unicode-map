import { useMemo } from "react"
import { planeRange, sectionRange } from "../../data/ranges"
import { hex, planeName } from "../../data/unicode"
import { AboutCards, blockScript } from "../About"
import { PrivateUse } from "../detail/PrivateUse"
import { Row, Rows, Section } from "../detail/Rows"
import type { DetailProps } from "../detail/detailProps"
import type { BlockIndex } from "../../units"
import { RangeHero } from "./RangeHero"
import { rangeStats } from "./rangeStats"
import { VersionChips } from "./VersionChips"
import styles from "../detail/detail.module.css"

/** A selected block: what's in it, where it comes from, and its sections. */
export const BlockDetail = ({
  data,
  block: i,
  onSelectRange,
  onPreview,
  onChart,
  onClose,
  onInterpretation
}: DetailProps & { block: BlockIndex }) => {
  const b = data.blockAt(i)
  const stats = useMemo(() => rangeStats(data, b.s, b.e), [data, b])
  const sections = data.meta.sections.filter(([s, e]) => s >= b.s && e <= b.e)
  const region = data.regionOf(b)
  const plane = b.s >> 16
  const scripts = stats.byScript.slice(0, 4)
  return (
    <div className="detail-scroll" key={b.s}>
      <RangeHero kind="Block" title={b.name} s={b.s} e={b.e} accent={region.color} onClose={onClose}>
        <button onClick={() => onChart(i)} title="Open the block as a code chart (c)">
          Chart
        </button>
        <a
          href={`https://www.unicode.org/charts/PDF/U${hex(b.s)}.pdf`}
          target="_blank"
          rel="noreferrer"
          title={`The official code chart for ${b.name} (PDF)`}
        >
          Code chart ↗
        </a>
      </RangeHero>
      {data.gc(b.s).code === "Co" && <PrivateUse data={data} onInterpretation={onInterpretation} />}
      <Section title="In this block">
        <Rows>
          <Row label="Plane">
            <button className="link" onClick={() => onSelectRange(planeRange(plane))}>
              {plane} · {planeName(plane)[0]}
            </button>
          </Row>
          <Row label="Region">
            <span className={`swatch ${styles.inline}`} style={{ background: region.color }} /> {region.name}
          </Row>
          <Row label="Assigned">
            {stats.assigned.toLocaleString()} <span className="muted">of {(b.e - b.s + 1).toLocaleString()}</span>
          </Row>
          {scripts.length > 0 && (
            <Row label="Scripts">
              {scripts.map(([name, n]) => `${name} ${n.toLocaleString()}`).join(" · ")}
              {stats.byScript.length > scripts.length && <span className="muted"> · …</span>}
            </Row>
          )}
        </Rows>
        {stats.byAge.length > 0 && (
          <>
            <div className="muted small">Added in Unicode</div>
            <VersionChips byAge={stats.byAge} />
          </>
        )}
      </Section>
      <Section title="About">
        <AboutCards data={data} script={blockScript(data, i)} block={i} />
      </Section>
      {sections.length > 0 && (
        <Section title={`Sections · ${sections.length}`}>
          <div className={styles.sectionList} style={{ borderColor: region.color }}>
            {sections.map(([s, e, title]) => (
              <button
                key={s}
                className={styles.sectionRow}
                title={title}
                onClick={() => {
                  onPreview(undefined)
                  onSelectRange(sectionRange(s, e))
                }}
                onMouseEnter={() => onPreview({ s, e, name: title })}
                onMouseLeave={() => onPreview(undefined)}
              >
                <span className={styles.blockName}>{title}</span>
                <span className="muted small mono">{hex(s)}</span>
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
