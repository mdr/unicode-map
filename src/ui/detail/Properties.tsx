import type { Detail, UnicodeData } from "../../data/unicode"
import { Section, Rows, Row } from "./Rows"

export const Properties = ({
  data,
  detail: d,
  loading
}: {
  data: UnicodeData
  detail: Detail
  /** The detail is still loading, so the font isn't known yet. */
  loading: boolean
}) => {
  const vn = data.meta.valueNames
  const font = d.font !== undefined ? data.meta.fonts[d.font] : undefined
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
          {font ? font.family : loading ? "…" : <span className="muted">No Noto glyph — Last Resort placeholder</span>}
        </Row>
      </Rows>
      {d.props && (
        <div className="chips text">
          {d.props.map((i) => (
            <span key={i} className="chip prop">
              {data.meta.binaryProps[i]?.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}
