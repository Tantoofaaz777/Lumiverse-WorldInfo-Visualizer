import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { setup } from '../src/frontend'

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
  const ctx = {
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
    dom: { addStyle: (css: string) => {
      const style = window.document.createElement('style')
      style.textContent = css
      window.document.head.append(style)
      return () => style.remove()
    } },
    ui: { createFloatWidget: () => ({
      root, widgetId: 'test-widget',
      getPosition: () => position,
      moveTo: (x: number, y: number) => { position = { x, y } },
      setVisible: (value: boolean) => { visibility = value },
      destroy: () => { destroyed++; root.remove() },
    }) },
  } as unknown as SpindleFrontendContext
  cleanup = setup(ctx)
})

afterEach(() => { cleanup?.(); cleanup = undefined; window.close() })

describe('frontend behavior with a Spindle host double', () => {
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
    expect([...events.values()].every(listeners => listeners.size === 0)).toBe(true)
    expect(window.document.querySelector('style')).toBeNull()
    expect(root.children).toHaveLength(0)
  })
})
