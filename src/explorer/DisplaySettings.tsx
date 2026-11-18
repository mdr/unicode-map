import { useEffect, useRef } from "react"
import { InterpretationChoice } from "../ui/InterpretationChoice"
import styles from "./DisplaySettings.module.css"

/** How the map is shown: a panel beside the map's controls. */
export const DisplaySettings = ({
  interpretation,
  onInterpretation,
  glyphTexture,
  onGlyphTexture,
  onClose
}: {
  interpretation: string | undefined
  onInterpretation: (id: string | undefined) => void
  glyphTexture: boolean
  onGlyphTexture: (on: boolean) => void
  onClose: () => void
}) => {
  const ref = useRef<HTMLDivElement>(null)
  // Close on a click elsewhere (the settings button's own click toggles it) or Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent): void => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest("[data-settings-toggle]")) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [onClose])
  return (
    <div ref={ref} className={`${styles.settings} panel`} role="dialog" aria-label="Display settings">
      <div className={styles.title}>Display</div>
      <div className={styles.label}>
        Private use <kbd>i</kbd>
      </div>
      <p className={styles.note}>
        How to show the Private Use Areas, which Unicode leaves without meaning: blank, or as a registry assigns them.
        ConScript is the registry of constructed and fictional scripts, such as Tengwar and sitelen pona.
      </p>
      <InterpretationChoice value={interpretation} onChange={onInterpretation} />
      <label className={styles.toggle}>
        <input type="checkbox" checked={glyphTexture} onChange={(e) => onGlyphTexture(e.target.checked)} />
        <span>
          Glyph texture <kbd>g</kbd>
          <span className={styles.note}>The characters' shapes, when zoomed out too far for cards.</span>
        </span>
      </label>
    </div>
  )
}
