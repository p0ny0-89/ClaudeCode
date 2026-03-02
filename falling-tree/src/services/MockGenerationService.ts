import { Cue, AudioVersion, LayerType, GenerationService } from '../types'

/** One static sample file per layer type, served from /public/mock-audio/. */
const MOCK_AUDIO_URL: Record<LayerType, string> = {
  [LayerType.SFX]:      '/mock-audio/sfx-sample.mp3',
  [LayerType.Music]:    '/mock-audio/music-sample.mp3',
  [LayerType.Voice]:    '/mock-audio/voice-sample.mp3',
  [LayerType.Ambience]: '/mock-audio/ambience-sample.mp3',
}

/**
 * Simulates AI generation with a random 1–3 s delay.
 * Returns a pre-recorded sample for the cue's layer type.
 *
 * To swap in a real AI backend, implement GenerationService and inject
 * the new instance at the app root — no UI component changes needed.
 */
export const MockGenerationService: GenerationService = {
  async generate(cue: Cue): Promise<AudioVersion> {
    const delay = 1000 + Math.random() * 2000
    await new Promise(resolve => setTimeout(resolve, delay))
    return {
      id:          crypto.randomUUID(),
      url:         MOCK_AUDIO_URL[cue.type as unknown as LayerType],
      generatedAt: Date.now(),
    }
  },
}
