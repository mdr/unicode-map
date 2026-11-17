import { interpolateZoom } from "d3-interpolate"
import type { Camera } from "../MapView"
import type { Px } from "../../units"
import { clamp } from "./constants"

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
