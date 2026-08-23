import { BottomBar } from './components/BottomBar'
import { FreshnessBar } from './components/FreshnessBar'
import { NotBroadcast } from './components/NotBroadcast'
import { PageView } from './components/PageView'
import { TransportError } from './components/TransportError'
import { HOME_PAGE, useTextTv } from './useTextTv'
import { useVisualViewport } from './useVisualViewport'

export function App() {
  const { pageNumber, result, stale, updatedAt, navigate, reload } = useTextTv()
  useVisualViewport()
  // Both a page and a not-broadcast result carry the neighbours the arrows use.
  const neighbours = result?.kind === 'error' ? undefined : result

  return (
    <div className="app">
      <FreshnessBar updatedAt={updatedAt} stale={stale} pending={result === undefined} />
      <main className="content">
        {result === undefined && <p className="message__text">Hämtar…</p>}
        {result?.kind === 'page' && <PageView page={result} onNavigate={navigate} />}
        {result?.kind === 'not-broadcast' && (
          <NotBroadcast result={result} onNavigate={navigate} />
        )}
        {result?.kind === 'error' && <TransportError result={result} onRetry={reload} />}
      </main>
      <BottomBar
        pageNumber={pageNumber}
        prev={neighbours?.prev}
        next={neighbours?.next}
        onNavigate={navigate}
        onHome={() => navigate(HOME_PAGE)}
      />
    </div>
  )
}
