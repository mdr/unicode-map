import type { Detail, UnicodeData } from "../../data/unicode"
import type { CodePoint } from "../../units"
import { Section, Rows, Row } from "./Rows"
import styles from "./detail.module.css"

export const Properties = ({
  data,
  cp,
  detail: d,
  loading
}: {
  data: UnicodeData
  cp: CodePoint
  detail: Detail
  /** The detail is still loading, so the font isn't known yet. */
  loading: boolean
}) => {
  const vn = data.meta.valueNames
  // A private-use character an interpretation gives a glyph is drawn with that interpretation's font.
  const ic = data.interpretedChar(cp)
  const font = ic ? data.interpretation?.fonts[ic.font] : d.font !== undefined ? data.meta.fonts[d.font] : undefined
  return (
    <Section title="Properties">
      <Rows>
        {d.bidi && (
          <Row label="Bidi class">
            {vn.bc[d.bidi] ?? d.bidi} <span className="muted mono">({d.bidi})</span>
          </Row>
        )}
        {d.ccc !== undefined && (
          <Row label="Combining class">
            {d.ccc} <span className="muted">{vn.ccc[String(d.ccc)] ?? ""}</span>
          </Row>
        )}
        {d.eaw && <Row label="East Asian width">{vn.ea[d.eaw] ?? d.eaw}</Row>}
        {d.lb && (
          <Row label="Line break">
            {vn.lb[d.lb] ?? d.lb} <span className="muted mono">({d.lb})</span>
          </Row>
        )}
        {d.num && <Row label="Numeric value">{d.num}</Row>}
        {d.mirrored && <Row label="Bidi mirrored">Yes</Row>}
        <Row label="Rendered with">
          {font ? (
            font.family
          ) : loading && !ic ? (
            "…"
          ) : (
            <span className="muted">No font has a glyph — Last Resort placeholder</span>
          )}
        </Row>
      </Rows>
      {d.props && (
        <div className={`${styles.chips} text`}>
          {d.props.map((i) => (
            <span key={i} className={`${styles.chip} ${styles.prop}`}>
              {data.meta.binaryProps[i]?.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}
