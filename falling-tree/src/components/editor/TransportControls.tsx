interface Props {
  currentTime: number
  duration:    number
  isPlaying:   boolean
  onPlay:      () => void
  onPause:     () => void
  onSeek:      (time: number) => void
}

function formatTime(seconds: number): string {
  const m  = Math.floor(seconds / 60)
  const s  = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

export default function TransportControls({
  currentTime,
  duration,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
}: Props) {
  const progress = duration > 0 ? currentTime / duration : 0

  function handleScrubClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const time = Math.max(0, Math.min((x / rect.width) * duration, duration))
    onSeek(time)
  }

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            12,
        padding:        '8px 16px',
        background:     '#1a1a1a',
        borderTop:      '1px solid #333',
        color:          '#eee',
        fontSize:       13,
      }}
    >
      {/* Play / Pause */}
      <button
        onClick={isPlaying ? onPause : onPlay}
        style={{
          background:   '#4a9eff',
          color:        '#fff',
          border:       'none',
          borderRadius: 4,
          padding:      '6px 16px',
          cursor:       'pointer',
          fontWeight:   700,
          fontSize:     14,
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Time display */}
      <span style={{ fontFamily: 'monospace', minWidth: 120 }}>
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      {/* Scrub bar */}
      <div
        onClick={handleScrubClick}
        style={{
          flex:         1,
          height:       8,
          background:   '#333',
          borderRadius: 4,
          cursor:       'pointer',
          position:     'relative',
        }}
      >
        <div
          style={{
            position:     'absolute',
            left:         0,
            top:          0,
            height:       '100%',
            width:        `${progress * 100}%`,
            background:   '#4a9eff',
            borderRadius: 4,
            pointerEvents:'none',
          }}
        />
      </div>
    </div>
  )
}
