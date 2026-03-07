import { useState, useEffect } from "react"

export function useFadeEffect(enabled: boolean, speed: number) {
  const [opacity, setOpacity] = useState(enabled ? 0 : 1)

  useEffect(() => {
    if (!enabled) {
      setOpacity(1)
      return
    }
    setOpacity(0)
    const start = performance.now()
    const duration = speed * 1000
    let raf: number

    function animate(now: number) {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      setOpacity(progress)
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [enabled, speed])

  return { opacity }
}
