interface Props {
  updatedAt: number | undefined
  stale: boolean
}

const clock = (at: number): string =>
  new Date(at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

/**
 * Says how old the content on screen is, so a cached frame is never mistaken
 * for a live one, and carries the attribution.
 */
export function FreshnessBar({ updatedAt, stale }: Props) {
  const status = stale
    ? 'Cachad · uppdaterar…'
    : updatedAt !== undefined
      ? `Uppdaterad ${clock(updatedAt)}`
      : 'Hämtar…'

  return (
    <div className="freshness">
      <span className="freshness__status">{status}</span>
      <span className="freshness__source">Innehåll från SVT Text</span>
    </div>
  )
}
