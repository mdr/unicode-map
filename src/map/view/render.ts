import { planeOrigin, PLANE_COUNT, PLANE_SIZE, type Rect } from "../layout"
import { renderAxes } from "./axes"
import { renderCells } from "./cells"
import {
  AXIS_START,
  CARD_FULL,
  CARD_START,
  GLYPH_TILE_FULL,
  GLYPH_TILE_START,
  GRID_START,
  PAGE_BG,
  SECTION_START,
  smooth
} from "./constants"
import { renderHeaders } from "./headers"
import { renderBlockLabels, renderPlaneFrame } from "./labels"
import { renderMarkers, renderPreview } from "./markers"
import { renderBlockOutlines, renderGrid, renderSectionDividers } from "./outlines"
import type { FrameView, Scene } from "./scene"

const planesIn = (vis: Rect): number[] => {
  const planes: number[] = []
  for (let p = 0; p < PLANE_COUNT; p++) {
    const o = planeOrigin(p)
    if (o.x + PLANE_SIZE < vis.x || o.x > vis.x + vis.w || o.y + PLANE_SIZE < vis.y || o.y > vis.y + vis.h) continue
    planes.push(p)
  }
  return planes
}

/** Draw one per-plane bitmap for each plane, stretched over the plane. */
const drawBitmaps = (sc: Scene, planes: number[], bitmaps: HTMLCanvasElement[]): void => {
  const { ctx, vp } = sc
  const k = vp.cam.k
  for (const p of planes) {
    const o = planeOrigin(p)
    const bitmap = bitmaps[p]
    if (bitmap) ctx.drawImage(bitmap, vp.sx(o.x), vp.sy(o.y), PLANE_SIZE * k, PLANE_SIZE * k)
  }
}

/** Pure view: just the cells and their glyphs. */
const renderPure = (sc: Scene, fv: FrameView): void => {
  const k = sc.vp.cam.k
  const cardT = smooth(CARD_START, CARD_FULL, k)
  // Glyphs from pre-rendered tiles until real font rendering takes over. Even far out, where
  // glyphs are under a pixel, the tiles average down to a texture showing what's where.
  // Once cards start, their opaque cells cover the tiles and draw the same glyphs live.
  const tileGA = smooth(GLYPH_TILE_START, GLYPH_TILE_FULL, k)
  if (tileGA > 0.01 && cardT === 0) sc.tiles.render(sc.ctx, sc.vp, fv.planes, fv.vis, tileGA)
  if (cardT > 0) renderCells(sc, fv, cardT)
  const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT)
  if (gridA > 0.01) renderGrid(sc, fv, gridA)
}

/** Cells: highlight tiles at low zoom, then glyph texture or cards, and the grid. Returns the cards' fade-in. */
const renderCellLayers = (sc: Scene, fv: FrameView): number => {
  const ctx = sc.ctx
  const k = sc.vp.cam.k
  const tileA = sc.bm.tilesOn ? 1 - smooth(1.6, 4, k) : 0
  if (tileA > 0.01) {
    ctx.globalAlpha = tileA
    drawBitmaps(sc, fv.planes, sc.bm.tiles)
    ctx.globalAlpha = 1
  }
  // Cards & glyphs at high zoom; below that, glyph texture from the tiles, in each cell's ink.
  const cardT = smooth(CARD_START, CARD_FULL, k)
  // Fades in as in pure view, so the texture shows even far out.
  const glyphA = sc.st.glyphTexture && cardT === 0 ? smooth(GLYPH_TILE_START, GLYPH_TILE_FULL, k) : 0
  if (glyphA > 0.01) sc.inked.render(ctx, sc.vp, sc.tiles, sc.bm, fv.planes, fv.vis, glyphA)
  if (cardT > 0) renderCells(sc, fv, cardT)
  const gridA = smooth(GRID_START, GRID_START * 3, k) * (1 - cardT)
  if (gridA > 0.01) renderGrid(sc, fv, gridA)
  return cardT
}

/** The normal view, with colour, outlines, labels and chrome. */
const renderNormal = (sc: Scene, fv: FrameView): void => {
  const k = sc.vp.cam.k
  const cardT = renderCellLayers(sc, fv)
  // Section dividers and block outlines
  const sectionA = smooth(SECTION_START, SECTION_START * 1.15, k)
  if (sectionA > 0.01) renderSectionDividers(sc, fv, sectionA, cardT)
  renderBlockOutlines(sc, fv.planes, cardT)
  for (const p of fv.planes) renderPlaneFrame(sc, p)
  // Landmark names, centred in big blocks, while zoomed out
  const axisA = smooth(AXIS_START, AXIS_START * 1.6, k)
  renderBlockLabels(sc, fv)
  renderMarkers(sc)
  // Block and section headers on the row edges, placed without overlapping.
  // Section labels wait for readable glyphs, after block labels have had a step of their own.
  renderHeaders(sc, fv, smooth(CARD_START, CARD_START * 1.15, k), axisA)
  // Sidebar hover preview, over everything but the axes
  const pv = sc.st.preview ?? sc.st.pinned
  if (pv) renderPreview(sc, fv.vis, pv)
  if (axisA > 0.01) renderAxes(sc, fv, axisA)
}

/** Draw a frame. */
export const renderFrame = (sc: Scene): void => {
  const { ctx, vp } = sc
  const dpr = vp.dpr
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = PAGE_BG
  ctx.fillRect(0, 0, vp.w, vp.h)
  const vis = vp.visibleWorld()
  const fv = { planes: planesIn(vis), vis }
  ctx.imageSmoothingEnabled = false
  drawBitmaps(sc, fv.planes, sc.bm.planes)
  if (sc.st.pure) renderPure(sc, fv)
  else renderNormal(sc, fv)
}
