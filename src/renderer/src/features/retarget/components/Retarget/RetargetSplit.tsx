import { useTranslation } from 'react-i18next'
import { QuietNote } from '@/components/QuietNote'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useSplitPair } from '@/hooks/useSplitPair'
import { RetargetViewport } from './RetargetViewport'
import { RetargetViewPane } from './RetargetViewPane'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'
import type { useRetargetNavigation } from '../../hooks/useRetargetNavigation'

type Props = RetargetWorkspaceState & {
  navigation: ReturnType<typeof useRetargetNavigation>
}

export function RetargetSplit({
  session,
  chosen,
  sourceUrl,
  clipIndex,
  sourceReady,
  targetReady,
  setFailure,
  navigation,
}: Props) {
  const { t } = useTranslation()
  const views = useSplitPair('horizontal')
  if (!session.snapshot) return null
  return (
    <div ref={views.pairRef} className="flex min-h-0 flex-1">
      <RetargetViewPane
        label={t('character.retarget.source')}
        title={
          chosen
            ? t('character.retarget.sourceTitle', { name: chosen.name })
            : t('character.retarget.source')
        }
        active={navigation.active === 'source'}
        style={views.leadStyle}
        onActivate={() => navigation.activate('source')}
      >
        {sourceUrl ? (
          <RetargetViewport
            assetId="retarget-source"
            sourceUrl={sourceUrl}
            clipIndex={clipIndex}
            onReady={sourceReady}
            onFailure={() => setFailure(true)}
            navigating={navigation.active === 'source' && navigation.navigating}
            onNavigatingChange={navigation.onNavigatingChange}
          />
        ) : (
          <QuietNote standalone>{t('character.retarget.chooseSource')}</QuietNote>
        )}
      </RetargetViewPane>
      <ResizeHandle axis="horizontal" size={views.leadSize} onSize={views.onLeadSize} />
      <RetargetViewPane
        label={session.snapshot.name}
        title={session.snapshot.name}
        active={navigation.active === 'target'}
        grow
        onActivate={() => navigation.activate('target')}
      >
        <RetargetViewport
          assetId={session.snapshot.assetId}
          snapshot={session.snapshot}
          onReady={targetReady}
          onFailure={() => setFailure(true)}
          navigating={navigation.active === 'target' && navigation.navigating}
          onNavigatingChange={navigation.onNavigatingChange}
        />
      </RetargetViewPane>
    </div>
  )
}
