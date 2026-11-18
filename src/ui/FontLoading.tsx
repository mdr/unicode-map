import { useEffect, useState } from "react"
import type { UnicodeData } from "../data/unicode"
import styles from "./FontLoading.module.css"

/** How long a font must take before we say so, so quick loads don't flash a notice. */
const DELAY_MS = 500
/** Fonts named before the rest are counted. */
const NAMED = 2

/** The name of a glyph font the browser knows by one of our family names, or undefined for an interface font. */
const fontName = (data: UnicodeData, family: string): string | undefined => {
  const f = /^UMapF(\d+)$/.exec(family)
  if (f) return data.meta.fonts[Number(f[1])]?.family
  const p = /^UMapPua-[\w-]+-(\d+)$/.exec(family)
  if (p) return data.interpretation?.fonts[Number(p[1])]?.family
  return family === "UMap Last Resort" ? "Last Resort" : undefined
}

/** The glyph fonts still downloading. */
const loadingFonts = (data: UnicodeData): string[] => {
  const names = new Set<string>()
  for (const face of document.fonts) {
    if (face.status !== "loading") continue
    const name = fontName(data, face.family.replace(/^"|"$/g, ""))
    if (name) names.add(name)
  }
  return [...names]
}

/**
 * Says which fonts are downloading, when one takes a while: until it arrives, the characters it
 * draws are blank on the map. Some are large (UniHieroglyphica is 6 MB).
 */
export const FontLoading = ({ data }: { data: UnicodeData }) => {
  const [names, setNames] = useState<string[]>([])
  useEffect(() => {
    let timer = 0
    const update = (): void => {
      clearTimeout(timer)
      const now = loadingFonts(data)
      if (now.length === 0) setNames([])
      // Wait before showing, then check again: the font may have arrived meanwhile.
      else timer = window.setTimeout(() => setNames(loadingFonts(data)), DELAY_MS)
    }
    const events = ["loading", "loadingdone", "loadingerror"] as const
    for (const e of events) document.fonts.addEventListener(e, update)
    update()
    return () => {
      clearTimeout(timer)
      for (const e of events) document.fonts.removeEventListener(e, update)
    }
  }, [data])
  if (names.length === 0) return undefined
  const shown = names.slice(0, NAMED).join(", ")
  const more = names.length - NAMED
  return (
    <div className={styles.fontLoading} role="status">
      <span className={styles.spinner} />
      Loading {names.length === 1 ? "font" : "fonts"}: {shown}
      {more > 0 && ` and ${more} more`}…
    </div>
  )
}
