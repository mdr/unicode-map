import { uplus, type UnicodeData } from "../data/unicode"
import { Glyph } from "./Glyph"
import { type ColorMode, cpColor } from "../map/colorModes"

export function Tooltip({
  data,
  mode,
  cp,
  x,
  y
}: {
  data: UnicodeData
  mode: ColorMode
  cp: number
  x: number
  y: number
}) {
  const block = data.block(cp)
  const assigned = data.isAssigned(cp)
  const section = data.section(cp)
  const flipX = x > window.innerWidth - 700
  const style = {
    left: flipX ? undefined : x + 16,
    right: flipX ? window.innerWidth - x + 16 : undefined,
    top: Math.min(y + 16, window.innerHeight - 120)
  }
  return (
    <div className="tooltip" style={style}>
      <div className="tt-glyph" style={{ borderColor: cpColor(mode, cp) }}>
        {assigned && <Glyph data={data} cp={cp} />}
      </div>
      <div className="tt-main">
        <div className="tt-name">{data.name(cp)}</div>
        <div className="tt-sub">
          <span className="mono">{uplus(cp)}</span>
          {assigned && <> · {data.gc(cp).name}</>}
        </div>
        <div className="tt-sub">
          {block ? block.name : "No block"}
          {section && <> › {section}</>}
        </div>
      </div>
    </div>
  )
}
