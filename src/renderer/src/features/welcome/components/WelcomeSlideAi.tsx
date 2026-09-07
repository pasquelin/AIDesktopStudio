import { mdiApi, mdiCloudKeyOutline, mdiLaptop, mdiPowerPlugOutline } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { AiOllamaOffer } from '@/features/settings/components/Ai/AiOllamaOffer'
import { aiDiskBusy, type OllamaOffer } from '@shared/domain/aiOverview'
import { useAiModels } from '@/stores/aiModels'
import { WelcomeAiWay } from './WelcomeAiWay'
import { WelcomeCopy } from './WelcomeCopy'

/**
 * Why this studio has AI at all, and by how many doors: local weights, Ollama, a cloud key, and the
 * one nobody expects — the studio publishes its own tools, so an outside agent drives IT.
 */
export function WelcomeSlideAi() {
  const { t } = useTranslation()
  const ollama = useAiModels(state => state.overview?.ollama ?? null)
  const busy = useAiModels(state => aiDiskBusy(state.overview))

  return (
    <div>
      <WelcomeCopy title={t('welcome.ai.title')} body={t('welcome.ai.body')} />
      <ul className="grid grid-cols-2 gap-3">
        <WelcomeAiWay
          glyph={mdiLaptop}
          tone="local"
          title={t('welcome.ai.local.title')}
          body={t('welcome.ai.local.body')}
        />
        <WelcomeAiWay
          glyph={mdiPowerPlugOutline}
          tone="ollama"
          title={t('welcome.ai.ollama.title')}
          body={t('welcome.ai.ollama.body')}
        >
          {ollama !== null && missingOllama(ollama) && <AiOllamaOffer offer={ollama} busy={busy} />}
        </WelcomeAiWay>
        <WelcomeAiWay
          glyph={mdiCloudKeyOutline}
          tone="cloud"
          title={t('welcome.ai.cloud.title')}
          body={t('welcome.ai.cloud.body')}
        />
        <WelcomeAiWay
          glyph={mdiApi}
          tone="studio"
          title={t('welcome.ai.mcp.title')}
          body={t('welcome.ai.mcp.body')}
        />
      </ul>
    </div>
  )
}

/**
 * Whether Ollama is still worth a word under its card. Silent once it answers with models: it has
 * nothing to offer then, and its ready sentence points at a screen this window does not have.
 */
function missingOllama(offer: OllamaOffer): boolean {
  return offer.progress !== null || !offer.ready || offer.names.length === 0
}
