import type { CloudAsset, CloudPage } from '@shared/domain/cloudAsset'
import type { Page } from '@/hooks/page'

/** The API's listing as a page: `CloudPage` names its rows `assets`, and `usePages` any listing. */
export function cloudPage(page: CloudPage): Page<CloudAsset> {
  return { items: page.assets, cursor: page.cursor }
}
