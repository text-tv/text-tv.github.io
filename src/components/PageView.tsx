import type { PageNumber, PageResult } from '../api.types'
import { QuickLinks } from './QuickLinks'
import { SubPageFrame } from './SubPageFrame'

interface Props {
  page: PageResult
  onNavigate: (pageNumber: PageNumber) => void
}

/**
 * A page's sub-pages, stacked in one scroll. They are never cycled: advancing
 * the frame under someone mid-sentence is the classic teletext frustration.
 */
export function PageView({ page, onNavigate }: Props) {
  return (
    <div className="pages">
      {page.subPages.map((subPage, index) => (
        <SubPageFrame
          key={subPage.subPageNumber || index}
          subPage={subPage}
          onNavigate={onNavigate}
        />
      ))}
      <QuickLinks current={page.pageNumber} onNavigate={onNavigate} />
    </div>
  )
}
