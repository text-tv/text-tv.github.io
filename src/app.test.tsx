import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { failNextFor, stopFailing } from './test/server'

const openOn = (pageNumber?: string) => {
  if (pageNumber) window.location.hash = pageNumber
  return render(<App />)
}

const currentPage = async (pageNumber: string) =>
  waitFor(() => expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent(pageNumber))

/** Frames carry the page's altText, which starts with its number. */
const frames = () => screen.getAllByRole('img')

describe('läsa en sida', () => {
  it('visar sida 100 med dess bild', async () => {
    openOn('100')
    await currentPage('100')
    await waitFor(() => expect(frames()).toHaveLength(1))
    expect(frames()[0]).toHaveAttribute('src', expect.stringContaining('data:image/gif;base64,'))
  })

  // AE5
  it('staplar alla 14 delsidor på sida 331 utan att växla mellan dem', async () => {
    openOn('331')
    await waitFor(() => expect(frames()).toHaveLength(14), { timeout: 5000 })
    const first = frames()[0].getAttribute('src')
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(frames()).toHaveLength(14)
    expect(frames()[0]).toHaveAttribute('src', first)
  })

  it('nämner att innehållet kommer från SVT Text', async () => {
    openOn('100')
    expect(await screen.findByText('Innehåll från SVT Text')).toBeInTheDocument()
  })
})

describe('länkar i bilden', () => {
  // AE1
  it('går till sida 106 när man trycker på den i bilden', async () => {
    openOn('100')
    await waitFor(() => expect(frames()).toHaveLength(1))

    await userEvent.click(screen.getByLabelText('Sida 106'))

    await currentPage('106')
    expect(window.location.hash).toBe('#106')
  })

  // AE2
  it('tar bakåtgesten tillbaka till sidan man kom från', async () => {
    openOn('100')
    await waitFor(() => expect(frames()).toHaveLength(1))
    await userEvent.click(screen.getByLabelText('Sida 106'))
    await currentPage('106')

    window.history.back()

    await currentPage('100')
  })
})

describe('knapparna längst ned', () => {
  // AE3
  it('hoppar över sidnummer som inte sänds när man går framåt', async () => {
    openOn('200')
    await screen.findByText('Sidan ej i sändning')

    await userEvent.click(screen.getByLabelText('Nästa sida'))

    await currentPage('250')
  })

  it('släcker pilen när sidan saknar granne åt det hållet', async () => {
    openOn('100')
    await waitFor(() => expect(frames()).toHaveLength(1))
    // Page 100 is the first page: no previous, but 101 follows.
    expect(screen.getByLabelText('Föregående sida')).toBeDisabled()
    expect(screen.getByLabelText('Nästa sida')).toBeEnabled()
  })

  it('går till sida 100 med hemknappen', async () => {
    openOn('377')
    await currentPage('377')

    await userEvent.click(screen.getByLabelText('Startsida 100'))

    await currentPage('100')
  })

  // AE4
  it('går till sidan så snart tredje siffran är skriven', async () => {
    openOn('100')
    await currentPage('100')

    await userEvent.type(screen.getByLabelText('Gå till sida'), '331')

    await currentPage('331')
  })

  it('gör ingenting förrän tredje siffran', async () => {
    openOn('100')
    await currentPage('100')

    await userEvent.type(screen.getByLabelText('Gå till sida'), '33')

    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('100')
  })

  it('erbjuder ett numeriskt tangentbord', async () => {
    openOn('100')
    const input = screen.getByLabelText('Gå till sida')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('maxlength', '3')
  })
})

describe('sidor som inte går att visa', () => {
  // AE6
  it('säger "Sidan ej i sändning" och erbjuder grannarna', async () => {
    openOn('200')

    expect(await screen.findByText('Sidan ej i sändning')).toBeInTheDocument()
    const actions = screen.getByText('Sidan ej i sändning').parentElement!
    expect(within(actions).getByRole('button', { name: 'Sida 139' })).toBeInTheDocument()
    expect(within(actions).getByRole('button', { name: 'Sida 250' })).toBeInTheDocument()
  })

  // AE7
  it('skiljer ett nätverksfel från en sida som inte sänds, och går att försöka igen', async () => {
    failNextFor('104')
    openOn('104')

    expect(await screen.findByText('Kunde inte hämta sidan')).toBeInTheDocument()
    expect(screen.queryByText('Sidan ej i sändning')).not.toBeInTheDocument()

    stopFailing('104')
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))

    await waitFor(() => expect(frames()).toHaveLength(1))
    expect(screen.queryByText('Kunde inte hämta sidan')).not.toBeInTheDocument()
  })
})

describe('färskhet och cache', () => {
  // AE9
  it('visar den cachade bilden direkt och märker den som cachad', async () => {
    const { unmount } = openOn('100')
    await waitFor(() => expect(frames()).toHaveLength(1))
    unmount()

    // Offline: only the cached copy can produce a frame.
    failNextFor('100')
    openOn('100')

    expect(frames()).toHaveLength(1)
    expect(screen.getByText('Cachad · uppdaterar…')).toBeInTheDocument()
  })

  it('behåller den cachade sidan när nätet är nere', async () => {
    const { unmount } = openOn('377')
    await waitFor(() => expect(frames()).toHaveLength(1))
    unmount()

    failNextFor('377')
    openOn('377')

    await waitFor(() =>
      expect(screen.getByText(/^Uppdaterad /)).toBeInTheDocument(),
    )
    expect(frames()).toHaveLength(1)
    expect(screen.queryByText('Kunde inte hämta sidan')).not.toBeInTheDocument()
  })

  it('säger när innehållet uppdaterades', async () => {
    openOn('100')
    expect(await screen.findByText(/^Uppdaterad \d\d:\d\d$/)).toBeInTheDocument()
  })
})

describe('var appen börjar', () => {
  // AE8
  it('återgår till sidan man läste om det var mindre än en timme sedan', async () => {
    window.localStorage.setItem(
      'texttv:last',
      JSON.stringify({ pageNumber: '377', at: Date.now() - 10 * 60 * 1000 }),
    )
    openOn()

    await currentPage('377')
  })

  it('börjar på 100 om det var längre sedan än en timme', async () => {
    window.localStorage.setItem(
      'texttv:last',
      JSON.stringify({ pageNumber: '377', at: Date.now() - 2 * 60 * 60 * 1000 }),
    )
    openOn()

    await currentPage('100')
  })

  it('hämtar alltid om den återställda sidan, aldrig bara från lagringen', async () => {
    const { unmount } = openOn('377')
    await waitFor(() => expect(frames()).toHaveLength(1))
    unmount()

    // A stored copy exists, but a fresh fetch must still happen.
    failNextFor('377')
    openOn('377')
    await waitFor(() => expect(screen.getByText('Cachad · uppdaterar…')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Cachad · uppdaterar…')).not.toBeInTheDocument())
  })
})
