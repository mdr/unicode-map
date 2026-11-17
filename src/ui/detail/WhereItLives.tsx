import { type Detail, hex, planeName, type UnicodeData, VERSION_YEARS } from "../../data/unicode"
import { Section, Rows, Row } from "./Rows"
import type { CodePoint, Plane, BlockIndex } from "../../units"

export const WhereItLives = ({
  data,
  cp,
  detail: d,
  onPlane,
  onBlock,
  onChart
}: {
  data: UnicodeData
  cp: CodePoint
  detail: Detail
  onPlane: (p: Plane) => void
  onBlock: (i: BlockIndex) => void
  onChart: (block: BlockIndex) => void
}) => {
  const assigned = data.isAssigned(cp)
  const gc = data.gc(cp)
  const script = data.script(cp)
  const age = data.age(cp)
  const block = data.block(cp)
  const blockIndex = data.blockIdx[cp] ?? -1
  const region = data.region(cp)
  const plane = cp >> 16
  return (
    <Section title="Where it lives">
      <Rows>
        <Row label="Plane">
          <button className="link" onClick={() => onPlane(plane)}>
            {plane} · {planeName(plane)[0]}
          </button>
        </Row>
        {block && (
          <Row label="Block">
            <button className="link" onClick={() => onBlock(blockIndex)}>
              {block.name}
            </button>
            <span className="muted small mono">
              {" "}
              {hex(block.s)}–{hex(block.e)}
            </span>{" "}
            <button
              className="link small"
              title="Open the block as a code chart (c)"
              onClick={() => onChart(blockIndex)}
            >
              Chart
            </button>
          </Row>
        )}
        {region && (
          <Row label="Region">
            <span className="swatch inline" style={{ background: region.color }} /> {region.name}
          </Row>
        )}
        {assigned && (
          <Row label="Category">
            {gc.name} <span className="muted mono">({gc.code})</span>
          </Row>
        )}
        {assigned && (
          <Row label="Script">
            {script.name}
            {d.scx && d.scx.length > 0 && (
              <span className="muted small">
                {" "}
                · also used in {d.scx.map((s) => data.meta.scripts.find((x) => x.code === s)?.name ?? s).join(", ")}
              </span>
            )}
          </Row>
        )}
        {age && (
          <Row label="Added in">
            Unicode {age}
            {VERSION_YEARS[age] && <span className="muted"> ({VERSION_YEARS[age]})</span>}
          </Row>
        )}
      </Rows>
    </Section>
  )
}
