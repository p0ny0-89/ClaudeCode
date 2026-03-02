import {
  AutoGenerateConfig,
  CueAutoGenerateService,
  CueType,
  IntensityLevel,
  SuggestedCue,
} from '../types'

/** Number of cues to generate per layer type, keyed by intensity. */
const CUES_PER_TYPE: Record<IntensityLevel, number> = {
  [IntensityLevel.Subtle]:   2,
  [IntensityLevel.Balanced]: 4,
  [IntensityLevel.Bold]:     7,
}

/** Placeholder prompts per type — a real service would infer these from the video. */
const SAMPLE_PROMPTS: Record<CueType, string[]> = {
  [CueType.SFX]: [
    'sharp impact hit',
    'subtle whoosh transition',
    'mechanical click',
    'glass shatter',
    'door slam',
    'footsteps on gravel',
    'paper rustle',
  ],
  [CueType.Music]: [
    'tension-building underscore',
    'uplifting melodic swell',
    'ambient drone pad',
    'staccato rhythmic motif',
    'emotional string crescendo',
    'lo-fi chill beat',
    'cinematic brass hit',
  ],
  [CueType.Voice]: [
    'narrator dialogue cue',
    'crowd murmur background',
    'whispered aside',
    'crowd cheer',
  ],
  [CueType.Ambience]: [
    'outdoor wind and birds',
    'city street noise',
    'quiet indoor room tone',
    'rain on window',
    'forest ambience',
    'ocean waves',
    'low mechanical hum',
  ],
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Mocks AI analysis of the video to produce cue suggestions.
 *
 * - Respects config.includeTypes — only generates cues for the selected types.
 * - Respects config.intensity — controls how many cues are produced per type.
 * - Spreads cues evenly across the video duration with minor random jitter.
 * - Simulates AI latency with a 1–2 s delay.
 *
 * To swap in a real AI backend, implement CueAutoGenerateService and inject
 * the new instance at the app root — no UI component needs to change.
 */
export const MockCueAutoGenerateService: CueAutoGenerateService = {
  async generate(config: AutoGenerateConfig, videoDuration: number): Promise<SuggestedCue[]> {
    const delay = 1000 + Math.random() * 1000
    await new Promise(resolve => setTimeout(resolve, delay))

    const count     = CUES_PER_TYPE[config.intensity]
    const types     = config.includeTypes.length > 0 ? config.includeTypes : [CueType.SFX]
    const duration  = Math.max(videoDuration, 10)
    const cues: SuggestedCue[] = []

    for (const type of types) {
      const prompts = SAMPLE_PROMPTS[type]
      for (let i = 0; i < count; i++) {
        // Divide the video into equal slots; jitter within each slot.
        const slotSize  = duration / count
        const jitter    = (Math.random() - 0.5) * slotSize * 0.4
        const startTime = Math.max(0, Math.min(i * slotSize + slotSize / 2 + jitter, duration - 2))
        const cueDuration = 1.5 + Math.random() * 3

        cues.push({
          type,
          prompt:    pickRandom(prompts),
          startTime: Math.round(startTime * 100) / 100,
          duration:  Math.round(cueDuration * 100) / 100,
        })
      }
    }

    // Return sorted by startTime — the reducer will re-sort anyway, but it's cleaner.
    return cues.sort((a, b) => a.startTime - b.startTime)
  },
}
