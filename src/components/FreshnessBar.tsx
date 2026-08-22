interface Props {
  updatedAt: number | undefined
  stale: boolean
  /** True only while the first fetch for this page is still in flight. */
  pending: boolean
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

/**
 * Says how old the content on screen is, so a cached frame is never mistaken
 * for a live one, and carries the attribution.
 */
export function FreshnessBar({ updatedAt, stale, pending }: Props) {
  // A page that is not broadcast, or that failed to load, has no timestamp
  // and is not loading either. Saying "Hämtar…" there would be a lie.
  const status = stale
    ? 'Cachad · uppdaterar…'
    : updatedAt !== undefined
      ? `Uppdaterad ${clock(updatedAt)}`
      : pending
        ? 'Hämtar…'
        : ''

  return (
    <div className="freshness">
      <span className="freshness__status">{status}</span>
      <span className="freshness__source">Innehåll från SVT Text</span>
    </div>
  )
}
