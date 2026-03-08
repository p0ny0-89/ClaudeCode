import { useState, useEffect } from "react"

/**
 * Uses CSS mask-image instead of clip-path for the reveal effect.
 * This avoids conflicts when nested inside components that already
 * use clip-path (e.g. glitch-frame's grid cells with contain: strict).
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

  const p = progress * 100

  // Use a hard-edge linear-gradient mask to reveal content directionally.
  // #000 = fully visible, transparent = fully hidden.
  let gradientDir: string
  switch (direction) {
    case "right":
      gradientDir = "to left"
      break
    case "top":
      gradientDir = "to bottom"
      break
    case "bottom":
      gradientDir = "to top"
      break
    default: // "left" = left-to-right reveal
      gradientDir = "to right"
      break
  }

  const maskImage = `linear-gradient(${gradientDir}, #000 ${p}%, transparent ${p}%)`

  return {
    WebkitMaskImage: maskImage,
    maskImage,
  }
}
