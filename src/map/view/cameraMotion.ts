import { interpolateZoom } from "d3-interpolate"
import type { Camera } from "../MapView"
import type { Px } from "../../units"
import type { Rect } from "../layout"
import { AXIS_LEFT, clamp, READ_K } from "./constants"
import type { Viewport } from "./viewport"

/** A camera animation: where it goes, how long it takes, and the camera at each moment (0 to 1). */
export interface CameraMotion {
  target: Camera
  dur: number
  f: (t: number) => Camera
}

/** A fly-to, zooming out on the way for long journeys so the route stays in view. */
export const flight = (from: Camera, target: Camera, width: Px): CameraMotion => {
  const interp = interpolateZoom([from.cx, from.cy, width / from.k], [target.cx, target.cy, width / target.k])
  return {
    target,
    dur: clamp(interp.duration * 0.9, 350, 1800),
    f: (t) => {
      const [cx, cy, vw] = interp(t)
      return { cx, cy, k: width / vw }
    }
  }
}

/** A slide at the target's zoom: unlike a flight, it never zooms out on the way. */
export const slide = (from: Camera, target: Camera): CameraMotion => {
  const dist = Math.hypot(target.cx - from.cx, target.cy - from.cy) * target.k
  return {
    target,
    dur: clamp(dist * 0.5, 180, 450),
    f: (t) => ({ cx: from.cx + (target.cx - from.cx) * t, cy: from.cy + (target.cy - from.cy) * t, k: target.k })
  }
}

/**
 * Where to look to read a range too big to fit whole at a legible zoom: zoomed to where glyphs
 * are legible, with the range's start lined up. Undefined if it fits whole at that size (or
 * `whole`), for the caller to fit all of it with `pad`.
 */
export const readingCamera = (vp: Viewport, r: Rect, pad: number, whole: boolean): Camera | undefined => {
  const fit = clamp(Math.min(vp.availW() / (r.w * pad), vp.availH() / (r.h * pad)), 0, 90)
  if (whole || fit >= READ_K) return undefined
  const k = clamp(vp.cam.k, READ_K, 72)
  const m = 28 // screen margin around the range, in CSS pixels
  const fitsW = r.w * k <= vp.availW() - 2 * m
  const fitsH = r.h * k <= vp.availH() - 2 * m
  const centre = vp.centreFor(r.x + r.w / 2, r.y + r.h / 2, k)
  // A range that fits vertically sits in the upper part of the view, clear of the legend
  // floating at the bottom.
  const midY = vp.insets.t + Math.max(vp.availH() * 0.33, (r.h * k) / 2 + m)
  return {
    k,
    // Line the start up just right of the row numbers, which are showing at this zoom.
    cx: fitsW ? centre.cx : r.x - (Math.max(vp.insets.l, AXIS_LEFT) + m - vp.w / 2) / k,
    cy: fitsH ? r.y + r.h / 2 - (midY - vp.h / 2) / k : r.y - (vp.insets.t + m - vp.h / 2) / k
  }
}
