import { useEffect, useMemo, useRef, useState } from "react"
import { hex, MAX_CP, planeName } from "../../data/unicode"
import { AboutCards, blockScript } from "../About"
import { Section } from "./Rows"
import { ChartIcon } from "./ChartIcon"
import type { DetailProps } from "./detailProps"
import styles from "./detail.module.css"

export const Overview = ({ data, here, onPlane, onBlock, onPreview, onRange, onChart, chartBlock }: DetailProps) => {
  const planeStats = useMemo(
    () =>
      Array.from({ length: 17 }, (_, p) => {
        let assigned = 0
        for (let cp = p << 16; cp < (p + 1) << 16; cp++) if (data.isAssigned(cp)) assigned++
        return assigned
      }),
    [data]
  )
  const total = planeStats.reduce((a, b) => a + b, 0)
  // Don't leave the map dimmed if this panel goes away under the pointer (e.g. on selecting).
  useEffect(() => () => onPreview(undefined), [onPreview])
  const plane = here && here.cp >= 0 && here.k > 1.6 ? here.cp >> 16 : undefined
  const currentBlock = plane !== undefined && here!.k > 2.5 ? (data.blockIdx[here!.cp] ?? -1) : -1
  /** The block whose "About" is open in the list. */
  const [aboutOpen, setAboutOpen] = useState<number>()
  const currentSection = currentBlock >= 0 && here!.k > 10 ? data.sectionRange(here!.cp) : undefined
  // Keep the block you're in visible in the list as you move between blocks.
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current
      ?.querySelector(`.${styles.blockRow}.current`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [currentBlock])
  /** Chart sections per block, for the current block's row to expand into. */
  const sectionsByBlock = useMemo(() => {
    const m = new Map<number, [number, number, string][]>()
    for (const sec of data.meta.sections) {
      const b = data.blockIdx[sec[0]] ?? -1
      if (b >= 0) m.set(b, [...(m.get(b) ?? []), sec])
    }
    return m
  }, [data])
  return (
    <div className="detail-scroll">
      {plane === undefined && (
        <div className={styles.ovHero}>
          <div className={styles.ovTitle}>The Unicode code space</div>
          <p className="muted">
            {MAX_CP.toLocaleString()} code points in 17 planes. Unicode {data.meta.version} assigns{" "}
            <b>{total.toLocaleString()}</b> of them across <b>{data.meta.blocks.length}</b> blocks and{" "}
            <b>{data.meta.scripts.length - 3}</b> scripts.
          </p>
          <p className="muted small">
            Click any cell to inspect it, or search above. Press <kbd>?</kbd> for shortcuts.
          </p>
        </div>
      )}
      <Section title="Planes">
        {plane !== undefined ? (
          // Inside a plane, the planes shrink to a row of numbered tiles, leaving room for its blocks.
          <div className={styles.planeGrid}>
            {planeStats.map((n, p) => (
              <button
                key={p}
                className={`${styles.planeTile} ${plane === p ? "current" : ""} ${n ? "" : "empty"}`}
                title={`Plane ${p}: ${planeName(p)[0]} · ${n ? `${n.toLocaleString()} assigned` : "nothing assigned"}`}
                onClick={() => {
                  onPreview(undefined)
                  onPlane(p)
                }}
                onMouseEnter={() =>
                  onPreview({ s: p << 16, e: (p << 16) | 0xffff, name: `Plane ${p} · ${planeName(p)[0]}` })
                }
                onMouseLeave={() => onPreview(undefined)}
              >
                {p}
                <span className={styles.planeTileFill} style={{ width: `${(n / 65536) * 100}%` }} />
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.planeList}>
            {planeStats.map((n, p) => (
              <button
                key={p}
                className={styles.planeRow}
                onClick={() => {
                  onPreview(undefined)
                  onPlane(p)
                }}
                onMouseEnter={() =>
                  onPreview({ s: p << 16, e: (p << 16) | 0xffff, name: `Plane ${p} · ${planeName(p)[0]}` })
                }
                onMouseLeave={() => onPreview(undefined)}
              >
                <span className={styles.planeNum}>{p}</span>
                <span className={styles.planeName}>
                  {planeName(p)[0]}
                  <span className="muted small mono">
                    {" "}
                    {hex(p << 16)}–{hex((p << 16) | 0xffff)}
                  </span>
                </span>
                <span className={styles.planeBar}>
                  <span style={{ width: `${(n / 65536) * 100}%` }} />
                </span>
                <span className={styles.planeCount}>{n ? n.toLocaleString() : "—"}</span>
              </button>
            ))}
          </div>
        )}
      </Section>
      {plane !== undefined && (
        <Section title={`Blocks in plane ${plane} · ${planeName(plane)[0]}`}>
          <div className={styles.blockList} ref={listRef}>
            {data.meta.blocks
              .map((b, i) =>
                b.s >> 16 === plane ? (
                  <div key={i} className={`${styles.blockItem} ${aboutOpen === i ? "open" : ""}`}>
                    <button
                      className={`${styles.blockRow} ${currentBlock === i ? "current" : ""}`}
                      onClick={() => {
                        onPreview(undefined)
                        onBlock(i)
                      }}
                      onMouseEnter={() => onPreview({ s: b.s, e: b.e, name: b.name })}
                      onMouseLeave={() => onPreview(undefined)}
                    >
                      <span className="swatch" style={{ background: data.regionOf(b).color }} />
                      <span className={styles.blockName}>{b.name}</span>
                      <span className="muted small mono">{hex(b.s)}</span>
                    </button>
                    <button
                      className={`${styles.infoBtn} ${styles.chartBtn} ${chartBlock === i ? "on" : ""}`}
                      title={`Open ${b.name} as a code chart (c)`}
                      onClick={() => onChart(i)}
                    >
                      <ChartIcon />
                    </button>
                    <button
                      className={styles.infoBtn}
                      title={`About ${b.name}`}
                      aria-expanded={aboutOpen === i}
                      onClick={() => setAboutOpen(aboutOpen === i ? undefined : i)}
                    >
                      i
                    </button>
                  </div>
                ) : undefined
              )
              .flatMap((row, i) => {
                if (!row) return []
                const about =
                  aboutOpen === i ? (
                    <div key={`a${i}`} className={styles.blockAbout}>
                      <AboutCards data={data} script={blockScript(data, i)} block={i} />
                    </div>
                  ) : undefined
                // The block you're in opens up into its chart sections.
                const secs = i === currentBlock ? sectionsByBlock.get(i) : undefined
                if (!secs) return about ? [row, about] : [row]
                return [
                  row,
                  ...(about ? [about] : []),
                  <div
                    key={`s${i}`}
                    className={styles.sectionList}
                    style={{ borderColor: data.regionOf(data.blockAt(i)).color }}
                  >
                    {secs.map(([a, e, title]) => (
                      <button
                        key={a}
                        className={`${styles.sectionRow} ${currentSection?.[0] === a ? "current" : ""}`}
                        title={title}
                        onClick={() => {
                          onPreview(undefined)
                          onRange(a, e)
                        }}
                        onMouseEnter={() => onPreview({ s: a, e, name: title })}
                        onMouseLeave={() => onPreview(undefined)}
                      >
                        <span className={styles.blockName}>{title}</span>
                        <span className="muted small mono">{hex(a)}</span>
                      </button>
                    ))}
                  </div>
                ]
              })}
          </div>
        </Section>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A single code point
