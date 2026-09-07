import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_AI_OVERVIEW } from '@/services/fakeAiOverview'
import { installFakeBridge } from '@/services/fakeBridge'
import { useAiModels } from '@/stores/aiModels'
import { WelcomeSlideAi } from './WelcomeSlideAi'

describe('WelcomeSlideAi', () => {
  beforeEach(() => {
    installFakeBridge()
    useAiModels.setState({ overview: null })
  })

  it('names the four doors an AI reaches the studio by', () => {
    render(<WelcomeSlideAi />)

    for (const title of [
      'Sur cette machine',
      'Avec Ollama',
      'Chez un prestataire',
      'Et dans l’autre sens',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument()
    }
  })

  /** The one door with something to DO on it, so the sentence is not the end of the matter. */
  it('offers to install Ollama beside the sentence explaining it', () => {
    useAiModels.setState({ overview: EMPTY_AI_OVERVIEW })
    render(<WelcomeSlideAi />)

    expect(screen.getByRole('button', { name: 'Installer Ollama' })).toBeInTheDocument()
  })
})
