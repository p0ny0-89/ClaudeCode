import { useState, useEffect } from "react"

/**
 * Returns a raw progress value (0–1) for the reveal animation.
 *
 * The actual reveal rendering is done in the component via
 * character/line-level visibility: hidden spans. This avoids ALL
 * CSS visual effects (clip-path, mask-image) that can be neutralized
 * by parent components using contain: strict or their own clip-path
 * (e.g. GlitchFrame grid cells).
 */
export function useRevealEffect(
  enabled: boolean,
  speed: number,
  direction: string
) {
  const [progress, setProgress] = useState(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) {
      setProgress(1)
      return
    }
    setProgress(0)
    const start = performance.now()
    const duration = speed * 1000
    let raf: number

    function animate(now: number) {
      const elapsed = now - start
      const p = Math.min(elapsed / duration, 1)
      setProgress(p)
      if (p < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [enabled, speed, direction])

  return { progress }
}
