import { useRetargetNavigation } from './hooks/useRetargetNavigation'
import { useTranslation } from 'react-i18next'
import { PanelHeader } from '@pasquelin/panels'
import { QuietNote } from '@/components/QuietNote'
import { ResizeHandle } from '@/components/ResizeHandle'
import { useSplitPair } from '@/hooks/useSplitPair'
import { RetargetViewport } from './RetargetViewport'
import { RetargetTransport } from './RetargetTransport'
import type { RetargetWorkspaceState } from './hooks/useRetargetWorkspace'
export function RetargetViews({
  session,
  sourceUrl,
  source,
  target,
  clipIndex,
  preview,
  sourceReady,
  targetReady,
  setFailure,
}: RetargetWorkspaceState) {
  const { t } = useTranslation()
  const views = useSplitPair('horizontal')
  const navigation = useRetargetNavigation(source?.engine ?? null, target?.engine ?? null)
  if (!session.snapshot) return null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={views.pairRef} className="flex min-h-0 flex-1">
        <section
          tabIndex={0}
          onPointerDownCapture={() => navigation.activate('source')}
          onFocusCapture={() => navigation.activate('source')}
          style={views.leadStyle}
          className="flex min-h-0 min-w-0 flex-col"
        >
          <PanelHeader title={t('character.retarget.source')} />
          {sourceUrl ? (
            <RetargetViewport
              assetId="retarget-source"
              sourceUrl={sourceUrl}
              onReady={sourceReady}
              onFailure={() => setFailure(true)}
              navigating={navigation.active === 'source' && navigation.navigating}
              onNavigatingChange={navigation.onNavigatingChange}
            />
          ) : (
            <QuietNote standalone>{t('character.retarget.chooseSource')}</QuietNote>
          )}
        </section>
        <ResizeHandle axis="horizontal" size={views.leadSize} onSize={views.onLeadSize} />
        <section
          tabIndex={0}
          onPointerDownCapture={() => navigation.activate('target')}
          onFocusCapture={() => navigation.activate('target')}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <PanelHeader title={session.snapshot.name} />
          <RetargetViewport
            assetId={session.snapshot.assetId}
            snapshot={session.snapshot}
            onReady={targetReady}
            onFailure={() => setFailure(true)}
            navigating={navigation.active === 'target' && navigation.navigating}
            onNavigatingChange={navigation.onNavigatingChange}
          />
        </section>
      </div>
      <RetargetTransport
        source={source}
        target={target}
        clipIndex={clipIndex}
        result={preview.result}
      />
    </div>
  )
}
