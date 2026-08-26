import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode } from 'react'
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
import {
  failNextFor,
  holdPage,
  releasePage,
  reframe,
  republish,
  requestedPages,
  stopFailing,
  takeOffAir,
} from './test/server'

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

const container = () => screen.getByRole('main')
const track = () => document.querySelector('.swipe-track') as HTMLElement
const sheets = () => [...document.querySelectorAll<HTMLElement>('.swipe-sheet')]

/** The shape every finger in these tests has: one touch, the primary one. */
const finger = {
  bubbles: true,
  cancelable: true,
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
}

/**
 * One pointer event, on a clock the test chooses. `timeStamp` is read-only on
 * the constructor, and the flick rule is nothing but timestamps.
 */
const fire = (
  target: EventTarget,
  type: string,
  clientX: number,
  clientY: number,
  timeStamp?: number,
) => {
  const event = new PointerEvent(type, { ...finger, clientX, clientY })
  if (timeStamp !== undefined) Object.defineProperty(event, 'timeStamp', { value: timeStamp })
  target.dispatchEvent(event)
}

/** happy-dom runs no transitions, so the snap only ever ends by hand. */
const snapEnds = () => track()?.dispatchEvent(new Event('transitionend'))

/** Long enough for anything the app was going to do on its own to have run. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 50))

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
    // The snap the lift starts is where the page change happens, and happy-dom
    // runs no transitions, so its end is dispatched here too.
    document.querySelector('.swipe-track')?.dispatchEvent(new Event('transitionend'))
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

    // The same page, swept sideways: proves the gesture was live here all
    // along, and that the drag above was turned down for leaning too much.
    swipeFrom(container(), 500, 600, 380, 600)

    await currentPage('332')
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

describe('svepet följer fingret', () => {
  /** No layout in happy-dom: the damping ceiling needs a width from somewhere. */
  const trackIs = (width: number) =>
    Object.defineProperty(track(), 'clientWidth', { value: width, configurable: true })

  const realMatchMedia = window.matchMedia
  const realWidth = window.innerWidth

  afterEach(() => {
    window.matchMedia = realMatchMedia
    Object.defineProperty(window, 'innerWidth', { value: realWidth, configurable: true })
  })

  const asksForLessMotion = () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia
  }

  // R20
  it('håller en enda sida i dokumentet när ingen drar i den', async () => {
    openOn('104')
    await drawnFrames(1)

    expect(sheets()).toHaveLength(1)
  })

  // R20
  it('håller en enda sida även när den har fjorton delsidor', async () => {
    openOn('331')
    await drawnFrames(14, 10000)

    expect(sheets()).toHaveLength(1)
  })

  // R20, AE6
  it('påstår inte att den hämtar en granne på en färdig sida', async () => {
    openOn('104')
    await drawnFrames(1)

    expect(screen.queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  // R20
  it('monterar grannarna vid låsningen och plockar bort dem när gesten är slut', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    expect(sheets()).toHaveLength(1)

    // Slow: a thousand milliseconds of travel is no flick, so this one cancels
    // and the gesture ends without a page change to confuse the count.
    fire(container(), 'pointermove', 480, 300, 1000)
    await waitFor(() => expect(sheets()).toHaveLength(3))

    fire(container(), 'pointerup', 480, 300, 1000)
    snapEnds()

    await waitFor(() => expect(sheets()).toHaveLength(1))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R21
  it('ritar den aktuella sidan först och lämnar grannarna utanför', async () => {
    // 104 has a neighbour on each side, so the sheet that comes first is a
    // decision rather than the only candidate.
    openOn('104')
    await drawnFrames(1)
    giveTheFrameALayout()

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 480, 300, 1000)
    await waitFor(() => expect(sheets()).toHaveLength(3))

    const [current, ...neighbours] = sheets()
    expect(current).toHaveAttribute('data-page', '104')
    expect(current).not.toHaveAttribute('inert')
    for (const sheet of neighbours) expect(sheet).toHaveAttribute('inert')
    // The hotspot tests stub the first .hotspots in the document; it has to be
    // the page the reader is looking at.
    expect(current).toContainElement(document.querySelector('.hotspots'))
  })

  // R16
  it('monterar ingen granne när rörelse är bortvald', async () => {
    asksForLessMotion()
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)

    await settled()
    expect(sheets()).toHaveLength(1)
    expect(track().style.transform).toBe('')
  })

  // R16
  it('byter ändå sida utan att flytta arket när rörelse är bortvald', async () => {
    asksForLessMotion()
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)

    // No snap to end: the page changes at the lift, exactly as it did before
    // the track existed.
    await currentPage('105')
    expect(track().style.transform).toBe('')
  })

  // R1
  it('flyttar arket exakt lika långt som fingret', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 460, 300, 50)

    expect(track().style.transform).toBe('translate3d(-40px, 0, 0)')
  })

  // R5
  it('dämpar rörelsen där sidorna tar slut', async () => {
    openOn('100')
    await drawnFrames(1)
    trackIs(390)

    // 100 is the first page, so this drag has nowhere to go: 0.42 of the
    // finger's travel, well under the 62px sixth of the track.
    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 600, 300, 50)

    expect(track().style.transform).toBe('translate3d(42px, 0, 0)')
  })

  // R15
  it('rör inte arket sedan gesten låst sig lodrätt', async () => {
    openOn('331')
    await drawnFrames(14, 10000)

    fire(container(), 'pointerdown', 500, 600, 0)
    fire(container(), 'pointermove', 480, 200, 50)
    // Sideways after the lock is still a scroll: the axis is decided once.
    fire(container(), 'pointermove', 300, 200, 100)

    expect(track().style.transform).toBe('')
    await settled()
    expect(sheets()).toHaveLength(1)
  })

  // R14
  it('rör inte arket när greppet börjar i kantremsan', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true })
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 20, 300, 0)
    fire(container(), 'pointermove', 200, 300, 50)

    expect(track().style.transform).toBe('')
  })

  // R8, R9
  it('låter arket ligga kvar ute tills den nya sidan har renderats', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)

    const out = 'translate3d(calc(-100% - 14px), 0, 0)'
    expect(track().style.transition).toBe('transform 260ms cubic-bezier(.32,.94,.28,1)')
    expect(track().style.transform).toBe(out)

    // The transition ending starts the page change; it does not move the sheet.
    // The hash is applied a frame later, and a reset here would paint the
    // outgoing page back at centre in between.
    snapEnds()
    expect(track().style.transform).toBe(out)

    await currentPage('105')
    expect(track().style.transform).toBe('')
    expect(track().style.transition).toBe('')
  })

  // R9
  it('lämnar över det aktuella facket till grannens egen ruta', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    await waitFor(() => expect(sheets()).toHaveLength(3))
    const incoming = sheets().find((sheet) => sheet.dataset.page === '105')

    fire(container(), 'pointerup', 380, 300, 50)
    snapEnds()
    await currentPage('105')

    // The very node the reader watched slide in, not a fresh one drawn over
    // the page they just left.
    expect(sheets()[0]).toBe(incoming)
  })

  // R8
  it('fjädrar tillbaka till mitten när gesten inte räcker till', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 480, 300, 1000)
    fire(container(), 'pointerup', 480, 300, 1000)

    expect(track().style.transition).toBe('transform 300ms cubic-bezier(.22,1,.36,1)')
    expect(track().style.transform).toBe('translate3d(0px, 0, 0)')

    snapEnds()
    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R17
  it('låter ett nytt grepp ta över fjädringen och överge sidbytet', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)
    expect(track().style.transition).not.toBe('')

    fire(container(), 'pointerdown', 500, 300, 100)
    expect(track().style.transition).toBe('')

    fire(container(), 'pointermove', 490, 300, 1100)
    expect(track().style.transform).toBe('translate3d(-10px, 0, 0)')

    fire(container(), 'pointerup', 490, 300, 1100)
    snapEnds()

    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  /**
   * Clearing a running transition is what fires transitioncancel, so the grab
   * provokes the very event that would undo it.
   */
  // R17
  it('överlever avbrottet som greppet självt utlöser', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)

    fire(container(), 'pointerdown', 500, 300, 100)
    fire(container(), 'pointermove', 470, 300, 1100)
    await waitFor(() => expect(sheets()).toHaveLength(3))

    track().dispatchEvent(new Event('transitioncancel'))
    await settled()

    // The grab still owns the track, and the page change it abandoned stays
    // abandoned.
    expect(track().style.transform).toBe('translate3d(-30px, 0, 0)')
    expect(sheets()).toHaveLength(3)
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  /**
   * The hash lands a frame or more after the commit, so a quick reader can
   * already be dragging again when the page finally changes underneath.
   */
  // R9, R17
  it('låter inte det försenade sidbytet rycka undan nästa gest', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)
    snapEnds()

    // Down and moving before the new page has rendered.
    fire(container(), 'pointerdown', 500, 300, 100)
    fire(container(), 'pointermove', 460, 300, 1100)

    await currentPage('105')

    expect(track().style.transform).toBe('translate3d(-40px, 0, 0)')
    expect(sheets()).toHaveLength(3)
  })

  // R14
  it('lämnar inte arket stående när ett andra finger avbryter mitt i draget', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 440, 300, 50)
    await waitFor(() => expect(sheets()).toHaveLength(3))
    expect(track().style.transform).toBe('translate3d(-60px, 0, 0)')

    // A real second finger is a different pointer, and never the primary one.
    container().dispatchEvent(
      new PointerEvent('pointerdown', {
        ...finger,
        pointerId: 2,
        isPrimary: false,
        clientX: 300,
        clientY: 300,
      }),
    )

    // It aborts the gesture, which means springing the sheet back - not just
    // forgetting the finger and leaving it where it stopped.
    expect(track().style.transition).toBe('transform 300ms cubic-bezier(.22,1,.36,1)')
    expect(track().style.transform).toBe('translate3d(0px, 0, 0)')
    snapEnds()
    await waitFor(() => expect(sheets()).toHaveLength(1))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R14
  it('fjädrar tillbaka när webbläsaren tar gesten', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    // On the window: a cancel arrives wherever the pointer was captured, which
    // is not necessarily inside .content.
    fire(window, 'pointercancel', 380, 300, 50)

    expect(track().style.transition).toBe('transform 300ms cubic-bezier(.22,1,.36,1)')
    expect(track().style.transform).toBe('translate3d(0px, 0, 0)')

    snapEnds()
    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R14
  it('avslutar gesten när fingret lyfts utanför sidan', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    // The finger left over the bar, so .content never sees the lift and the
    // sheet would be parked off centre for good.
    fire(window, 'pointerup', 380, 300, 50)
    snapEnds()

    await currentPage('105')
  })

  // R14
  it('avslutar gesten en enda gång, hur många kopior av lyftet som än kommer', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    // The browser took the gesture, and the lift that follows is the same one
    // twice over - the element's copy and the window's. Neither may resurrect
    // a gesture that has already been given up.
    fire(container(), 'pointercancel', 380, 300, 50)
    fire(window, 'pointerup', 380, 300, 50)
    snapEnds()

    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R14
  it('fjädrar tillbaka när fönstret tappar fokus mitt i gesten', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    window.dispatchEvent(new Event('blur'))

    expect(track().style.transform).toBe('translate3d(0px, 0, 0)')

    snapEnds()
    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  // R7
  it('byter sida på en kort snärt', async () => {
    openOn('104')
    await drawnFrames(1)

    // Thirty pixels in twenty-four milliseconds: nowhere near the 60px the slow
    // rule wants, but well past 0.5px/ms.
    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 490, 300, 8)
    fire(container(), 'pointermove', 480, 300, 16)
    fire(container(), 'pointermove', 470, 300, 24)
    fire(container(), 'pointerup', 470, 300, 24)
    snapEnds()

    await currentPage('105')
  })

  // R7
  it('byter inte sida när samma sträcka dras långsamt', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 490, 300, 200)
    fire(container(), 'pointermove', 480, 300, 400)
    fire(container(), 'pointermove', 470, 300, 600)
    fire(container(), 'pointerup', 470, 300, 600)
    snapEnds()

    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })
})


