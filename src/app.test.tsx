import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './App'
import { resetDecodeCache } from './teletext/decode'
import {
  addThreeColourCell,
  addUnknownCell,
  addUnseenCell,
  breakFrameDecoding,
  heldFrames,
  holdFrameDecoding,
  releaseFrameDecoding,
  releaseNewestFrame,
} from './test/canvas'
import { failNextFor, reframe, republish, stopFailing, takeOffAir } from './test/server'

/** The same clock format the freshness bar renders. */
const shownAs = (iso: string) =>
  `Uppdaterad ${new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`

const openOn = (pageNumber?: string) => {
  if (pageNumber) window.location.hash = pageNumber
  return render(<App />)
}

const currentPage = async (pageNumber: string) =>
  waitFor(() => expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent(pageNumber))

/** Every frame box on screen, in whichever of its three states it is. */
const frames = () => screen.getAllByRole('group')

/** The frames that have decoded and drawn themselves as text. */
const textFrames = () => [...document.querySelectorAll('.text-frame')]

/**
 * Waits for `count` frames to be on screen *and* decoded, so what follows runs
 * against the text rendering rather than the undecided pending box.
 */
const drawnFrames = async (count: number, timeout?: number) => {
  await waitFor(
    () => {
      expect(frames()).toHaveLength(count)
      expect(textFrames()).toHaveLength(count)
    },
    { timeout },
  )
  return frames()
}

/**
 * The frame is 520x400. happy-dom has no layout, so the hotspot layer is
 * given a real rect; without one the capture handler bails out and the
 * click falls through to whichever button the DOM happens to hit, which is
 * exactly the resolution this test exists to pin.
 */
const giveTheFrameALayout = (scale = 1) => {
  const layer = document.querySelector('.hotspots') as HTMLElement
  layer.getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, width: 520 * scale, height: 400 * scale }) as DOMRect
  return layer
}

const tapAt = (layer: HTMLElement, clientX: number, clientY: number) => {
  layer.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX, clientY }),
  )
}

