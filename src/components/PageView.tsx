import type { PageNumber, PageResult } from '../api.types'
import { SubPageFrame } from './SubPageFrame'

interface Props {
  page: PageResult
  /** Passed straight through to each frame; see `SubPageFrame`. */
  markId: number
  onNavigate: (pageNumber: PageNumber) => void
}

/**
 * A page's sub-pages, stacked in one scroll. They are never cycled: advancing
 * the frame under someone mid-sentence is the classic teletext frustration.
 */
export function PageView({ page, markId, onNavigate }: Props) {
  return (
    <div className="pages">
      {page.subPages.map((subPage, index) => (
        // Keyed by sub-page number, which is what pairs a frame with the same
        // frame in the payload that replaced it - the like-with-like the marks
        // are compared over.
        <SubPageFrame
          key={subPage.subPageNumber || index}
          subPage={subPage}
          markId={markId}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  )
}
