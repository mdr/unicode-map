/** Geometry of the code chart view, in CSS pixels. */

/** Height of one lane of section labels. */
export const LANE = 22
const MAX_LANES = 3
/** Height of the column headings. */
export const HEAD = 22
/** Width of the row digits at the left. */
export const GUTTER = 30
/** Narrowest a section label can be and still be named. */
const MIN_LABEL = 56

export interface SectionLabel {
  s: number
  e: number
  title: string
  /** First and last column the section covers. */
  a: number
  z: number
  lane: number
}

/** Cell size: the 16 rows fill the height by default, then zoom scales it, within limits. */
export const cellSize = (height: number, zoom: number): number => {
  const fit = Math.floor((height - LANE * 2 - HEAD - 16) / 16)
  return Math.round(Math.max(28, Math.min(160, Math.max(36, Math.min(fit, 96)) * zoom)))
}

/**
 * Section labels: each spans the columns its section covers, in the first lane where it fits.
 * Sections too narrow to name at this size get no label.
 */
export const sectionLabels = (
  sections: [number, number, string][],
  block: { s: number; e: number },
  cell: number
): SectionLabel[] => {
  const first = block.s & ~15
  const ends: number[] = []
  const labels: SectionLabel[] = []
  for (const [s, e, title] of sections) {
    const a = Math.floor((Math.max(s, block.s) - first) / 16)
    const z = Math.floor((Math.min(e, block.e) - first) / 16)
    const lane = Array.from({ length: MAX_LANES }, (_, l) => l).find((l) => (ends[l] ?? -1) < a)
    if ((z - a + 1) * cell < MIN_LABEL || lane === undefined) continue
    ends[lane] = z
    labels.push({ s, e, title, a, z, lane })
  }
  return labels
}

/** The columns to render: those in view, and a few either side. */
export const visibleColumns = (
  scrollLeft: number,
  width: number,
  cell: number,
  columns: number
): { from: number; to: number } => ({
  from: Math.max(0, Math.floor((scrollLeft - GUTTER) / cell) - 3),
  to: Math.min(columns - 1, Math.ceil((scrollLeft + width) / cell) + 3)
})
