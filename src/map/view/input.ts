import { required } from "../../required"
import { clamp } from "./constants"
import type { CameraPos, Viewport } from "./viewport"
import type { Px } from "../../units"

/** What pointer and wheel input drive on the map. */
export interface InputHost {
  vp: Viewport
  stopAnimation(): void
  setCamera(cam: CameraPos): void
  flyTo(cam: CameraPos): void
  /** The pointer moved over (x, y) on the canvas without dragging. */
  hoverAt(x: number, y: number, clientX: Px, clientY: Px): void
  /** A click (press and release without dragging) at (x, y). */
  clickAt(x: number, y: number): void
  leave(): void
}

interface Point {
  x: number
  y: number
}

interface Drag extends Point {
  cx: number
  cy: number
  moved: boolean
  id: number
}

/**
 * While you pan or zoom by hand, mark the map area as moving (the class `moving`), so the
 * floating panels can fade out of the way until you stop.
 */
const movingNoter = (el: HTMLElement): (() => void) => {
  let timer = 0
  return () => {
    const area = el.parentElement
    if (!area) return
    area.classList.add("moving")
    clearTimeout(timer)
    timer = window.setTimeout(() => area.classList.remove("moving"), 450)
  }
}

/** Zoom by `factor` about screen point p, keeping the world point under it in place. */
const zoomAbout = (host: InputHost, p: Point, factor: number): void => {
  const vp = host.vp
  const before = vp.toWorld(p.x, p.y)
  const k = clamp(vp.cam.k * factor, vp.fitK() * 0.6, 800)
  host.setCamera({ k, cx: before.x - (p.x - vp.w / 2) / k, cy: before.y - (p.y - vp.h / 2) / k })
}

const wheel = (host: InputHost, e: WheelEvent, p: Point): void => {
  const cam = host.vp.cam
  // Pinch gestures arrive as ctrl+wheel. Trackpad scrolls (small or horizontal deltas) pan;
  // mouse wheels (large line-sized steps) zoom.
  const isTrackpadPan = !e.ctrlKey && e.deltaMode === 0 && (Math.abs(e.deltaX) > 0.5 || Math.abs(e.deltaY) < 40)
  if (isTrackpadPan) {
    host.setCamera({ k: cam.k, cx: cam.cx + e.deltaX / cam.k, cy: cam.cy + e.deltaY / cam.k })
    return
  }
  const dy = e.deltaMode === 1 ? e.deltaY * 20 : e.deltaY
  zoomAbout(host, p, Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0025)))
}

/** Fly to zoom by `factor` about screen point p. */
const flyZoomAbout = (host: InputHost, p: Point, factor: number): void => {
  const vp = host.vp
  const w = vp.toWorld(p.x, p.y)
  const k = vp.cam.k * factor
  host.flyTo({ k, cx: w.x - (p.x - vp.w / 2) / k, cy: w.y - (p.y - vp.h / 2) / k })
}

/** Two taps this close in time (ms) and space (px) are a double tap. */
const DOUBLE_TAP_MS = 320
const DOUBLE_TAP_PX = 30

/**
 * Taps on a touch screen: a tap clicks, and a second tap soon after, nearby, zooms in instead.
 * Returns when the last double tap was, so the browser's own double click can be ignored.
 */
const tapper = (host: InputHost): { tap(e: PointerEvent, p: Point): void; lastZoom(): number } => {
  let last: (Point & { t: number }) | undefined = undefined
  let zoomedAt = -Infinity
  return {
    tap(e, p) {
      const double =
        e.pointerType === "touch" &&
        last !== undefined &&
        e.timeStamp - last.t < DOUBLE_TAP_MS &&
        Math.hypot(p.x - last.x, p.y - last.y) < DOUBLE_TAP_PX
      if (double) {
        last = undefined
        zoomedAt = e.timeStamp
        flyZoomAbout(host, p, 2.5)
        return
      }
      last = e.pointerType === "touch" ? { ...p, t: e.timeStamp } : undefined
      host.clickAt(p.x, p.y)
    },
    lastZoom: () => zoomedAt
  }
}

