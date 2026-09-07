import { mdiMicrophone } from '@mdi/js'
import { useTranslation } from 'react-i18next'
import { STT_MODEL_BYTES } from '@shared/domain/dictation'
import { ProgressBar } from '@/components/ProgressBar'
import { STATUS_BUTTON } from '@/components/styles'
import { UiIcon } from '@/components/UiIcon'
import { useBytes } from '@/hooks/useBytes'
import { useDictationView } from '@/hooks/useDictationView'
import { HINT_TOP } from '@/helpers/tooltip'
import { DictationStatusListening } from './DictationStatusListening'

/**
 * What dictation has to say to the whole application, rather than to one field.
 *
 * The status line, like the update waiting to be installed beside it: the model to fetch, the
 * download running, the microphone the system refused. A form with two long text fields would
 * otherwise offer two buttons to download the same 640 MB, and a refusal repeated per field
 * says nothing more than a refusal said once.
 *
 * It also says the microphone is on, which an application that records has to: the button that
 * started the session may be behind a panel, in another workspace, or scrolled past.
 */
export function DictationStatus() {
  const { t } = useTranslation()
  return dictationContent(useDictationView(), useBytes(), t)
}

type DictationView = ReturnType<typeof useDictationView>
type Bytes = ReturnType<typeof useBytes>
type Translate = ReturnType<typeof useTranslation>['t']

function dictationContent(dictation: DictationView, bytes: Bytes, t: Translate) {
  if (!dictation.enabled) return null
  if (dictation.isListening) return <DictationStatusListening />
  if (dictation.state === 'modelMissing') return missingModel(dictation, bytes, t)
  if (dictation.state === 'downloadingModel' && dictation.download)
    return modelDownload(dictation, bytes, t)
  if (dictation.state === 'permissionRequired') return permissionRequired(dictation, t)
  if (dictation.state === 'error' && dictation.failure)
    return <span role="status">{t(`dictation.errors.${dictation.failure.code}`)}</span>
  return null
}

function missingModel(dictation: DictationView, bytes: Bytes, t: Translate) {
  return (
    <button
      type="button"
      {...HINT_TOP(t('dictation.downloadHint'))}
      onClick={() => void dictation.downloadModel()}
      className={STATUS_BUTTON}
    >
      <UiIcon path={mdiMicrophone} size={12} />
      <span>{t('dictation.download', { size: bytes(STT_MODEL_BYTES) })}</span>
    </button>
  )
}

function modelDownload(dictation: DictationView, bytes: Bytes, t: Translate) {
  if (!dictation.download) return null
  const label = t('dictation.downloading', {
    done: bytes(dictation.download.received),
    total: bytes(dictation.download.total),
  })
  const ratio =
    dictation.download.total > 0 ? dictation.download.received / dictation.download.total : 0
  return (
    <span className="flex items-center gap-1.5">
      <span>{label}</span>
      <ProgressBar ratio={ratio} label={label} className="w-12" />
      <button
        type="button"
        {...HINT_TOP(t('dictation.cancelDownloadHint'))}
        onClick={() => void dictation.cancelDownload()}
        className="hover:text-text"
      >
        {t('dictation.cancelDownload')}
      </button>
    </span>
  )
}

function permissionRequired(dictation: DictationView, t: Translate) {
  return (
    <button
      type="button"
      {...HINT_TOP(t('dictation.openPrivacySettingsHint'))}
      onClick={() => void dictation.openPrivacySettings()}
      className={STATUS_BUTTON}
    >
      <UiIcon path={mdiMicrophone} size={12} />
      <span>{t('dictation.openPrivacySettings')}</span>
    </button>
  )
}
