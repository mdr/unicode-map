import { uplus, type UnicodeData } from "../data/unicode"
import { Glyph } from "./Glyph"
import { type ColorMode, cpColor } from "../map/colorModes"
import type { CodePoint } from "../units"
import styles from "./Tooltip.module.css"

export const Tooltip = ({
  data,
  mode,
  cp,
  x,
  y
}: {
  data: UnicodeData
  mode: ColorMode
  cp: CodePoint
  x: number
  y: number
}) => {
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
    <div className={styles.tooltip} style={style}>
      <div className={styles.ttGlyph} style={{ borderColor: cpColor(mode, cp) }}>
        {assigned && <Glyph data={data} cp={cp} />}
      </div>
      <div className={styles.ttMain}>
        <div className={styles.ttName}>{data.name(cp)}</div>
        <div className={styles.ttSub}>
          <span className="mono">{uplus(cp)}</span>
          {assigned && <> · {data.gc(cp).name}</>}
        </div>
        <div className={styles.ttSub}>
          {block ? block.name : "No block"}
          {section && <> › {section}</>}
        </div>
      </div>
    </div>
  )
}
