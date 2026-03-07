import { useState, useEffect } from "react"

const GLITCH_CHARS = "!@#$%^&*()_+-=[]{}|;:',.<>?/~`0123456789"

export function useGlitchEffect(
  text: string,
  enabled: boolean,
  speed: number
) {
  const [displayText, setDisplayText] = useState(text)

  useEffect(() => {
    if (!enabled) {
      setDisplayText(text)
      return
    }

    const chars = text.split("")
    const resolved = new Array(chars.length).fill(false)
    const duration = speed * 1000
    const start = performance.now()
    let raf: number

    function animate() {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)

      const resolveCount = Math.floor(progress * chars.length)
      for (let i = 0; i < resolveCount; i++) {
        resolved[i] = true
      }

      const result = chars
        .map((ch, i) => {
          if (resolved[i] || ch === " " || ch === "\n" || ch === "\r")
            return ch
          return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        })
        .join("")

      setDisplayText(result)

      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      } else {
        setDisplayText(text)
      }
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [text, enabled, speed])

  return { displayText }
}
