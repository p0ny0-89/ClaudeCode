import { useState, useEffect } from "react"

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
  let clipPath: string
  switch (direction) {
    case "right":
      clipPath = `inset(0 0 0 ${100 - p}%)`
      break
    case "top":
      clipPath = `inset(0 0 ${100 - p}% 0)`
      break
    case "bottom":
      clipPath = `inset(${100 - p}% 0 0 0)`
      break
    default: // "left" - left to right
      clipPath = `inset(0 ${100 - p}% 0 0)`
      break
  }

  return { clipPath }
}
