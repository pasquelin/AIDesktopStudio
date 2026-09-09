import { useAssistant } from '@/stores/assistant'
import { registerStudioAsk } from './studioAsk'
import { revealChat } from './components/Assistant/Toast/revealChat'

/**
 * The studio's own asker, for as long as the shell is up. It brings the conversation up first:
 * a question asked on a surface nobody is looking at is not a question — see `holdConfirmer`.
 */
export function holdStudioAsk(): () => void {
  return registerStudioAsk((questions, opening) => {
    revealChat()

    return useAssistant.getState().askChoice(questions, opening)
  })
}
