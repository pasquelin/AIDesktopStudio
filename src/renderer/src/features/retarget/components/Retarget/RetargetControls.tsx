import { PANEL_SCROLL } from '@/components/panelStyles'
import type { RetargetWorkspaceState } from '../../hooks/useRetargetWorkspace'
import { RetargetSource } from './RetargetSource'
import { RetargetProfiles } from './RetargetProfiles'
import { RetargetSettings } from './RetargetSettings'
import { RetargetActions } from './RetargetActions'

export function RetargetControls(props: RetargetWorkspaceState) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden">
      <div className={PANEL_SCROLL}>
        <RetargetSource {...props} />
        <div inert={props.sourceLoading} aria-busy={props.sourceLoading}>
          <RetargetProfiles {...props} />
          <RetargetSettings {...props} />
        </div>
      </div>
      <RetargetActions {...props} />
    </div>
  )
}