describe('fliken göms mitt i fjädringen', () => {
  /**
   * happy-dom derives nothing: the state has to be planted and the event
   * dispatched by hand.
   */
  const hide = () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  afterEach(() => {
    // Back to the prototype's own 'visible', which the tests elsewhere in this
    // file dispatch a bare visibilitychange against.
    Reflect.deleteProperty(document, 'visibilityState')
  })

  const commitSwipe = () => {
    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 380, 300, 50)
    fire(container(), 'pointerup', 380, 300, 50)
  }

  it('slutför sidbytet som fjädringen bar på', async () => {
    openOn('104')
    await drawnFrames(1)

    commitSwipe()
    expect(track().style.transition).not.toBe('')

    // A hidden tab may deliver neither transitionend nor transitioncancel, so
    // the commit would sit queued for ever and the sheet stay parked.
    hide()

    await currentPage('105')
    expect(track().style.transform).toBe('')
    expect(track().style.transition).toBe('')
  })

  it('låter en sen övergång inte röra arket innan den nya sidan har renderats', async () => {
    openOn('104')
    await drawnFrames(1)

    commitSwipe()
    const out = 'translate3d(calc(-100% - 14px), 0, 0)'
    hide()

    // The transition the browser withheld can still arrive, and the sheet is
    // held out on purpose until the hash lands.
    snapEnds()
    expect(track().style.transform).toBe(out)
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')

    await currentPage('105')
  })

  it('fjädrar tillbaka fingret som fortfarande ligger kvar', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 440, 300, 50)
    await waitFor(() => expect(sheets()).toHaveLength(3))

    hide()

    expect(track().style.transform).toBe('')
    expect(track().style.transition).toBe('')
    await waitFor(() => expect(sheets()).toHaveLength(1))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  it('städar undan en fjädring som inte bar på något sidbyte', async () => {
    openOn('104')
    await drawnFrames(1)

    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 480, 300, 1000)
    fire(container(), 'pointerup', 480, 300, 1000)
    expect(track().style.transition).toBe('transform 300ms cubic-bezier(.22,1,.36,1)')

    hide()

    expect(track().style.transform).toBe('')
    expect(track().style.transition).toBe('')
    await settled()
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })

  it('gör ingenting när ingenting är i rörelse', async () => {
    openOn('104')
    await drawnFrames(1)

    hide()

    await settled()
    expect(track().style.transform).toBe('')
    expect(sheets()).toHaveLength(1)
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('104')
  })
})