/** Listen for pointer, wheel and double-click input on the canvas; returns a function to stop. */
export const bindInput = (el: HTMLCanvasElement, host: InputHost): (() => void) => {
  const vp = host.vp
  const noteMoving = movingNoter(el)
  const taps = tapper(host)
  let drag: Drag | undefined = undefined
  const pointers = new Map<number, Point>()
  /** The two pointers of a pinch (only called while there are exactly two). */
  const pinchPointers = (): [Point, Point] => {
    const [a, b] = pointers.values()
    return [required(a, "first pointer"), required(b, "second pointer")]
  }
  let pinch: { d: number; k: number; wx: number; wy: number } | undefined = undefined

  const local = (e: { clientX: Px; clientY: Px }): Point => {
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onDown = (e: PointerEvent): void => {
    el.setPointerCapture(e.pointerId)
    const p = local(e)
    pointers.set(e.pointerId, p)
    if (pointers.size === 2) {
      const [a, b] = pinchPointers()
      const mid = vp.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2)
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: vp.cam.k, wx: mid.x, wy: mid.y }
      drag = undefined
      return
    }
    host.stopAnimation()
    drag = { x: p.x, y: p.y, cx: vp.cam.cx, cy: vp.cam.cy, moved: false, id: e.pointerId }
  }
  const pinchMove = (pin: { d: number; k: number; wx: number; wy: number }): void => {
    const [a, b] = pinchPointers()
    const d = Math.hypot(a.x - b.x, a.y - b.y)
    const k = clamp(pin.k * (d / pin.d), vp.fitK() * 0.6, 800)
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2
    host.setCamera({ k, cx: pin.wx - (mx - vp.w / 2) / k, cy: pin.wy - (my - vp.h / 2) / k })
    noteMoving()
  }
  const dragMove = (dr: Drag, p: Point): void => {
    const dx = p.x - dr.x,
      dy = p.y - dr.y
    if (Math.abs(dx) + Math.abs(dy) > 4) dr.moved = true
    if (!dr.moved) return
    el.style.cursor = "grabbing"
    host.setCamera({ k: vp.cam.k, cx: dr.cx - dx / vp.cam.k, cy: dr.cy - dy / vp.cam.k })
    noteMoving()
  }
  const onMove = (e: PointerEvent): void => {
    const p = local(e)
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
    if (pinch && pointers.size === 2) pinchMove(pinch)
    else if (drag && drag.id === e.pointerId) dragMove(drag, p)
    else host.hoverAt(p.x, p.y, e.clientX, e.clientY)
  }
  const onUp = (e: PointerEvent): void => {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinch = undefined
    if (drag?.id !== e.pointerId) return
    if (!drag.moved) taps.tap(e, local(e))
    drag = undefined
    el.style.cursor = ""
  }
  const onLeave = (): void => host.leave()
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    host.stopAnimation()
    noteMoving()
    const p = local(e)
    wheel(host, e, p)
    host.hoverAt(p.x, p.y, e.clientX, e.clientY)
  }
  const onDbl = (e: MouseEvent): void => {
    // A double tap has zoomed already, if the browser makes a double click of it too.
    if (e.timeStamp - taps.lastZoom() < 600) return
    flyZoomAbout(host, local(e), e.shiftKey ? 0.4 : 2.5)
  }

  el.addEventListener("pointerdown", onDown)
  el.addEventListener("pointermove", onMove)
  el.addEventListener("pointerup", onUp)
  el.addEventListener("pointercancel", onUp)
  el.addEventListener("pointerleave", onLeave)
  el.addEventListener("wheel", onWheel, { passive: false })
  el.addEventListener("dblclick", onDbl)
  return () => {
    el.removeEventListener("pointerdown", onDown)
    el.removeEventListener("pointermove", onMove)
    el.removeEventListener("pointerup", onUp)
    el.removeEventListener("pointercancel", onUp)
    el.removeEventListener("pointerleave", onLeave)
    el.removeEventListener("wheel", onWheel)
    el.removeEventListener("dblclick", onDbl)
  }
}
