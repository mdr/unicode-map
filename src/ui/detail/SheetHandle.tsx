import { useRef, type PointerEvent } from "react"
import { lowered, raised, SheetState, tapped } from "./sheet"
import styles from "./SheetHandle.module.css"

/** How far a swipe must go to count, rather than a tap. */
const SWIPE = 24

/** The grip at the top of the sheet on a narrow screen: swipe or tap it to raise or lower the sheet. */
export const SheetHandle = ({
  state,
  label,
  onChange
}: {
  state: SheetState
  /** What the sheet holds, shown while it's lowered. */
  label: string
  onChange: (s: SheetState) => void
}) => {
  const startY = useRef<number | undefined>(undefined)
  const onDown = (e: PointerEvent<HTMLButtonElement>): void => {
    startY.current = e.clientY
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onUp = (e: PointerEvent<HTMLButtonElement>): void => {
    const y0 = startY.current
    startY.current = undefined
    if (y0 === undefined) return
    const dy = e.clientY - y0
    onChange(dy < -SWIPE ? raised(state) : dy > SWIPE ? lowered(state) : tapped(state))
  }
  return (
    <button
      className={styles.handle}
      aria-label={state === SheetState.FULL ? "Lower the panel" : "Raise the panel"}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => (startY.current = undefined)}
      // A keyboard press has no pointer events (detail is 0): treat it as a tap.
      onClick={(e) => e.detail === 0 && onChange(tapped(state))}
    >
      <span className={styles.grip} />
      {state === SheetState.LOWERED && <span className={styles.label}>{label}</span>}
    </button>
  )
}
