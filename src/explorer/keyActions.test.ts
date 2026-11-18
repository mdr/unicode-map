import { describe, expect, test } from "vite-plus/test"
import { keyAction, KeyActionType } from "./keyActions"

const map = { pure: false, inChart: false, modeCount: 5 }
const chart = { pure: false, inChart: true, modeCount: 5 }
const pure = { pure: true, inChart: false, modeCount: 5 }

describe("keyAction", () => {
  test("arrows step along the map's rows of 256", () => {
    expect(keyAction("ArrowRight", false, map)).toEqual({ type: KeyActionType.MOVE, delta: 1, assignedOnly: false })
    expect(keyAction("ArrowUp", false, map)).toEqual({ type: KeyActionType.MOVE, delta: -256, assignedOnly: false })
  })

  test("in a chart, up and down step by one and left and right by a column", () => {
    expect(keyAction("ArrowDown", false, chart)).toEqual({ type: KeyActionType.MOVE, delta: 1, assignedOnly: false })
    expect(keyAction("ArrowLeft", false, chart)).toEqual({ type: KeyActionType.MOVE, delta: -16, assignedOnly: false })
  })

  test("shift skips unassigned code points along the reading direction only", () => {
    expect(keyAction("ArrowRight", true, map)).toMatchObject({ assignedOnly: true })
    expect(keyAction("ArrowDown", true, map)).toMatchObject({ assignedOnly: false })
    expect(keyAction("ArrowDown", true, chart)).toMatchObject({ assignedOnly: true })
    expect(keyAction("ArrowRight", true, chart)).toMatchObject({ assignedOnly: false })
  })

  test("i cycles the interpretation of the Private Use Areas", () => {
    expect(keyAction("i", false, map)).toEqual({ type: KeyActionType.NEXT_INTERPRETATION })
  })

  test("number keys pick a colour mode", () => {
    expect(keyAction("2", false, map)).toEqual({ type: KeyActionType.MODE, index: 1 })
    expect(keyAction("6", false, map)).toBeUndefined()
  })

  test("pure view only zooms and leaves", () => {
    expect(keyAction("Escape", false, pure)).toEqual({ type: KeyActionType.LEAVE_PURE })
    expect(keyAction("z", false, pure)).toEqual({ type: KeyActionType.LEAVE_PURE })
    expect(keyAction("0", false, pure)).toEqual({ type: KeyActionType.OVERVIEW })
    expect(keyAction("ArrowRight", false, pure)).toBeUndefined()
    expect(keyAction("c", false, pure)).toBeUndefined()
  })

  test("unbound keys do nothing", () => {
    expect(keyAction("q", false, map)).toBeUndefined()
  })
})
