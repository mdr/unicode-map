import type { CodePoint, Plane, Cells } from "../units"
// Linear layout: 17 planes of 256×256 cells, arranged in a grid of planes.
// World coordinates are in cell units.

export const PLANE_SIZE = 256
const PLANE_GAP = 40
const PLANE_COLS = 6
export const PLANE_COUNT = 17
const PLANE_STRIDE = PLANE_SIZE + PLANE_GAP

export interface Rect {
  x: Cells
  y: Cells
  w: Cells
  h: Cells
}

export const planeOrigin = (p: Plane): { x: Cells; y: Cells } => ({
  x: (p % PLANE_COLS) * PLANE_STRIDE,
  y: Math.floor(p / PLANE_COLS) * PLANE_STRIDE
})

export const planeRect = (p: Plane): Rect => {
  const o = planeOrigin(p)
  return { x: o.x, y: o.y, w: PLANE_SIZE, h: PLANE_SIZE }
}

export const WORLD: Rect = {
  x: -PLANE_GAP / 2,
  y: -PLANE_GAP,
  w: PLANE_COLS * PLANE_STRIDE,
  h: Math.ceil(PLANE_COUNT / PLANE_COLS) * PLANE_STRIDE
}

export const cpToCell = (cp: CodePoint): { x: Cells; y: Cells } => {
  const p = cp >> 16
  const o = planeOrigin(p)
  return { x: o.x + (cp & 0xff), y: o.y + ((cp >> 8) & 0xff) }
}

/** Code point at world position, or -1 if outside every plane. */
export const cellToCp = (wx: number, wy: number): number => {
  const col = Math.floor(wx / PLANE_STRIDE)
  const row = Math.floor(wy / PLANE_STRIDE)
  if (col < 0 || col >= PLANE_COLS || row < 0) return -1
  const p = row * PLANE_COLS + col
  if (p >= PLANE_COUNT) return -1
  const lx = Math.floor(wx - col * PLANE_STRIDE)
  const ly = Math.floor(wy - row * PLANE_STRIDE)
  if (lx < 0 || lx >= PLANE_SIZE || ly < 0 || ly >= PLANE_SIZE) return -1
  return (p << 16) | (ly << 8) | lx
}

/** Bounding rectangle of a code point range (in world cells). */
export const rangeRect = (start: CodePoint, end: CodePoint): Rect => {
  const a = cpToCell(start)
  const b = cpToCell(end)
  if (a.y === b.y) return { x: a.x, y: a.y, w: b.x - a.x + 1, h: 1 }
  const o = planeOrigin(start >> 16)
  return { x: o.x, y: a.y, w: PLANE_SIZE, h: b.y - a.y + 1 }
}

/**
 * The outline of a code point range as a polygon (list of world points).
 * A range in the linear layout is a partial first row, full middle rows and a partial last row.
 */
export const rangeOutline = (start: CodePoint, end: CodePoint): [number, number][] => {
  const a = cpToCell(start)
  const b = cpToCell(end)
  const o = planeOrigin(start >> 16)
  const L = o.x
  const R = o.x + PLANE_SIZE
  if (a.y === b.y) {
    return [
      [a.x, a.y],
      [b.x + 1, a.y],
      [b.x + 1, a.y + 1],
      [a.x, a.y + 1]
    ]
  }
  const pts: [number, number][] = [
    [a.x, a.y],
    [R, a.y],
    [R, b.y],
    [b.x + 1, b.y],
    [b.x + 1, b.y + 1],
    [L, b.y + 1],
    [L, a.y + 1],
    [a.x, a.y + 1]
  ]
  return pts
}

/** The best rectangle inside a range for placing its label. */
export const labelRect = (start: CodePoint, end: CodePoint): Rect => {
  const a = cpToCell(start)
  const b = cpToCell(end)
  const o = planeOrigin(start >> 16)
  if (a.y === b.y) return { x: a.x, y: a.y, w: b.x - a.x + 1, h: 1 }
  const firstFull = a.x === o.x ? a.y : a.y + 1
  const lastFull = b.x === o.x + PLANE_SIZE - 1 ? b.y : b.y - 1
  if (lastFull >= firstFull) return { x: o.x, y: firstFull, w: PLANE_SIZE, h: lastFull - firstFull + 1 }
  // Two partial rows: pick the longer one.
  const firstLen = o.x + PLANE_SIZE - a.x
  const lastLen = b.x - o.x + 1
  return firstLen >= lastLen ? { x: a.x, y: a.y, w: firstLen, h: 1 } : { x: o.x, y: b.y, w: lastLen, h: 1 }
}