describe('läsa en sida', () => {
  it('visar sida 100 som riktig text, inte som bild', async () => {
    openOn('100')
    await currentPage('100')
    await drawnFrames(1)

    // The headline is nowhere in the markup until the GIF has been decoded and
    // its cells resolved, so this can only pass on the text path.
    expect(frames()[0]).toHaveTextContent('Angrep elever med svärd - flicka dödad')
    expect(screen.queryAllByRole('img')).toHaveLength(0)
  })

  // R7
  it('ritar den dubbelhöga rubriken som en enda rad', async () => {
    openOn('100')
    await drawnFrames(1)

    const doubles = [...document.querySelectorAll('.text-frame__row--double')]
    expect(doubles.map((row) => row.textContent?.trim())).toContain(
      'Nya dödliga ryska attacker mot Ukraina',
    )
  })

  // R10
  it('faller tillbaka på bilden när rutan inte går att avkoda', async () => {
    breakFrameDecoding()
    openOn('105')
    await currentPage('105')

    const gif = await screen.findByRole('img')
    expect(gif).toHaveAttribute('src', expect.stringContaining('data:image/gif;base64,'))
    expect(textFrames()).toHaveLength(0)
  })

  // R10
  it('faller tillbaka på bilden när en cell har tre färger', async () => {
    addThreeColourCell()
    openOn('105')
    await currentPage('105')

    // One cell is enough: the model only holds if every cell has two colours,
    // so the whole frame is left to the image.
    expect(await screen.findByRole('img')).toHaveAttribute('alt', expect.stringContaining('SVT'))
    expect(textFrames()).toHaveLength(0)
  })

  // R6
  it('klipper ut rutan ur bilden för en cell den inte känner igen', async () => {
    addUnknownCell()
    openOn('105')
    await drawnFrames(1)

    // The rest of the page is still text; only the one cell falls back.
    const slices = [...document.querySelectorAll('.text-frame__slice')]
    expect(slices).toHaveLength(1)
    expect((slices[0] as HTMLElement).style.backgroundImage).toContain('data:image/gif;base64,')
  })

  it('läser ett tecken tabellen saknar ur sidans egen alt-text', async () => {
    addUnseenCell()
    openOn('100')
    await drawnFrames(1)

    // The damaged cell is the first one the page draws - the '1' of '100' on
    // the header row. Its mask is unknown, but the row still lines up with the
    // alt text, so the character is named there rather than cut out of the GIF.
    expect(document.querySelectorAll('.text-frame__slice')).toHaveLength(0)
    expect(frames()[0]).toHaveTextContent('100 SVT Text')
  })

  it('ritar inte en överspelad delsida under den nya rutan', async () => {
    const { unmount } = openOn('100')
    await drawnFrames(1)
    unmount()

    // SVT has rolled the page over: same sub-page, a new frame.
    reframe('100', '377')
    // A new session, so the cached frame is decoded again rather than served
    // from the decode cache.
    resetDecodeCache()
    holdFrameDecoding()
    openOn('100')

    // The cached frame decodes, and the refetched one right after it.
    await waitFor(() => expect(heldFrames()).toBe(2))

    // The new frame answers first; the cached one it replaced answers late.
    releaseNewestFrame()
    await drawnFrames(1)
    expect(frames()[0]).toHaveTextContent('377 SVT Text')

    releaseFrameDecoding()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(frames()[0]).toHaveTextContent('377 SVT Text')
    expect(frames()[0]).not.toHaveTextContent('Angrep elever')
  })

  // AE5
  it('staplar alla 14 delsidor på sida 331 utan att växla mellan dem', async () => {
    openOn('331')
    await drawnFrames(14, 10000)
    const first = textFrames()[0].textContent
    await new Promise((resolve) => setTimeout(resolve, 250))
    expect(frames()).toHaveLength(14)
    expect(textFrames()[0].textContent).toBe(first)
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
    await drawnFrames(1)

    await userEvent.click(screen.getByLabelText('Sida 106'))

    await currentPage('106')
    expect(window.location.hash).toBe('#106')
  })

  it('markerar länken direkt när den trycks', async () => {
    openOn('100')
    await drawnFrames(1)

    await userEvent.click(screen.getByLabelText('Sida 106'))

    expect(document.querySelector('.hotspot-mark--flash')).toBeInTheDocument()
  })

  // AE2
  it('tar bakåtgesten tillbaka till sidan man kom från', async () => {
    openOn('100')
    await drawnFrames(1)
    await userEvent.click(screen.getByLabelText('Sida 106'))
    await currentPage('106')

    window.history.back()

    await currentPage('100')
  })
})

describe('överlappande länkar', () => {
  it('väljer länken närmast fingret, inte den som råkar ligga överst', async () => {
    openOn('100')
    await drawnFrames(1)
    const layer = giveTheFrameALayout()

    // Page 100 prints 106 at y 144-160 and 107 at y 208-224. Expanded to 44px
    // both targets are wide open; the touch below sits nearest 106's centre.
    tapAt(layer, 240, 152)

    await currentPage('106')
  })

  it('väljer den andra länken när fingret ligger närmare den', async () => {
    openOn('100')
    await drawnFrames(1)
    const layer = giveTheFrameALayout()

    tapAt(layer, 266, 216)

    await currentPage('107')
  })

  it('gör ingenting när fingret ligger utanför alla länkar', async () => {
    openOn('100')
    await drawnFrames(1)
    const layer = giveTheFrameALayout()

    tapAt(layer, 10, 380)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('100')
  })

  it('följer bilden när den skalas ned', async () => {
    openOn('100')
    await drawnFrames(1)
    // A phone renders the frame at roughly 0.75x; the same printed reference
    // must still be reachable at the scaled-down coordinates.
    const layer = giveTheFrameALayout(0.75)

    tapAt(layer, 240 * 0.75, 152 * 0.75)

    await currentPage('106')
  })
})

