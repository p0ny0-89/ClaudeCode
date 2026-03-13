import { useRef, useState, useEffect, useMemo, useCallback } from "react"

// Module-level canvas for character width measurement (reused across calls)
let _measureCanvas: HTMLCanvasElement | null = null
const REF_SIZE = 16 // reference font size for measurement

function getCharWidth(fontFamily: string): number {
  if (typeof document === "undefined") return REF_SIZE * 0.6 // SSR fallback
  if (!_measureCanvas) _measureCanvas = document.createElement("canvas")
  const ctx = _measureCanvas.getContext("2d")!
  ctx.font = `${REF_SIZE}px ${fontFamily}`
  return ctx.measureText("M").width
}

/**
 * Auto-fit font sizing hook.
 *
 * Measures the container width via ResizeObserver and calculates the
 * font size that makes the longest text line fit exactly within the
 * container. Returns `maxFontSize` when disabled or when the text
 * already fits at max size.
 *
 * Formula (monospace):
 *   effectiveCharWidth = (charWidthAtRef / REF_SIZE) * fontSize + letterSpacing
 *   containerWidth = longestLineLen * effectiveCharWidth
 *   → fontSize = (containerWidth / longestLineLen - letterSpacing) * (REF_SIZE / charWidthAtRef)
 */
export function useAutoFitFontSize(
  rootRef: React.RefObject<HTMLDivElement | null>,
  text: string,
  fontFamily: string,
  maxFontSize: number,
  letterSpacing: number,
  enabled: boolean
): number {
  const [computedSize, setComputedSize] = useState(maxFontSize)
  const fontFamilyRef = useRef(fontFamily)
  fontFamilyRef.current = fontFamily

  const longestLineLen = useMemo(() => {
    const lines = text.split("\n")
    return Math.max(...lines.map((l) => l.length), 1)
  }, [text])

  const calculate = useCallback(() => {
    const el = rootRef.current
    if (!el) return
    const containerWidth = el.clientWidth
    if (containerWidth <= 0) return

    const charWidthAtRef = getCharWidth(fontFamilyRef.current)
    if (charWidthAtRef <= 0) return

    // Solve for fontSize:
    // containerWidth = longestLineLen * ((charWidthAtRef / REF_SIZE) * fontSize + letterSpacing)
    // fontSize = (containerWidth / longestLineLen - letterSpacing) * (REF_SIZE / charWidthAtRef)
    const raw =
      (containerWidth / longestLineLen - letterSpacing) *
      (REF_SIZE / charWidthAtRef)

    // Allow scaling both up and down; only hard-cap at 500px to prevent
    // absurd sizes.  maxFontSize is NOT used as a ceiling here so the text
    // can grow beyond the panel's fontSize value when the container is wide.
    const clamped = Math.max(1, Math.min(raw, 500))
    setComputedSize(clamped)
  }, [rootRef, longestLineLen, letterSpacing, maxFontSize])

  useEffect(() => {
    if (!enabled) {
      setComputedSize(maxFontSize)
      return
    }

    const el = rootRef.current
    if (!el) return

    // Initial calculation
    calculate()

    // Recompute when container resizes
    const ro = new ResizeObserver(() => calculate())
    ro.observe(el)

    // Recompute after async fonts finish loading
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.ready.then(() => calculate())
    }

    return () => ro.disconnect()
  }, [enabled, calculate, rootRef, maxFontSize])

  return enabled ? computedSize : maxFontSize
}
