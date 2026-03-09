import { useRef, useState, useCallback, useEffect } from "react"

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`0123456789"

/**
 * Per-character hover glitch effect.
 *
 * Each non-whitespace character is wrapped in a `<span data-ci={flatIndex}>`.
 * When the cursor moves over a character, it and its neighbours (within
 * `radius`) start cycling through random glitch characters.  Characters
 * decay back to their original form after `decayMs`.
 *
 * Uses event delegation — attach `onPreMouseMove` to the `<pre>` element
 * and the hook handles the rest.
 */
export function useHoverGlitch(
  text: string,
  enabled: boolean,
  radius: number = 2,
  decayMs: number = 350,
  cycleMs: number = 60
) {
  // Map of flat char index → expiry timestamp (when the glitch should stop)
  const activeRef = useRef<Map<number, number>>(new Map())
  // Current overrides: flat char index → glitch character to display
  const [overrides, setOverrides] = useState<Map<number, string>>(new Map())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const textRef = useRef(text)
  textRef.current = text

  // Build a flat index → {row, col} lookup and inverse
  // Flat index counts every character in the string (including newlines)
  const flatChars = useRef<string[]>([])
  const rowColOf = useRef<{ row: number; col: number }[]>([])

  useEffect(() => {
    const chars = text.split("")
    flatChars.current = chars
    const rc: { row: number; col: number }[] = []
    let row = 0
    let col = 0
    for (let i = 0; i < chars.length; i++) {
      rc.push({ row, col })
      if (chars[i] === "\n") {
        row++
        col = 0
      } else {
        col++
      }
    }
    rowColOf.current = rc
  }, [text])

  // Start the cycling interval when there are active chars
  const startCycling = useCallback(() => {
    if (intervalRef.current !== null) return
    intervalRef.current = setInterval(() => {
      const now = performance.now()
      const active = activeRef.current
      const chars = flatChars.current

      // Purge expired entries
      for (const [idx, expiry] of active) {
        if (now >= expiry) active.delete(idx)
      }

      if (active.size === 0) {
        // Nothing active — stop cycling and clear overrides
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setOverrides(new Map())
        return
      }

      // Build new overrides for active chars
      const next = new Map<number, string>()
      for (const idx of active.keys()) {
        const ch = chars[idx]
        // Don't glitch whitespace / newlines
        if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") continue
        next.set(
          idx,
          GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        )
      }
      setOverrides(next)
    }, cycleMs)
  }, [cycleMs])

  // Event handler for mouse move on the <pre> element (event delegation)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return

      const target = (e.target as HTMLElement).closest("[data-ci]") as HTMLElement | null
      if (!target) return

      const ci = parseInt(target.getAttribute("data-ci") || "", 10)
      if (isNaN(ci)) return

      const now = performance.now()
      const expiry = now + decayMs
      const rc = rowColOf.current
      const chars = flatChars.current

      if (!rc[ci]) return

      const { row: hoverRow, col: hoverCol } = rc[ci]

      // Activate chars within Manhattan-distance radius
      for (let i = 0; i < chars.length; i++) {
        if (chars[i] === "\n" || chars[i] === "\r") continue
        const { row: r, col: c } = rc[i]
        const dist = Math.abs(r - hoverRow) + Math.abs(c - hoverCol)
        if (dist <= radius) {
          // Probability falloff: closer chars more likely to activate
          const prob = 1 - dist / (radius + 1)
          if (Math.random() < prob) {
            activeRef.current.set(i, expiry)
          }
        }
      }

      startCycling()
    },
    [enabled, radius, decayMs, startCycling]
  )

  // Mouse leave — let existing chars decay naturally (don't force clear)
  const handleMouseLeave = useCallback(() => {
    // Do nothing — chars will decay via their expiry timestamps
  }, [])

  // Cleanup interval on unmount or when disabled
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      activeRef.current.clear()
      setOverrides(new Map())
    }
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled])

  return { overrides, handleMouseMove, handleMouseLeave }
}