describe('genvägarna ovanför knappraden', () => {
  const shortcuts = () => within(screen.getByLabelText('Genvägar')).getAllByRole('button')

  const shortcut = (name: string) =>
    within(screen.getByLabelText('Genvägar')).getByRole('button', { name })

  it('listar de nio sektionerna SVT själv länkar', async () => {
    openOn('100')
    await currentPage('100')

    expect(shortcuts().map((button) => button.textContent)).toEqual([
      '100 NYHETER',
      '300 SPORT',
      '330 RESULTATBÖRSEN',
      '377 MÅLSERVICE',
      '400 VÄDER',
      '500 BLANDAT',
      '600 PÅ TV',
      '700 INNEHÅLL',
      '800 UR',
    ])
  })

  it('går till sidan när man trycker på en genväg', async () => {
    openOn('100')
    await currentPage('100')

    await userEvent.click(shortcut('377 MÅLSERVICE'))

    await currentPage('377')
    expect(window.location.hash).toBe('#377')
    // The 377 fixture was fetched, not just the hash rewritten: the decoded
    // frame prints its own page number, so 100's frame would not satisfy this.
    await waitFor(() => expect(frames()[0]).toHaveTextContent('377 SVT Text'))
  })

  it('tar bakåtgesten tillbaka från en genväg', async () => {
    openOn('100')
    await currentPage('100')
    await userEvent.click(shortcut('377 MÅLSERVICE'))
    await currentPage('377')

    window.history.back()

    await currentPage('100')
  })

  it('märker ut sidan man redan är på', async () => {
    openOn('100')
    await currentPage('100')

    expect(shortcut('100 NYHETER')).toHaveAttribute('aria-current', 'page')
    expect(shortcut('300 SPORT')).not.toHaveAttribute('aria-current')
  })

  it('flyttar markeringen när man byter sida', async () => {
    openOn('377')
    await currentPage('377')

    expect(shortcut('377 MÅLSERVICE')).toHaveAttribute('aria-current', 'page')
    expect(shortcut('100 NYHETER')).not.toHaveAttribute('aria-current')
  })

  it('visas även för en sida som inte sänds', async () => {
    openOn('200')
    await screen.findByText('Sidan ej i sändning')

    // The rail is the shell's, not the page's: it outlives a result that has
    // no page to belong to. 200 is not one of the nine, so nothing is marked.
    expect(shortcuts()).toHaveLength(9)
    expect(shortcuts().filter((button) => button.hasAttribute('aria-current'))).toEqual([])
  })

  it('visas även när sidan inte gick att hämta', async () => {
    failNextFor('104')
    openOn('104')
    await screen.findByText('Kunde inte hämta sidan')

    expect(shortcuts()).toHaveLength(9)
  })

  it('ligger utanför behållaren som rullar', async () => {
    openOn('100')
    await currentPage('100')

    // A page long enough to scroll must not carry the shortcuts off screen.
    expect(screen.getByRole('main')).not.toContainElement(screen.getByLabelText('Genvägar'))
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
    await drawnFrames(1)
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

describe('svep mellan sidor', () => {
  /**
   * A finger drag, dispatched raw the way `tapAt` dispatches a tap: happy-dom
   * synthesises nothing from a pointer sequence, so every event the gesture
   * needs is spelled out here.
   */
  const swipeFrom = (
    element: Element,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    pointerType = 'touch',
  ) => {
    const shared = { bubbles: true, cancelable: true, pointerId: 1, pointerType, isPrimary: true }
    element.dispatchEvent(
      new PointerEvent('pointerdown', { ...shared, clientX: fromX, clientY: fromY }),
    )
    element.dispatchEvent(
      new PointerEvent('pointermove', { ...shared, clientX: toX, clientY: toY }),
    )
    element.dispatchEvent(new PointerEvent('pointerup', { ...shared, clientX: toX, clientY: toY }))
  }

  const container = () => screen.getByRole('main')

  /** Only the gutter test moves the viewport width; the rest keep happy-dom's. */
  const realWidth = window.innerWidth

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: realWidth, configurable: true })
  })

  // R1
  it('går framåt när fingret dras från höger till vänster', async () => {
    openOn('104')
    await currentPage('104')

    swipeFrom(container(), 500, 300, 380, 300)

    await currentPage('105')
  })

  // R1, R2
  it('går bakåt när fingret dras från vänster till höger', async () => {
    openOn('104')
    await currentPage('104')

    swipeFrom(container(), 500, 300, 620, 300)

    // 102 has no fixture, so the page bar is the proof the navigation happened.
    await currentPage('102')
  })

  // R2
  it('sveper vidare från en sida som inte sänds', async () => {
    openOn('200')
    await screen.findByText('Sidan ej i sändning')

    swipeFrom(container(), 500, 300, 380, 300)

    await currentPage('250')
  })

  // R3
  it('stannar kvar när sidan saknar granne åt det hållet', async () => {
    openOn('100')
    await drawnFrames(1)

    // Page 100 is the first page: nothing precedes it.
    swipeFrom(container(), 500, 300, 620, 300)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('100')
  })

  // R4
  it('tar bakåtgesten tillbaka till sidan man svepte från', async () => {
    openOn('104')
    await currentPage('104')
    swipeFrom(container(), 500, 300, 380, 300)
    await currentPage('105')

    window.history.back()

    await currentPage('104')
  })

  // R5
  it('bryr sig inte om att musen dras åt sidan', async () => {
    openOn('104')
    await currentPage('104')

    swipeFrom(container(), 500, 300, 380, 300, 'mouse')

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R6
  it('avbryter gesten när pekaren tas ifrån appen', async () => {
    openOn('104')
    await currentPage('104')
    const main = container()
    const shared = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    }

    main.dispatchEvent(new PointerEvent('pointerdown', { ...shared, clientX: 500, clientY: 300 }))
    main.dispatchEvent(new PointerEvent('pointermove', { ...shared, clientX: 380, clientY: 300 }))
    main.dispatchEvent(new PointerEvent('pointercancel', { ...shared, clientX: 380, clientY: 300 }))
    main.dispatchEvent(new PointerEvent('pointerup', { ...shared, clientX: 380, clientY: 300 }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R6
  it('avbryter gesten när ett andra finger läggs på', async () => {
    openOn('104')
    await currentPage('104')
    const main = container()
    const first = {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
    }

    main.dispatchEvent(new PointerEvent('pointerdown', { ...first, clientX: 500, clientY: 300 }))
    // A real second finger is a different pointer, and not the primary one.
    main.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: false,
        clientX: 300,
        clientY: 300,
      }),
    )
    main.dispatchEvent(new PointerEvent('pointermove', { ...first, clientX: 380, clientY: 300 }))
    main.dispatchEvent(new PointerEvent('pointerup', { ...first, clientX: 380, clientY: 300 }))

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R7
  it('lämnar kantremsan åt systemets egen bakåtgest', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    openOn('104')
    await currentPage('104')

    swipeFrom(container(), 20, 300, 200, 300)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R8
  it('byter inte sida när fingret mest dras uppåt', async () => {
    openOn('331')
    await drawnFrames(14, 10000)

    swipeFrom(container(), 500, 600, 420, 200)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('331')
  })

  // R9
  it('byter inte sida när svepet sker på genvägsraden', async () => {
    openOn('104')
    await currentPage('104')

    swipeFrom(screen.getByLabelText('Genvägar'), 500, 300, 380, 300)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R10
  it('följer inte länken som svepet råkade sluta över', async () => {
    openOn('100')
    await drawnFrames(1)
    const layer = giveTheFrameALayout()

    // The drag ends on the printed 106, and the browser's follow-up click
    // lands there too - the swipe must swallow it.
    swipeFrom(container(), 340, 152, 240, 152)
    tapAt(layer, 240, 152)

    await currentPage('101')
    expect(screen.getByLabelText('Aktuell sida')).not.toHaveTextContent('106')
  })

  // R10
  it('äter inte en knapptryckning som kommer strax efter svepet', async () => {
    openOn('104')
    await currentPage('104')

    // The swallow is armed for a moment after every swipe. It must let go of
    // anything outside the frame, or the bar stops answering right when the
    // reader reaches for it.
    swipeFrom(container(), 500, 300, 380, 300)
    await currentPage('105')

    await userEvent.click(screen.getByLabelText('Föregående sida'))

    await currentPage('104')
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

  it('säger ifrån när en cachad sida har slutat sändas', async () => {
    const { unmount } = openOn('377')
    await drawnFrames(1)
    unmount()

    // SVT has taken the page off air since it was cached.
    takeOffAir('377', { prev: '376', next: '378' })
    openOn('377')

    expect(await screen.findByText('Sidan ej i sändning')).toBeInTheDocument()
    expect(screen.queryAllByRole('group')).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Sida 376' })).toBeInTheDocument()
  })

  it('glömmer den cachade sidan när den har slutat sändas', async () => {
    const { unmount } = openOn('377')
    await drawnFrames(1)
    unmount()

    takeOffAir('377', { prev: '376', next: '378' })
    const second = openOn('377')
    await screen.findByText('Sidan ej i sändning')
    second.unmount()

    // Nothing left to repaint next time.
    expect(window.localStorage.getItem('texttv:page:377')).toBeNull()
  })

  it('påstår inte att den hämtar när hämtningen är klar', async () => {
    openOn('200')
    await screen.findByText('Sidan ej i sändning')

    expect(screen.queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  it('påstår inte att den hämtar när hämtningen misslyckats', async () => {
    failNextFor('104')
    openOn('104')
    await screen.findByText('Kunde inte hämta sidan')

    expect(screen.queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  // AE7
  it('skiljer ett nätverksfel från en sida som inte sänds, och går att försöka igen', async () => {
    failNextFor('104')
    openOn('104')

    expect(await screen.findByText('Kunde inte hämta sidan')).toBeInTheDocument()
    expect(screen.queryByText('Sidan ej i sändning')).not.toBeInTheDocument()

    stopFailing('104')
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))

    await drawnFrames(1)
    expect(screen.queryByText('Kunde inte hämta sidan')).not.toBeInTheDocument()
  })
})

describe('färskhet och cache', () => {
  // AE9
  it('visar den cachade bilden direkt och märker den som cachad', async () => {
    const { unmount } = openOn('100')
    await drawnFrames(1)
    unmount()

    // Offline: only the cached copy can produce a frame.
    failNextFor('100')
    openOn('100')

    // The cached copy paints its frame on the very first render, before any
    // network answer could have arrived.
    expect(frames()).toHaveLength(1)
    expect(screen.getByText('Cachad · uppdaterar…')).toBeInTheDocument()

    // And it is the cached page, decoded: the failed fetch produced nothing.
    await drawnFrames(1)
    expect(frames()[0]).toHaveTextContent('Angrep elever med svärd - flicka dödad')
  })

  it('behåller den cachade sidan när nätet är nere', async () => {
    const { unmount } = openOn('377')
    await drawnFrames(1)
    unmount()

    failNextFor('377')
    openOn('377')

    await waitFor(() =>
      expect(screen.getByText(/^Uppdaterad /)).toBeInTheDocument(),
    )
    expect(frames()).toHaveLength(1)
    expect(screen.queryByText('Kunde inte hämta sidan')).not.toBeInTheDocument()
  })

  it('hämtar om sidan när appen kommer tillbaka och innehållet hunnit bli gammalt', async () => {
    const first = '2026-08-22T08:00:00.000Z'
    const second = '2026-08-22T09:30:00.000Z'
    republish('100', first)
    openOn('100')
    await screen.findByText(shownAs(first))

    // Age the stored copy past the revalidation window, then come back to a
    // page SVT has republished since.
    const index = JSON.parse(window.localStorage.getItem('texttv:fetched')!)
    index['100'] = Date.now() - 5 * 60 * 1000
    window.localStorage.setItem('texttv:fetched', JSON.stringify(index))
    republish('100', second)

    document.dispatchEvent(new Event('visibilitychange'))

    expect(await screen.findByText(shownAs(second))).toBeInTheDocument()
  })

  it('hämtar inte om sidan när innehållet nyss hämtades', async () => {
    const first = '2026-08-22T08:00:00.000Z'
    republish('100', first)
    openOn('100')
    await screen.findByText(shownAs(first))

    republish('100', '2026-08-22T09:30:00.000Z')
    document.dispatchEvent(new Event('visibilitychange'))

    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(screen.getByText(shownAs(first))).toBeInTheDocument()
  })

  it('säger när innehållet uppdaterades', async () => {
    openOn('100')
    expect(await screen.findByText(/^Uppdaterad \d\d:\d\d$/)).toBeInTheDocument()
  })
})

describe('när lagringen är full', () => {
  /**
   * A stand-in localStorage whose page writes always fail, the way a full one
   * does. happy-dom's own storage is a Proxy that ignores both instance and
   * prototype patching, so the whole object is swapped instead.
   */
  const useFullStore = (seeded: Record<string, string>) => {
    const entries = new Map(Object.entries(seeded))
    const attempted: string[] = []
    const fake: Storage = {
      get length() {
        return entries.size
      },
      key: (index) => [...entries.keys()][index] ?? null,
      getItem: (key) => entries.get(key) ?? null,
      removeItem: (key) => void entries.delete(key),
      clear: () => entries.clear(),
      setItem: (key, value) => {
        attempted.push(key)
        if (key.startsWith('texttv:page:')) throw new DOMException('full', 'QuotaExceededError')
        entries.set(key, String(value))
      },
    }
    realStorage ??= Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { value: fake, configurable: true })
    return { attempted, entries }
  }

  let realStorage: PropertyDescriptor | undefined

  afterEach(() => {
    // Give the rest of the suite happy-dom's real storage back.
    if (realStorage) Object.defineProperty(window, 'localStorage', realStorage)
    realStorage = undefined
  })

  const cached = (pages: string[]) =>
    Object.fromEntries([
      ['texttv:fetched', JSON.stringify(Object.fromEntries(pages.map((p, i) => [p, i + 1])))],
      ...pages.map((p) => [`texttv:page:${p}`, '{"result":{"kind":"page"},"fetchedAt":1}']),
    ])

  it('visar sidan ändå när den inte får plats', async () => {
    const { attempted, entries } = useFullStore({})
    openOn('331')

    await drawnFrames(14, 10000)
    expect(attempted).toContain('texttv:page:331')
    expect(entries.has('texttv:page:331')).toBe(false)
  })

  it('offrar inte hela cachen för en sida som ändå inte får plats', async () => {
    const pages = ['101', '102', '103', '104', '105', '106', '107', '108']
    const { entries } = useFullStore(cached(pages))
    openOn('331')

    await drawnFrames(14, 10000)

    const survivors = pages.filter((p) => entries.has(`texttv:page:${p}`))
    expect(survivors.length).toBeGreaterThanOrEqual(pages.length - 3)
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
    await drawnFrames(1)
    unmount()

    // A stored copy exists, but a fresh fetch must still happen.
    failNextFor('377')
    openOn('377')
    await waitFor(() => expect(screen.getByText('Cachad · uppdaterar…')).toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Cachad · uppdaterar…')).not.toBeInTheDocument())
  })
})

describe('det synliga området', () => {
  /**
   * happy-dom ships no VisualViewport, so the hook gets a stand-in whose
   * height the test can move the way an opening keyboard does.
   */
  const useViewportStub = (height: number) => {
    const stub = Object.assign(new EventTarget(), { width: 390, height, offsetTop: 0 })
    Object.defineProperty(window, 'visualViewport', { value: stub, configurable: true })
    return stub
  }

  const heightProperty = () => document.documentElement.style.getPropertyValue('--viewport-height')

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true })
  })

  it('skriver ut det synliga områdets höjd', async () => {
    useViewportStub(300)
    openOn('100')

    await waitFor(() => expect(heightProperty()).toBe('300px'))
  })

  it('följer med när tangentbordet ändrar höjden', async () => {
    const viewport = useViewportStub(300)
    openOn('100')
    await waitFor(() => expect(heightProperty()).toBe('300px'))

    viewport.height = 700
    viewport.dispatchEvent(new Event('resize'))

    await waitFor(() => expect(heightProperty()).toBe('700px'))
  })

  it('lämnar inga värden kvar när appen stängs', async () => {
    useViewportStub(300)
    const { unmount } = openOn('100')
    await waitFor(() => expect(heightProperty()).toBe('300px'))

    unmount()

    expect(heightProperty()).toBe('')
    expect(document.documentElement.style.getPropertyValue('--viewport-offset')).toBe('')
  })

  // AE2. happy-dom lays nothing out, so this pins the wiring: the shell follows
  // the shrunken viewport and three digits still navigate while it is shrunk.
  it('går till sidan man skriver medan tangentbordet är uppe', async () => {
    const viewport = useViewportStub(800)
    openOn('377')
    await currentPage('377')
    const input = screen.getByLabelText('Gå till sida')

    // The keyboard opens over the lower half.
    await userEvent.click(input)
    viewport.height = 300
    viewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(heightProperty()).toBe('300px'))

    await userEvent.type(input, '100')

    await currentPage('100')
    expect(input).toHaveValue('')

    // The third digit blurs the input; the keyboard goes away with it.
    viewport.height = 800
    viewport.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(heightProperty()).toBe('800px'))
  })

  it('fungerar i en webbläsare utan visualViewport', async () => {
    openOn('100')

    await currentPage('100')
    expect(heightProperty()).toBe('')
  })
})
