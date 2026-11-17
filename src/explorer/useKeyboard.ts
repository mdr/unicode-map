import { useEffect } from "react"
import { type KeyAction, keyAction } from "./keyActions"

/**
 * Carries out the key bindings (see keyActions.ts) while focus isn't in a text field. `handle`
 * returns false for an action that didn't apply, so the key keeps its default behaviour.
 */
export const useKeyboard = (
  context: { pure: boolean; inChart: boolean; modeCount: number },
  handle: (action: KeyAction) => boolean
): void => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const action = keyAction(e.key, e.shiftKey, context)
      if (action && handle(action)) e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })
}
