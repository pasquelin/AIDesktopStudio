import { renderPolicyOf } from '@shared/domain/renderPolicy'
import { DEFAULT_SETTINGS, WITHOUT_EDITOR_AIDS, type Settings } from '@shared/domain/settings'

/**
 * What a game window draws with: the policy an export carries — lens, quality, shadows — and
 * not one editor aid, whatever the studio shows. `chrome: false` holds the rest.
 */
export function gameViewport(three: Settings['three']): Settings['three'] {
  return {
    ...DEFAULT_SETTINGS.three,
    ...renderPolicyOf(three),
    ...WITHOUT_EDITOR_AIDS,
    showGrid: false,
  }
}
