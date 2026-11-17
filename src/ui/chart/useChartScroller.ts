import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cellSize, GUTTER } from "./chartLayout"

/**
 * The chart's scrolling box: its size, how far it's scrolled, the cell size, and zooming that
 * keeps the column under the pointer still. Plain wheel and trackpad scrolling move sideways;
 * pinch (ctrl+wheel) zooms.
 */
export const useChartScroller = (
  scroller: RefObject<HTMLDivElement | null>
): {
  box: { w: number; h: number }
  cell: number
  scrollLeft: number
  setScrollLeft: (left: number) => void
  zoomBy: (factor: number, px?: number) => void
} => {
  const [box, setBox] = useState({ w: 800, h: 600 })
  const [zoom, setZoom] = useState(1)
  const [scrollLeft, setScrollLeft] = useState(0)
  const cell = cellSize(box.h, zoom)
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [scroller])

  // The column under the pointer, and where the pointer was, while a zoom takes effect.
  const anchor = useRef<{ col: number; px: number }>(undefined)
  const zoomBy = (factor: number, px = box.w / 2): void => {
    anchor.current = { col: (scrollLeft + px - GUTTER) / cell, px }
    setZoom((z) => Math.max(0.4, Math.min(3, z * factor)))
  }
  useLayoutEffect(() => {
    const a = anchor.current
    if (!a || !scroller.current) return
    scroller.current.scrollLeft = a.col * cell + GUTTER - a.px
    anchor.current = undefined
  }, [cell, scroller])

  useEffect(() => {
    const el = scroller.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) {
        e.preventDefault()
        zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - el.getBoundingClientRect().left)
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollHeight <= el.clientHeight + 1) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  })
  return { box, cell, scrollLeft, setScrollLeft, zoomBy }
}
