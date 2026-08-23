/**
 * Keeps an installed copy of the app up to date.
 *
 * The browser only re-checks the service worker on a navigation inside its
 * scope. Opening a tab is one; resuming a home-screen app is not, so an
 * installed copy would otherwise never learn that a new version exists and
 * would serve its cached shell forever.
 *
 * So the check is tied to the app becoming visible instead, and `updateViaCache`
 * keeps the HTTP cache from answering it with the worker we already have. The
 * worker itself claims the page as soon as it activates, but the running page
 * keeps the code it booted with - only a reload picks the new one up.
 *
 * Reloading is safe here precisely because the check runs on the way in: any
 * reload it causes lands a moment after the app is opened, never under someone
 * a page and a half into reading.
 */
export function keepFresh(): void {
  if (!('serviceWorker' in navigator)) return

  // A first install claims this page too, but there is nothing stale to replace.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    window.location.reload()
  })

  navigator.serviceWorker
    .register('./sw.js', { scope: './', updateViaCache: 'none' })
    .then((registration) => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update()
      })
    })
    .catch(() => {
      // An app that cannot register still works; it is just not installable.
    })
}