describe('grannarna vid sidan om', () => {
  const sheetFor = (pageNumber: string) =>
    sheets().find((sheet) => sheet.dataset.page === pageNumber)!

  /** Every gesture here runs straight down the middle of the content. */
  const drag = (type: string, clientX: number, timeStamp: number) =>
    fire(container(), type, clientX, 300, timeStamp)

  /** Holds the finger out past the axis lock, so the neighbours are on screen. */
  const dragOut = async (dx: number) => {
    drag('pointerdown', 500, 0)
    // A thousand milliseconds of travel is no flick: the lift below cancels.
    drag('pointermove', 500 + dx, 1000)
    await waitFor(() => expect(sheets()).toHaveLength(3))
  }

  const letGo = async () => {
    drag('pointerup', 480, 1000)
    snapEnds()
    await waitFor(() => expect(sheets()).toHaveLength(1))
  }

  /** A flick, all the way through the swap. */
  const swipe = (dx: number) => {
    drag('pointerdown', 500, 0)
    drag('pointermove', 500 + dx, 50)
    drag('pointerup', 500 + dx, 50)
    snapEnds()
  }

  const settled = () => new Promise((resolve) => setTimeout(resolve, 50))

  // R11
  it('hämtar båda grannarna när sidan har landat', async () => {
    openOn('104')
    await drawnFrames(1)

    await waitFor(() => expect(requestedPages()).toHaveLength(3))
    await settled()
    expect([...requestedPages()].sort()).toEqual(['102', '104', '105'])
  })

  // R11
  it('hämtar bara den granne som finns när sidan är den första', async () => {
    openOn('100')
    await drawnFrames(1)

    // 100 has nothing before it, so there is one neighbour to fetch, not two.
    await settled()
    expect([...requestedPages()].sort()).toEqual(['100', '101'])
  })

  // R11
  it('målar en granne som redan ligger i lagringen utan att hämta den', async () => {
    const { unmount } = openOn('104')
    await drawnFrames(1)
    await settled()
    unmount()

    // 104 was stored as the page the reader read; now it is 105's neighbour.
    const before = requestedPages().length
    openOn('105')
    await drawnFrames(1)
    await settled()

    expect(requestedPages().slice(before)).not.toContain('104')
    await dragOut(20)
    expect(within(sheetFor('104')).queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  // R10
  it('visar sidnumret och Hämtar… för en granne den ännu inte känner', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)

    await dragOut(-20)
    expect(within(sheetFor('105')).getByText('105')).toBeInTheDocument()
    expect(within(sheetFor('105')).getByText('Hämtar…')).toBeInTheDocument()

    releasePage('105')

    await waitFor(() => expect(within(sheetFor('105')).getAllByRole('group')).toHaveLength(1))
    expect(within(sheetFor('105')).queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  // R10
  it('visar sidan man just lämnade som föregående ark, inte Hämtar…', async () => {
    openOn('104')
    await drawnFrames(1)
    swipe(-120)
    await currentPage('105')
    await drawnFrames(1)

    await dragOut(20)
    expect(within(sheetFor('104')).queryByText('Hämtar…')).not.toBeInTheDocument()
    expect(within(sheetFor('104')).getAllByRole('group')).toHaveLength(1)
  })

  // R11
  it('hämtar en sida till framåt efter ett byte, inte åt båda hållen', async () => {
    openOn('104')
    await drawnFrames(1)
    await waitFor(() => expect(requestedPages()).toHaveLength(3))
    const before = requestedPages().length

    swipe(-120)
    await currentPage('105')
    await drawnFrames(1)
    await settled()

    // Only the page beyond. 105 arrived with the prefetch seconds ago, so the
    // commit paints it from the store instead of asking again; and 103, two
    // deep the other way, is not asked for either - 104's payload is the only
    // thing that names it.
    expect(requestedPages().slice(before).sort()).toEqual(['106'])
  })

  // R11
  it('hämtar inte om grannen man kom ifrån när man sveper tillbaka', async () => {
    openOn('104')
    await drawnFrames(1)
    swipe(-120)
    await currentPage('105')
    await drawnFrames(1)
    await settled()

    const before = requestedPages().length
    swipe(120)
    await currentPage('104')
    await drawnFrames(1)
    await settled()

    expect(requestedPages().slice(before)).not.toContain('104')
    expect(requestedPages().slice(before)).not.toContain('105')
  })

  // R19
  it('behåller inte en granne som inte gick att hämta', async () => {
    failNextFor('105')
    openOn('104')
    await drawnFrames(1)
    await waitFor(() => expect(requestedPages()).toContain('105'))
    await settled()

    await dragOut(-20)
    expect(within(sheetFor('105')).getByText('Hämtar…')).toBeInTheDocument()
    await letGo()

    // Committing onto it is an ordinary load, so the failure surfaces as the
    // page's own error rather than as a sheet stuck on "Hämtar…".
    swipe(-120)
    expect(await screen.findByText('Kunde inte hämta sidan')).toBeInTheDocument()
  })

  // R12, R13
  it('behåller pilarna och låter sig svepas medan nästa sida hämtas', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)
    expect(screen.getByLabelText('Föregående sida')).toBeEnabled()
    expect(screen.getByLabelText('Nästa sida')).toBeEnabled()

    swipe(-120)
    await currentPage('105')

    expect(screen.getAllByText('Hämtar…').length).toBeGreaterThan(0)
    // The pair has rotated onto 105: behind it lies 104, and what lies ahead
    // is not known until 105 itself lands.
    expect(screen.getByLabelText('Föregående sida')).toBeEnabled()
    expect(screen.getByLabelText('Nästa sida')).toHaveAttribute('aria-disabled', 'true')

    // And the gesture does not wait for the page: back is 104, the page the
    // reader just came from.
    swipe(120)
    await currentPage('104')
  })

  it('lämnar pilen framåt otillgänglig men fokuserbar medan sidan hämtas', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)

    swipe(-120)
    await currentPage('105')

    const back = screen.getByLabelText('Föregående sida')
    const ahead = screen.getByLabelText('Nästa sida')
    expect(back).toBeEnabled()
    expect(back).not.toHaveAttribute('aria-disabled')
    // Unavailable without `disabled`, so the arrow stays reachable by tab even
    // while it has nowhere to go.
    expect(ahead).toBeEnabled()
    expect(ahead).toHaveAttribute('aria-disabled', 'true')

    releasePage('105')
    await drawnFrames(1)
    await waitFor(() =>
      expect(screen.getByLabelText('Nästa sida')).not.toHaveAttribute('aria-disabled'),
    )
  })

  it('tappar inte fokus när pilen i listen bär in i en hämtning', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)

    const ahead = screen.getByLabelText('Nästa sida')
    ahead.focus()
    ahead.click()
    await currentPage('105')

    // The arrow it was pressed with is now the one without a target. A browser
    // drops focus from a button that turns `disabled` - happy-dom does not, so
    // what pins the behaviour is the attribute the arrow must not grow.
    const focused = document.activeElement as HTMLElement
    expect(focused).toBe(screen.getByLabelText('Nästa sida'))
    expect(focused).not.toBeDisabled()
    expect(focused).toHaveAttribute('aria-disabled', 'true')
  })

  it('vrider inte grannparet när man går till en sida det inte nämner', async () => {
    holdPage('130')
    openOn('104')
    await drawnFrames(1)

    // A hotspot on 104 leads to 130, which is neither 102 nor 105.
    const layer = giveTheFrameALayout()
    tapAt(layer, 500, 136)
    await currentPage('130')

    // Nothing rotates: 104's own neighbours are still what the arrows carry,
    // and both of them still lead somewhere.
    const back = screen.getByLabelText('Föregående sida')
    expect(back).toBeEnabled()
    expect(back).not.toHaveAttribute('aria-disabled')
    const ahead = screen.getByLabelText('Nästa sida')
    expect(ahead).toBeEnabled()
    expect(ahead).not.toHaveAttribute('aria-disabled')

    back.click()
    await currentPage('102')
  })

  it('vrider grannparet till sidan man backar till', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)

    swipe(-120)
    await currentPage('105')

    window.history.back()
    await currentPage('104')

    // Back on 104 the pair is 104's own again, so both arrows lead somewhere.
    await waitFor(() =>
      expect(screen.getByLabelText('Nästa sida')).not.toHaveAttribute('aria-disabled'),
    )
    expect(screen.getByLabelText('Föregående sida')).toBeEnabled()
  })

  // StrictMode monterar om, och en prefetch som landar efteråt måste
  // fortfarande få måla grannens ark: flaggan som släpper igenom svaret
  // beväpnas om vid montering, inte bara vid nedmontering.
  it('målar grannen även när appen har monterats om två gånger', async () => {
    holdPage('105')
    window.location.hash = '104'
    render(<App />, { wrapper: StrictMode })
    await drawnFrames(1)

    releasePage('105')
    await dragOut(-20)

    await waitFor(() => expect(within(sheetFor('105')).getAllByRole('group')).toHaveLength(1))
    expect(within(sheetFor('105')).queryByText('Hämtar…')).not.toBeInTheDocument()
  })

  /**
   * While 105 loads, the rotated pair gives it a page behind and none ahead,
   * so a forward drag has nothing to commit to.
   */
  // R13
  it('sveper inte till sidan man redan står på', async () => {
    holdPage('105')
    openOn('104')
    await drawnFrames(1)

    swipe(-120)
    await currentPage('105')

    drag('pointerdown', 500, 0)
    drag('pointermove', 380, 50)
    drag('pointerup', 380, 50)

    // With no page ahead the drag is damped rather than tracked, and the lift
    // has nothing to commit to. The snap has nowhere to travel, so it finishes
    // itself: the track ends centred with 105 still the page on screen.
    expect(track().style.transform).toBe('')
    snapEnds()
    await waitFor(() => expect(sheets()).toHaveLength(1))
    expect(screen.getByLabelText('Aktuell sida')).toHaveTextContent('105')
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

  /** A flick, all the way through the swap. */
  const swipe = (dx: number) => {
    fire(container(), 'pointerdown', 500, 300, 0)
    fire(container(), 'pointermove', 500 + dx, 300, 50)
    fire(container(), 'pointerup', 500 + dx, 300, 50)
    snapEnds()
  }

  /** Moves a page's stored timestamp back past the revalidation window. */
  const age = (pageNumber: string) => {
    const index = JSON.parse(window.localStorage.getItem('texttv:fetched') ?? '{}')
    index[pageNumber] = Date.now() - 5 * 60 * 1000
    window.localStorage.setItem('texttv:fetched', JSON.stringify(index))
  }

  /** Opens 104 and waits for the prefetch to have put 105 in the store. */
  const withNeighbourFetched = async () => {
    openOn('104')
    await drawnFrames(1)
    await waitFor(() => expect(requestedPages()).toContain('105'))
    await settled()
  }

  it('hämtar inte om grannen som förhämtningen nyss lade i lagringen', async () => {
    await withNeighbourFetched()
    const before = requestedPages().length

    swipe(-120)
    await currentPage('105')
    await drawnFrames(1)
    await settled()

    expect(requestedPages().slice(before)).not.toContain('105')
    // Kept as it stands, not repainted while something revalidates it.
    expect(screen.getByText(/^Uppdaterad \d\d:\d\d$/)).toBeInTheDocument()
    expect(screen.queryByText('Cachad · uppdaterar…')).not.toBeInTheDocument()
  })

  it('hämtar om grannen vars kopia hunnit bli gammal', async () => {
    await withNeighbourFetched()
    age('105')
    const before = requestedPages().length

    holdPage('105')
    swipe(-120)
    await currentPage('105')

    expect(await screen.findByText('Cachad · uppdaterar…')).toBeInTheDocument()
    releasePage('105')
    await waitFor(() =>
      expect(screen.queryByText('Cachad · uppdaterar…')).not.toBeInTheDocument(),
    )
    expect(requestedPages().slice(before)).toContain('105')
  })

  it('hämtar vid varje tryck på Försök igen, trots en färsk tidsstämpel', async () => {
    // Fresh by the index, so only the reload counter can force the fetch.
    window.localStorage.setItem('texttv:fetched', JSON.stringify({ '104': Date.now() }))
    const asked = () => requestedPages().filter((page) => page === '104').length
    failNextFor('104')
    openOn('104')
    await screen.findByText('Kunde inte hämta sidan')
    expect(asked()).toBe(1)

    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    await waitFor(() => expect(asked()).toBe(2))

    stopFailing('104')
    await userEvent.click(screen.getByRole('button', { name: 'Försök igen' }))
    await waitFor(() => expect(asked()).toBe(3))
    await drawnFrames(1)
  })

  it('hämtar vid en ny start i StrictMode trots en färsk kopia i lagringen', async () => {
    const first = '2026-08-22T08:00:00.000Z'
    const second = '2026-08-22T09:30:00.000Z'
    republish('100', first)
    const { unmount } = openOn('100')
    await screen.findByText(shownAs(first))
    await settled()
    unmount()

    // StrictMode's mount-cleanup-mount discards the first pass's answer, so
    // only a fetch on the second pass can put the republished copy on screen.
    republish('100', second)
    window.location.hash = '100'
    render(<App />, { wrapper: StrictMode })

    expect(await screen.findByText(shownAs(second))).toBeInTheDocument()
  })

  it('hämtar en sida vars tidsstämpel är färsk men vars kopia är borta', async () => {
    // The index can outlive the page it describes: a write too big to store
    // leaves the timestamp behind. Reading it alone would paint nothing.
    window.localStorage.setItem('texttv:fetched', JSON.stringify({ '377': Date.now() }))
    openOn('100')
    await drawnFrames(1)

    await userEvent.click(
      within(screen.getByLabelText('Genvägar')).getByRole('button', { name: '377 MÅLSERVICE' }),
    )

    await currentPage('377')
    await waitFor(() => expect(frames()[0]).toHaveTextContent('377 SVT Text'))
  })

  it('hämtar om en sida som lästes ur lagringen när fliken kommer tillbaka', async () => {
    await withNeighbourFetched()
    swipe(-120)
    await currentPage('105')
    await drawnFrames(1)
    await settled()

    // The load that was skipped must not have left itself marked in flight,
    // or the guard below would swallow the revalidation.
    const before = requestedPages().length
    age('105')
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(() => expect(requestedPages().slice(before)).toContain('105'))
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

  // R18
  it('offrar ingen lagrad sida för en granne appen hämtar i förväg', async () => {
    // 104 is 105's neighbour and the only page here the app fetches on its own.
    const pages = ['101', '102', '103', '106', '107', '108', '109', '110']
    const { attempted, entries } = useFullStore(cached(pages))
    openOn('105')

    await drawnFrames(1)
    await waitFor(() => expect(attempted).toContain('texttv:page:104'))
    await new Promise((resolve) => setTimeout(resolve, 50))

    // Three evictions is the whole budget of the page the reader asked for.
    // The prefetch gets none of it and gives up instead.
    const survivors = pages.filter((p) => entries.has(`texttv:page:${p}`))
    expect(survivors).toHaveLength(pages.length - 3)
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
