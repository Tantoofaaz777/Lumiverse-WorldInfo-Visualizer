import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import type { SpindleFrontendContext, SpindleRangeSliderOptions, SpindleSelectOptions } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'
import { GLOBE_SIZE_KEY } from '../src/size-settings'
import { ICON_PLACEMENT_KEY } from '../src/placement-settings'

let window: Window
let cleanup: (() => void) | undefined
let chatId: string | null
let chatListeners: Set<(payload: unknown) => void>
let events: Map<string, Set<(payload: unknown) => void>>
let position: { x: number; y: number }
let visibility: boolean
let destroyed: number
let root: HTMLElement
let fetchBookEntries: (bookId: string) => Promise<readonly unknown[]>
let hostContext: SpindleFrontendContext
let dimensions: { width: number; height: number }
let settingsRoot: HTMLElement
let sliderOptions: SpindleRangeSliderOptions
let sliderDestroyed: number
let settingsListeners: Set<(value: unknown) => void>
let savedSizes: Array<{ key: string; value: unknown }>
let readSize: () => Promise<unknown>
let toolbarRoot: HTMLElement
let selectOptions: SpindleSelectOptions
let selectDestroyed: number
let placementListeners: Set<(value: unknown) => void>
let readPlacement: () => Promise<unknown>
let popupRoot: HTMLElement | undefined
let popupPosition: { x: number; y: number }
let popupDimensions: { width: number; height: number }
let popupVisible: boolean
let popupDestroyed: number

function emit(event: string, payload: unknown) {
  for (const listener of events.get(event) ?? []) listener(payload)
}
function chat(next: string | null) {
  chatId = next
  for (const listener of chatListeners) listener({ chatId })
}
const entries = [
  { id: 'b', comment: 'Shared name', bookId: 'book-b', bookName: 'Lorebook B' },
  { id: 'a', comment: '  Exact <name> ★  ', bookId: 'book-a', bookName: 'Lorebook A' },
  { id: 'a-2', comment: 'Shared name', bookId: 'book-a', bookName: 'Lorebook A' },
]

