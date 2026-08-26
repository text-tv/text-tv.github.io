interface Props {
  updatedAt: number | undefined
  stale: boolean
  /** True only while the first fetch for this page is still in flight. */
  pending: boolean
  /** True while a fetch the reader asked for is in flight. */
  refreshing: boolean
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

/**
 * Says how old the content on screen is, so a cached frame is never mistaken
 * for a live one, and carries the attribution.
 */
export function FreshnessBar({ updatedAt, stale, pending, refreshing }: Props) {
  // A page that is not broadcast, or that failed to load, has no timestamp
  // and is not loading either. Saying "Hämtar…" there would be a lie.
  //
  // `refreshing` is tested first because both it and `stale` are true during a
  // refresh over a painted copy, and the reader-initiated reading is the one
  // worth showing: they are standing over this particular wait.
  const status = refreshing
    ? 'Hämtar…'
    : stale
      ? 'Cachad · uppdaterar…'
      : updatedAt !== undefined
        ? `Uppdaterad ${clock(updatedAt)}`
        : pending
          ? 'Hämtar…'
          : ''

  return (
    <div className="freshness">
      {/*
        Polite rather than assertive: "Hämtar…" -> "Uppdaterad 15:41" is worth
        one announcement when the reader next pauses, not an interruption. The
        element is present from first render and only its text changes, which
        is what a live region needs to notice anything at all.
      */}
      <span
        className={refreshing ? 'freshness__status freshness__status--refreshing' : 'freshness__status'}
        aria-live="polite"
      >
        {status}
      </span>
      <span className="freshness__source">Innehåll från SVT Text</span>
    </div>
  )
}
