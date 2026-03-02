import { useRef, useEffect } from 'react'

interface Props {
  videoUrl:     string
  onTimeUpdate: (currentTime: number) => void
  /** Set this to explicitly seek the player (e.g. user clicked timeline).
   *  Do NOT feed state.currentTime back here — that causes a seek loop. */
  seekTo?: number
}

export default function VideoPlayer({ videoUrl, onTimeUpdate, seekTo }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Respond to explicit seek requests from the parent.
  // Uses a ref to avoid re-seeking on every render.
  const lastSeekRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (seekTo === undefined) return
    if (seekTo === lastSeekRef.current) return
    lastSeekRef.current = seekTo
    const video = videoRef.current
    if (video) video.currentTime = seekTo
  }, [seekTo])

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      controls
      style={{ width: '100%', display: 'block' }}
      onTimeUpdate={() => {
        if (videoRef.current) onTimeUpdate(videoRef.current.currentTime)
      }}
    />
  )
}