beforeEach(() => {
  window = new Window({ width: 900, height: 650 })
  Object.assign(globalThis, {
    window, document: window.document, HTMLElement: window.HTMLElement,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  })
  root = window.document.createElement('div') as unknown as HTMLElement
  window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
  chatId = 'chat-a'
  chatListeners = new Set()
  events = new Map()
  position = { x: 20, y: 574 }
  visibility = true
  destroyed = 0
  fetchBookEntries = async () => []
  dimensions = { width: 52, height: 52 }
  settingsRoot = window.document.createElement('div') as unknown as HTMLElement
  window.document.body.append(settingsRoot as unknown as Parameters<typeof window.document.body.append>[0])
  sliderDestroyed = 0
  settingsListeners = new Set()
  savedSizes = []
  readSize = async () => undefined
  toolbarRoot = document.createElement('div')
  document.body.append(toolbarRoot)
  selectDestroyed = 0
  placementListeners = new Set()
  readPlacement = async () => undefined
  popupRoot = undefined
  popupPosition = { x: 0, y: 0 }
  popupDimensions = { width: 340, height: 120 }
  popupVisible = false
  popupDestroyed = 0
  const ctx = {
    getActiveChat: () => ({ chatId, characterId: null }),
    state: {
      get: () => ({ chatId }),
      subscribe: (_selector: string, listener: (payload: unknown) => void) => {
        chatListeners.add(listener)
        return () => { chatListeners.delete(listener) }
      },
    },
    events: { on: (name: string, listener: (payload: unknown) => void) => {
      if (!events.has(name)) events.set(name, new Set())
      events.get(name)!.add(listener)
      return () => { events.get(name)!.delete(listener) }
    } },
    worldBooks: { entries: (bookId: string) => fetchBookEntries(bookId) },
    settings: {
      get: (key: string) => key === GLOBE_SIZE_KEY ? readSize() : readPlacement(),
      set: async (key: string, value: unknown) => {
        savedSizes.push({ key, value })
        for (const listener of key === GLOBE_SIZE_KEY ? settingsListeners : placementListeners) listener(value)
      },
      watch: (key: string, listener: (value: unknown) => void) => {
        const listeners = key === GLOBE_SIZE_KEY ? settingsListeners : placementListeners
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    components: { mountRangeSlider: (_target: Element, options: SpindleRangeSliderOptions) => {
      sliderOptions = options
      return {
        update: (next: Partial<SpindleRangeSliderOptions>) => { Object.assign(sliderOptions, next) },
        destroy: () => { sliderDestroyed++ },
      }
    }, mountSelect: (_target: Element, options: SpindleSelectOptions) => {
      selectOptions = options
      return {
        update: (next: Partial<SpindleSelectOptions>) => { Object.assign(selectOptions, next) },
        destroy: () => { selectDestroyed++ },
      }
    } },
    dom: { addStyle: (css: string) => {
      const style = window.document.createElement('style')
      style.textContent = css
      window.document.head.append(style)
      return () => style.remove()
    } },
    ui: { mount: (point: string) => {
      if (point === 'chat_top_dock') return toolbarRoot
      expect(point).toBe('settings_extensions')
      settingsRoot.replaceChildren()
      return settingsRoot
    }, geometry: {
      layoutViewportSize: () => ({ width: 900, height: 650 }),
      toLayoutPx: (value: number) => value,
      layoutElementRect: (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      },
    }, createFloatWidget: (options: { persistGeometry?: string | false }) => {
      if (options.persistGeometry === false) {
        popupRoot = document.createElement('div')
        document.body.append(popupRoot)
        const popupElement = popupRoot
        return {
          root: popupElement, widgetId: 'test-popup',
          getPosition: () => popupPosition,
          moveTo: (x: number, y: number) => { popupPosition = { x, y } },
          setSize: (width: number, height: number) => { popupDimensions = { width, height } },
          setVisible: (value: boolean) => { popupVisible = value },
          destroy: () => { popupDestroyed++; popupElement.remove() },
        }
      }
      return {
      root, widgetId: 'test-widget',
      getPosition: () => position,
      moveTo: (x: number, y: number) => { position = { x, y } },
      setSize: (width: number, height: number) => { dimensions = { width, height } },
      setVisible: (value: boolean) => { visibility = value },
      destroy: () => { destroyed++; root.remove() },
    } } },
  } as unknown as SpindleFrontendContext
  hostContext = ctx
  cleanup = setup(ctx)
})

afterEach(() => { cleanup?.(); cleanup = undefined; window.close() })

describe('frontend behavior with a Spindle host double', () => {
  test('placement switches preserve the snapshot, floating size and saved position', async () => {
    await Bun.sleep(1)
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    sliderOptions.onCommit!(36)
    position = { x: 120, y: 450 }
    const button = root.querySelector('button') as HTMLButtonElement
    const panel = root.querySelector('.wiv-panel') as HTMLElement
    button.click()
    expect(selectOptions.options?.map(option => option.label)).toEqual(['Floating', 'Top bar'])
    selectOptions.onChange!('top_bar')
    expect(toolbarRoot.querySelector('button')).toBe(button)
    expect(panel.hidden).toBe(true)
    expect(button.title).not.toContain('drag')
    expect(visibility).toBe(false)
    expect(sliderOptions.disabled).toBe(true)
    expect(button.querySelector('.wiv-badge')!.textContent).toBe('3')
    selectOptions.onChange!('floating')
    expect(root.querySelector('button')).toBe(button)
    expect(visibility).toBe(true)
    expect(toolbarRoot.hidden).toBe(true)
    expect(sliderOptions.disabled).toBe(false)
    expect(dimensions.width).toBe(36)
    expect(position).toEqual({ x: 120, y: 450 })
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(3)
    await Bun.sleep(1)
    expect(savedSizes.filter(row => row.key === ICON_PLACEMENT_KEY).map(row => row.value)).toEqual(['top_bar', 'floating'])
  })
  test('top-bar popup uses a separate surface below the anchor and remains within the viewport', async () => {
    await Bun.sleep(1)
    selectOptions.onChange!('top_bar')
    const button = toolbarRoot.querySelector('button') as HTMLButtonElement
    const panel = root.querySelector('.wiv-panel') as HTMLElement
    button.getBoundingClientRect = () => new window.DOMRect(850, 20, 28, 28) as unknown as DOMRect
    panel.getBoundingClientRect = () => new window.DOMRect(0, 0, 340, 300) as unknown as DOMRect
    const floatingPosition = { ...position }
    button.click()
    await Bun.sleep(30)
    expect(popupVisible).toBe(true)
    expect(popupRoot!.querySelector('.wiv-panel')).toBe(panel)
    expect(popupPosition).toEqual({ x: 548, y: 60 })
    expect(popupDimensions).toEqual({ width: 340, height: 300 })
    expect(position).toEqual(floatingPosition)
    button.getBoundingClientRect = () => new window.DOMRect(100, 600, 28, 28) as unknown as DOMRect
    window.dispatchEvent(new window.Event('resize'))
    await Bun.sleep(30)
    expect(popupPosition).toEqual({ x: 100, y: 288 })
    panel.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }) as unknown as Event)
    expect(panel.hidden).toBe(false)
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(popupVisible).toBe(false)
    expect(window.document.activeElement).toBe(button as unknown as typeof window.document.activeElement)
    button.click()
    document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }) as unknown as Event)
    expect(panel.hidden).toBe(true)
    expect(popupVisible).toBe(false)
  })
  test('top-bar buttons cannot drag and continue receiving generation and chat changes', async () => {
    await Bun.sleep(1)
    selectOptions.onChange!('top_bar')
    const button = toolbarRoot.querySelector('button') as HTMLButtonElement
    const previousPosition = { ...position }
    button.dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 40, clientY: 30, bubbles: true }) as unknown as Event)
    button.dispatchEvent(new window.PointerEvent('pointermove', { pointerId: 1, clientX: 180, clientY: 180, bubbles: true }) as unknown as Event)
    button.dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1, bubbles: true }) as unknown as Event)
    expect(position).toEqual(previousPosition)
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    expect(button.querySelector('.wiv-badge')!.textContent).toBe('3')
    button.click()
    chat('chat-b')
    expect(popupVisible).toBe(false)
    expect(popupRoot!.querySelectorAll('.wiv-entry')).toHaveLength(0)
    expect((button.querySelector('.wiv-badge') as HTMLElement).hidden).toBe(true)
    chat(null)
    expect(toolbarRoot.hidden).toBe(true)
    expect(visibility).toBe(false)
    chat('chat-c')
    expect(toolbarRoot.hidden).toBe(false)
    expect(visibility).toBe(false)
  })
  test('saved placement restores independently of size and invalid values fall back to Floating', async () => {
    cleanup!()
    document.body.append(root)
    readSize = async () => 40
    readPlacement = async () => 'top_bar'
    cleanup = setup(hostContext)
    await Bun.sleep(1)
    expect(toolbarRoot.querySelector('.wiv-trigger')).not.toBeNull()
    expect(dimensions.width).toBe(40)
    expect(selectOptions.value).toBe('top_bar')
    expect(sliderOptions.disabled).toBe(true)
    for (const listener of placementListeners) listener('invalid')
    expect(visibility).toBe(true)
    expect(selectOptions.value).toBe('floating')
    expect(dimensions.width).toBe(40)
  })
  test('a late placement read cannot undo a choice and teardown removes both surfaces', async () => {
    cleanup!()
    document.body.append(root)
    let resolveRead!: (value: unknown) => void
    readPlacement = () => new Promise(resolve => { resolveRead = resolve })
    cleanup = setup(hostContext)
    selectOptions.onChange!('top_bar')
    resolveRead('floating')
    await Bun.sleep(1)
    expect(selectOptions.value).toBe('top_bar')
    ;(toolbarRoot.querySelector('button') as HTMLButtonElement).click()
    cleanup!()
    cleanup!()
    expect(popupDestroyed).toBe(1)
    expect(toolbarRoot.children).toHaveLength(0)
    expect(popupRoot!.children).toHaveLength(0)
    expect(placementListeners.size).toBe(0)
    const savedCount = savedSizes.length
    selectOptions.onChange!('floating')
    await Bun.sleep(1)
    expect(savedSizes).toHaveLength(savedCount)
  })
  test('host remounts keep the top-bar button and a detached anchor closes the popup', async () => {
    await Bun.sleep(1)
    selectOptions.onChange!('top_bar')
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    const button = toolbarRoot.querySelector('button') as HTMLButtonElement
    button.click()
    toolbarRoot.remove()
    await Bun.sleep(30)
    expect(popupVisible).toBe(false)
    document.body.append(toolbarRoot)
    expect(button.querySelector('.wiv-badge')!.textContent).toBe('3')
    button.click()
    expect(popupVisible).toBe(true)
  })
  test('native slider resizes live and saves only on commit', async () => {
    await Bun.sleep(1)
    expect(sliderOptions.min).toBe(32)
    expect(sliderOptions.max).toBe(52)
    expect(sliderOptions.label).toBe('Floating icon size')
    sliderOptions.onDragValue!(32)
    expect(dimensions).toEqual({ width: 32, height: 32 })
    expect(root.style.getPropertyValue('--wiv-globe-size')).toBe('16px')
    expect(savedSizes).toHaveLength(0)
    sliderOptions.onCommit!(32)
    await Bun.sleep(1)
    expect(savedSizes).toEqual([{ key: GLOBE_SIZE_KEY, value: 32 }])
    sliderOptions.onDragValue!(44)
    sliderOptions.onDragValue!(null)
    expect(dimensions.width).toBe(32)
  })
  test('restores saved size and clamps remote changes while keeping the globe onscreen', async () => {
    cleanup!()
    window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
    readSize = async () => 40
    cleanup = setup(hostContext)
    await Bun.sleep(1)
    expect(dimensions.width).toBe(40)
    expect(sliderOptions.value).toBe(40)
    position = { x: 880, y: 640 }
    for (const listener of settingsListeners) listener(500)
    expect(dimensions.width).toBe(52)
    expect(position).toEqual({ x: 836, y: 586 })
    for (const listener of settingsListeners) listener(1)
    expect(dimensions.width).toBe(32)
    for (const listener of settingsListeners) listener('broken')
    expect(dimensions.width).toBe(52)
  })
  test('a late settings read cannot undo a user change or touch a destroyed widget', async () => {
    cleanup!()
    window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
    let resolveRead!: (value: unknown) => void
    readSize = () => new Promise(resolve => { resolveRead = resolve })
    cleanup = setup(hostContext)
    sliderOptions.onCommit!(36)
    resolveRead(48)
    await Bun.sleep(1)
    expect(dimensions.width).toBe(36)
    cleanup!()
    const savedCount = savedSizes.length
    sliderOptions.onCommit!(52)
    expect(savedSizes).toHaveLength(savedCount)
    expect(settingsListeners.size).toBe(0)
    expect(settingsRoot.children).toHaveLength(0)
  })
  test('queued saves preserve the last committed size', async () => {
    await Bun.sleep(1)
    let release!: () => void
    const firstWrite = new Promise<void>(resolve => { release = resolve })
    hostContext.settings!.set = async (_key, value) => {
      savedSizes.push({ key: GLOBE_SIZE_KEY, value })
      if (value === 32) await firstWrite
    }
    sliderOptions.onCommit!(32)
    sliderOptions.onCommit!(44)
    await Bun.sleep(1)
    expect(savedSizes.map(row => row.value)).toEqual([32])
    release()
    await Bun.sleep(1)
    expect(savedSizes.map(row => row.value)).toEqual([32, 44])
    expect(dimensions.width).toBe(44)
  })
  test('an unwired selector authority map falls back to the shipped active-chat API', async () => {
    cleanup!()
    window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
    hostContext.state!.get = () => { throw new Error('PERMISSION_DENIED:spindle_authority_map_unwired — chat.active requires the spindle_authority_map_unwired permission') }
    cleanup = setup(hostContext)
    expect(visibility).toBe(true)
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    ;(root.querySelector('button') as HTMLButtonElement).click()
    chatId = 'chat-b'
    await Bun.sleep(300)
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(0)
    expect((root.querySelector('.wiv-panel') as HTMLElement).hidden).toBe(true)
    chatId = null
    await Bun.sleep(300)
    expect(visibility).toBe(false)
    cleanup!()
    chatId = 'chat-c'
    await Bun.sleep(300)
    expect(visibility).toBe(false)
  })
  test('fallback synchronizes the chat before a generation event or globe click', () => {
    cleanup!()
    window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
    hostContext.state = undefined
    cleanup = setup(hostContext)
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    chatId = 'chat-b'
    emit('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries })
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(0)
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(3)
    chatId = 'chat-c'
    ;(root.querySelector('button') as HTMLButtonElement).click()
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(0)
  })
  test('an actual permission denial still stops setup and cleans up', () => {
    cleanup!()
    window.document.body.append(root as unknown as Parameters<typeof window.document.body.append>[0])
    hostContext.state!.get = () => { throw new Error('PERMISSION_DENIED:chats') }
    expect(() => setup(hostContext)).toThrow('PERMISSION_DENIED:chats')
    expect(root.children).toHaveLength(0)
    expect(window.document.querySelector('style')).toBeNull()
  })
  test('distinct icons and English tooltips preserve the original entry names', () => {
    emit('WORLD_INFO_ACTIVATED', { chatId, entries: entries.map((entry, index) => ({ ...entry, activationType: ['constant', 'keyword', 'vector'][index] })) })
    const rows = [...root.querySelectorAll('.wiv-entry')]
    expect(rows.map(row => row.querySelector('.wiv-entry-icon')!.getAttribute('aria-label'))).toEqual(['Keyword', 'Vector', 'Always active'])
    expect(root.querySelectorAll('.wiv-type-constant')).toHaveLength(1)
    expect(root.querySelectorAll('.wiv-type-keyword')).toHaveLength(1)
    expect(root.querySelectorAll('.wiv-type-vector')).toHaveLength(1)
    expect(rows.map(row => row.querySelector('.wiv-entry-name')!.textContent)).toEqual(['  Exact <name> ★  ', 'Shared name', 'Shared name'])
  })
  test('sticky uses a neutral clock instead of the constant pin', () => {
    emit('WORLD_INFO_ACTIVATED', { chatId, entries: [{ ...entries[0], activationType: 'sticky', constant: true }] })
    expect(root.querySelectorAll('.wiv-type-constant')).toHaveLength(0)
    expect(root.querySelector('.wiv-type-sticky')!.getAttribute('title')).toBe('Sticky — retained from an earlier generation')
  })
  test('legacy keyword-source payload resolves constants without changing the count', async () => {
    const calls: string[] = []
    fetchBookEntries = async bookId => { calls.push(bookId); return entries.map(entry => ({ id: entry.id, constant: entry.id === 'a' })) }
    emit('WORLD_INFO_ACTIVATED', { chatId, entries: entries.map(entry => ({ ...entry, source: 'keyword' })) })
    await Bun.sleep(1)
    expect(calls.sort()).toEqual(['book-a', 'book-b'])
    expect(root.querySelectorAll('.wiv-type-constant')).toHaveLength(1)
    expect(root.querySelectorAll('.wiv-type-keyword')).toHaveLength(2)
    expect(root.querySelector('.wiv-badge')!.textContent).toBe('3')
  })
  test('late metadata cannot repopulate a zero-entry result or another chat', async () => {
    for (const action of ['zero', 'switch']) {
      let resolveLookup!: (rows: readonly unknown[]) => void
      fetchBookEntries = () => new Promise(resolve => { resolveLookup = resolve })
      emit('WORLD_INFO_ACTIVATED', { chatId, entries: [{ ...entries[0], source: 'keyword' }] })
      if (action === 'zero') emit('WORLD_INFO_ACTIVATED', { chatId, entries: [] })
      else chat('chat-b')
      resolveLookup([{ id: 'b', constant: true }])
      await Bun.sleep(1)
      expect(root.querySelectorAll('.wiv-entry')).toHaveLength(0)
      expect((root.querySelector('.wiv-badge') as HTMLElement).hidden).toBe(true)
    }
  })
  test('metadata failure keeps an unknown icon rather than mislabeling a constant', async () => {
    fetchBookEntries = async () => { throw new Error('Permission or network failure') }
    emit('WORLD_INFO_ACTIVATED', { chatId, entries: [{ ...entries[0], source: 'keyword' }] })
    await Bun.sleep(1)
    expect(root.querySelectorAll('.wiv-type-keyword')).toHaveLength(0)
    expect(root.querySelector('.wiv-type-unknown')!.getAttribute('title')).toBe('Activation type unavailable')
  })
  test('shows a globe without a number and a literal question mark initially', () => {
    expect(root.querySelector('.wiv-icon circle')).not.toBeNull()
    expect((root.querySelector('.wiv-badge') as HTMLElement).hidden).toBe(true)
    expect(root.querySelector('.wiv-empty')!.textContent).toBe('?')
    expect(root.lang).toBe('en')
  })
  test('shows total count and exact titles safely, grouped in the requested order', () => {
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    expect(root.querySelector('.wiv-badge')!.textContent).toBe('3')
    expect([...root.querySelectorAll('.wiv-book')].map(node => node.textContent)).toEqual(['Lorebook A', 'Lorebook B'])
    expect([...root.querySelectorAll('.wiv-entry')].map(node => node.textContent)).toEqual(['  Exact <name> ★  ', 'Shared name', 'Shared name'])
    expect(root.querySelector('.wiv-entry name')).toBeNull()
  })
  test('toggle, outside pointer and Escape close the panel', () => {
    const button = root.querySelector('button') as HTMLButtonElement
    const panel = root.querySelector('.wiv-panel') as HTMLElement
    button.click()
    expect(panel.hidden).toBe(false)
    button.click()
    expect(panel.hidden).toBe(true)
    button.click()
    window.document.body.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }))
    expect(panel.hidden).toBe(true)
    button.click()
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(panel.hidden).toBe(true)
    expect(window.document.activeElement).toBe(button as unknown as typeof window.document.activeElement)
  })
  test('positions below a globe near the top using the host geometry shape', () => {
    const button = root.querySelector('button') as HTMLButtonElement
    const panel = root.querySelector('.wiv-panel') as HTMLElement
    button.getBoundingClientRect = () => new window.DOMRect(20, 20, 52, 52) as unknown as DOMRect
    panel.getBoundingClientRect = () => new window.DOMRect(0, 0, 340, 300) as unknown as DOMRect
    button.click()
    expect(panel.style.top).toBe('64px')
    expect(panel.style.left).toBe('0px')
  })
  test('zero entries clear a stale badge without recalculating lorebook activation', () => {
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    emit('GENERATION_STARTED', { chatId, generationId: 'g' })
    emit('STREAM_TOKEN_RECEIVED', { chatId, generationId: 'g', token: 'Hello' })
    expect((root.querySelector('.wiv-badge') as HTMLElement).hidden).toBe(true)
    expect(root.querySelector('.wiv-empty')!.textContent).toBe('?')
  })
  test('switching chat closes and clears the list; home hides the widget', () => {
    emit('WORLD_INFO_ACTIVATED', { chatId, entries })
    ;(root.querySelector('button') as HTMLButtonElement).click()
    chat('chat-b')
    expect((root.querySelector('.wiv-panel') as HTMLElement).hidden).toBe(true)
    expect(root.querySelectorAll('.wiv-entry')).toHaveLength(0)
    chat(null)
    expect(visibility).toBe(false)
    chat('chat-c')
    expect(visibility).toBe(true)
  })
  test('dragging moves the host widget and suppresses the subsequent pointer click', () => {
    const button = root.querySelector('button')!
    button.dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, button: 0, clientX: 40, clientY: 590, bubbles: true }) as unknown as Event)
    button.dispatchEvent(new window.PointerEvent('pointermove', { pointerId: 1, clientX: 180, clientY: 450, bubbles: true, cancelable: true }) as unknown as Event)
    button.dispatchEvent(new window.PointerEvent('pointerup', { pointerId: 1, bubbles: true }) as unknown as Event)
    button.dispatchEvent(new window.MouseEvent('click', { bubbles: true, detail: 1 }) as unknown as Event)
    expect(position).toEqual({ x: 160, y: 434 })
    expect((root.querySelector('.wiv-panel') as HTMLElement).hidden).toBe(true)
  })
  test('panel interactions do not propagate to the host drag handler', () => {
    let parentDrags = 0
    window.document.body.addEventListener('pointerdown', () => { parentDrags++ })
    root.querySelector('.wiv-panel')!.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }) as unknown as Event)
    expect(parentDrags).toBe(0)
  })
  test('teardown removes UI, CSS and subscriptions, and is idempotent', () => {
    cleanup!()
    cleanup!()
    expect(destroyed).toBe(1)
    expect(chatListeners.size).toBe(0)
    expect(sliderDestroyed).toBe(1)
    expect(settingsListeners.size).toBe(0)
    expect([...events.values()].every(listeners => listeners.size === 0)).toBe(true)
    expect(window.document.querySelector('style')).toBeNull()
    expect(root.children).toHaveLength(0)
  })
})
