import { BottomBar } from './components/BottomBar'
import { FreshnessBar } from './components/FreshnessBar'
import { NotBroadcast } from './components/NotBroadcast'
import { PageView } from './components/PageView'
import { TransportError } from './components/TransportError'
import { HOME_PAGE, useTextTv } from './useTextTv'

export function App() {
  const { pageNumber, result, stale, updatedAt, navigate, reload } = useTextTv()
  const page = result?.kind === 'page' ? result : undefined

  return (
    <div className="app">
      <FreshnessBar updatedAt={updatedAt} stale={stale} />
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
        prev={page?.prev ?? (result?.kind === 'not-broadcast' ? result.prev : undefined)}
        next={page?.next ?? (result?.kind === 'not-broadcast' ? result.next : undefined)}
        onNavigate={navigate}
        onHome={() => navigate(HOME_PAGE)}
      />
    </div>
  )
}
