import type { SpindleFrontendContext, SpindleFloatWidgetOptions } from 'lumiverse-spindle-types'
import type { setup as setupFrontend } from '../src/frontend'

// Load the shipped bundle rather than embedding a second copy of the source.
const bundleUrl = '/frontend.js'
const { setup } = await import(bundleUrl) as { setup: typeof setupFrontend }

const listeners = new Map<string, Set<(value: unknown) => void>>()
const chatListeners = new Set<(value: unknown) => void>()
let chatId: string | null = 'preview-chat'
let generation = 0
const entries = [
  { id: 'town', comment: 'The city of Larkspur', bookId: 'places', bookName: 'Places & history', source: 'keyword' },
  { id: 'guild', comment: 'The astronomers’ guild', bookId: 'people', bookName: 'Characters', source: 'keyword' },
  { id: 'inn', comment: 'The Lantern Inn', bookId: 'places', bookName: 'Places & history', source: 'vector' },
  { id: 'mira', comment: 'Mira — keeper of the observatory', bookId: 'people', bookName: 'Characters', source: 'vector' },
  { id: 'same', comment: 'The Lantern Inn', bookId: 'people', bookName: 'Characters', source: 'keyword' },
  { id: 'long', comment: 'A long entry name remains fully visible, wrapping onto another line without losing its original punctuation or capitalization.', bookId: 'places', bookName: 'Places & history', source: 'keyword' },
]

function emit(name: string, payload: unknown) {
  for (const handler of listeners.get(name) ?? []) handler(payload)
}
function switchChat(value: string | null) {
  chatId = value
  for (const handler of chatListeners) handler({ chatId })
  document.querySelector('#chat-label')!.textContent = value ? 'Larkspur · Preview chat' : 'Home · No active chat'
}
function generate(rows: unknown[]) {
  if (!chatId) switchChat('preview-chat')
  const generationId = `preview-generation-${++generation}`
  emit('GENERATION_STARTED', { chatId, generationId })
  // Intentionally omit the activation event for empty generations, like the
  // inspected host. Exercise the real frontend's zero-entry fallback.
  if (rows.length) emit('WORLD_INFO_ACTIVATED', { chatId, entries: rows })
  emit('STREAM_TOKEN_RECEIVED', { chatId, generationId, token: 'Hello' })
  emit('GENERATION_ENDED', { chatId, generationId, content: 'Hello' })
}

const ctx = {
  getActiveChat: () => ({ chatId, characterId: null }),
  state: {
    get: () => {
      if (new URLSearchParams(location.search).get('state') === 'unwired') {
        throw new Error('PERMISSION_DENIED:spindle_authority_map_unwired — chat.active')
      }
      return { chatId }
    },
    subscribe: (_selector: string, handler: (value: unknown) => void) => {
      chatListeners.add(handler)
      return () => { chatListeners.delete(handler) }
    },
  },
  events: { on: (name: string, handler: (value: unknown) => void) => {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name)!.add(handler)
    return () => { listeners.get(name)!.delete(handler) }
  } },
  worldBooks: { entries: async (bookId: string) => entries.filter(entry => entry.bookId === bookId)
    .map(entry => ({ id: entry.id, constant: entry.id === 'guild' || entry.id === 'town' })) },
  dom: { addStyle: (css: string) => {
    const style = document.createElement('style')
    style.textContent = css
    document.head.append(style)
    return () => style.remove()
  } },
  ui: {
    geometry: {
      getUiScale: () => 1,
      toLayoutPx: (value: number) => value,
      layoutViewportSize: () => ({ width: innerWidth, height: innerHeight }),
      layoutElementRect: (element: Element) => {
        const { x, y, width, height } = element.getBoundingClientRect()
        return { x, y, width, height }
      },
    },
    createFloatWidget: (options: SpindleFloatWidgetOptions) => {
      const container = document.createElement('div')
      container.className = 'preview-float'
      const root = document.createElement('div')
      let position = options.initialPosition ?? { x: 20, y: innerHeight - 76 }
      try {
        const saved = JSON.parse(localStorage.getItem('wiv-preview-position') ?? 'null')
        if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) position = saved
      } catch { /* Optional preview preferences. */ }
      const moveTo = (x: number, y: number) => {
        position = { x: Math.max(12, Math.min(x, innerWidth - 64)), y: Math.max(12, Math.min(y, innerHeight - 64)) }
        Object.assign(container.style, { left: `${position.x}px`, top: `${position.y}px` })
        localStorage.setItem('wiv-preview-position', JSON.stringify(position))
      }
      moveTo(position.x, position.y)
      const resize = () => moveTo(position.x, position.y)
      window.addEventListener('resize', resize)
      container.append(root)
      document.body.append(container)
      return {
        root, widgetId: 'preview-globe', getPosition: () => position, moveTo,
        setVisible: (visible: boolean) => { container.hidden = !visible },
        destroy: () => { window.removeEventListener('resize', resize); container.remove() },
      }
    },
  },
} as unknown as SpindleFrontendContext

let cleanup = setup(ctx)
document.querySelector('#active')!.addEventListener('click', () => generate(entries))
document.querySelector('#empty')!.addEventListener('click', () => generate([]))
document.querySelector('#new-chat')!.addEventListener('click', () => switchChat(`preview-chat-${Date.now()}`))
document.querySelector('#home')!.addEventListener('click', () => switchChat(null))
document.querySelector('#theme')!.addEventListener('click', () => {
  const light = document.body.classList.toggle('light')
  document.documentElement.setAttribute('data-theme-mode', light ? 'light' : 'dark')
})
document.querySelector('#restart')!.addEventListener('click', () => { cleanup(); cleanup = setup(ctx) })
const scene = new URLSearchParams(location.search).get('scene')
if (scene === 'active') generate(entries)
if (scene === 'empty') generate([])
if (scene === 'home') switchChat(null)
if (scene === 'long') generate(Array.from({ length: 70 }, (_, index) => ({ ...entries[index % entries.length], id: `long-${index}` })))
if (new URLSearchParams(location.search).get('theme') === 'light') document.body.classList.add('light')
document.documentElement.setAttribute('data-theme-mode', document.body.classList.contains('light') ? 'light' : 'dark')
