import { cellToCp, type Rect, WORLD } from "../layout"

/** Camera position: the world point at the canvas centre, and screen pixels per cell. */
export interface CameraPos {
  cx: number
  cy: number
  k: number
}

/** Screen margins covered by floating UI. */
export interface Insets {
  l: number
  t: number
  r: number
  b: number
}

/** The camera and canvas size, and conversions between world and screen coordinates. */
export class Viewport {
  cam: CameraPos = { cx: 0, cy: 0, k: 1 }
  w = 0
  h = 0
  dpr = 1
  /** Screen margins covered by floating UI, respected when fitting things into view. */
  insets: Insets = { l: 16, t: 92, r: 16, b: 16 }

  sx(wx: number): number {
    return (wx - this.cam.cx) * this.cam.k + this.w / 2
  }
  sy(wy: number): number {
    return (wy - this.cam.cy) * this.cam.k + this.h / 2
  }

  /** Screen point → world point. */
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.w / 2) / this.cam.k + this.cam.cx, y: (sy - this.h / 2) / this.cam.k + this.cam.cy }
  }

  visibleWorld(): Rect {
    const { cx, cy, k } = this.cam
    return { x: cx - this.w / 2 / k, y: cy - this.h / 2 / k, w: this.w / k, h: this.h / k }
  }

  availW(): number {
    return Math.max(100, this.w - this.insets.l - this.insets.r)
  }
  availH(): number {
    return Math.max(100, this.h - this.insets.t - this.insets.b)
  }

  fitK(): number {
    return Math.min(this.availW() / WORLD.w, this.availH() / WORLD.h) * 0.98
  }

  /** Camera centre that puts world point (x, y) in the middle of the unobscured area. */
  centreFor(x: number, y: number, k: number): { cx: number; cy: number } {
    return { cx: x - (this.insets.l - this.insets.r) / 2 / k, cy: y - (this.insets.t - this.insets.b) / 2 / k }
  }

  /** The code point at the centre of the unobscured area, or -1 if that's between planes. */
  centreCp(): number {
    const { cx, cy, k } = this.cam
    return cellToCp(cx + (this.insets.l - this.insets.r) / 2 / k, cy + (this.insets.t - this.insets.b) / 2 / k)
  }

  /** Set a context's transform to draw in world coordinates. */
  worldTransform(ctx: CanvasRenderingContext2D): void {
    const { k, cx, cy } = this.cam
    const dpr = this.dpr
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (this.w / 2 - cx * k), dpr * (this.h / 2 - cy * k))
  }
}
