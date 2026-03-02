import { Cue, CueState } from '../../types'

interface Props {
  cues:       Cue[]
  onGenerate: () => void
  isLoading:  boolean
}

export default function GenerateButton({ cues, onGenerate, isLoading }: Props) {
  const hasPending = cues.some(c => c.state === CueState.Pending)
  const disabled   = !hasPending || isLoading

  return (
    <button
      onClick={onGenerate}
      disabled={disabled}
      style={{
        margin:       16,
        padding:      '12px 32px',
        fontSize:     16,
        fontWeight:   700,
        background:   disabled ? '#444' : '#4a9eff',
        color:        disabled ? '#888' : '#fff',
        border:       'none',
        borderRadius: 6,
        cursor:       disabled ? 'not-allowed' : 'pointer',
        alignSelf:    'flex-end',
      }}
    >
      {isLoading ? 'Generating…' : 'Generate Audio'}
    </button>
  )
}
