import { useState, useEffect } from "react"

export function useTypingEffect(
  text: string,
  enabled: boolean,
  speed: number
) {
  const [visibleLength, setVisibleLength] = useState(
    enabled ? 0 : text.length
  )

  useEffect(() => {
    if (!enabled) {
      setVisibleLength(text.length)
      return
    }
    setVisibleLength(0)
    const totalChars = text.length
    if (totalChars === 0) return

    const interval = (speed * 1000) / totalChars
    let current = 0

    const timer = setInterval(() => {
      current++
      setVisibleLength(current)
      if (current >= totalChars) clearInterval(timer)
    }, interval)

    return () => clearInterval(timer)
  }, [text, enabled, speed])

  return {
    visibleText: text.slice(0, visibleLength),
    hiddenText: text.slice(visibleLength),
  }
}
