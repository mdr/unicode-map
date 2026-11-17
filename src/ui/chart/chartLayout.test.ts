import { describe, expect, test } from "vite-plus/test"
import { cellSize, sectionLabels, visibleColumns } from "./chartLayout"

describe("cellSize", () => {
  test("fills the height, within 36 to 96 px before zooming", () => {
    expect(cellSize(16 * 50 + 82, 1)).toBe(50)
    expect(cellSize(200, 1)).toBe(36)
    expect(cellSize(5000, 1)).toBe(96)
  })

  test("zooms from there, within 28 to 160 px", () => {
    expect(cellSize(5000, 1.5)).toBe(144)
    expect(cellSize(5000, 3)).toBe(160)
    expect(cellSize(200, 0.4)).toBe(28)
  })
})

describe("sectionLabels", () => {
  const block = { s: 0x2600, e: 0x26ff }

  test("puts overlapping sections in further lanes", () => {
    const labels = sectionLabels(
      [
        [0x2600, 0x263f, "Weather"],
        [0x2630, 0x267f, "Yijing"],
        [0x2680, 0x26ff, "Dice"]
      ],
      block,
      40
    )
    expect(labels.map((l) => [l.title, l.a, l.z, l.lane])).toEqual([
      ["Weather", 0, 3, 0],
      ["Yijing", 3, 7, 1],
      ["Dice", 8, 15, 0]
    ])
  })

  test("leaves out sections too narrow to name", () => {
    expect(sectionLabels([[0x2600, 0x260f, "One column"]], block, 40)).toEqual([])
    expect(sectionLabels([[0x2600, 0x260f, "One column"]], block, 60)).toHaveLength(1)
  })

  test("clips sections to the block", () => {
    expect(sectionLabels([[0x25f0, 0x261f, "Overlapping"]], block, 40)[0]).toMatchObject({ a: 0, z: 1 })
  })
})

describe("visibleColumns", () => {
  test("covers the view and three columns either side, within the block", () => {
    expect(visibleColumns(0, 400, 40, 100)).toEqual({ from: 0, to: 13 })
    expect(visibleColumns(1000, 400, 40, 100)).toEqual({ from: 21, to: 38 })
    expect(visibleColumns(3800, 400, 40, 100)).toEqual({ from: 91, to: 99 })
  })
})
