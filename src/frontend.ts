import type { SpindleFrontendContext, SpindleFloatWidgetOptions } from 'lumiverse-spindle-types'
import { ActivationModel, entryLabel, groupEntries, entryActivationType, hydrateActivationTypes } from './model'
import { activationIcons } from './icons'
import { styles } from './styles'
import { watchActiveChat } from './active-chat'
import { MAX_GLOBE_SIZE, mountSizeSettings } from './size-settings'

// Lumiverse's native World Info tab uses Lucide Globe (24 × 24, stroke width 2).
const GLOBE = '<svg class="wiv-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>'
const EVENTS = ['WORLD_INFO_ACTIVATED', 'GENERATION_STARTED', 'STREAM_TOKEN_RECEIVED', 'GENERATION_ENDED', 'GENERATION_STOPPED']
const PAD = 12

// Geometry persistence is implemented in the inspected Lumiverse 1.2 host,
// but these two additive options are not yet present in SDK 0.6.31's type.
type FloatOptions = SpindleFloatWidgetOptions & { persistGeometry: string; resizable: false }

export function setup(ctx: SpindleFrontendContext): () => void {
  const model = new ActivationModel()
  const disposers: Array<() => void> = []
  let disposed = false
  let open = false
  let positionFrame = 0
  let syncActiveChat = () => {}
  let size = MAX_GLOBE_SIZE
  const geometry = ctx.ui.geometry
  const viewport = () => geometry?.layoutViewportSize() ?? { width: window.innerWidth, height: window.innerHeight }
  const layoutPx = (value: number) => geometry?.toLayoutPx(value) ?? value
  const rect = (element: Element) => geometry?.layoutElementRect(element) ?? element.getBoundingClientRect()

  const options: FloatOptions = {
    width: size, height: size, chromeless: true, snapToEdge: false, resizable: false,
    persistGeometry: 'world-info-visualizer-globe',
    initialPosition: { x: 20, y: Math.max(PAD, viewport().height - size - 24) },
    tooltip: 'World Info — drag to move',
  }
  const widget = ctx.ui.createFloatWidget(options)
  const root = widget.root
  root.classList.add('wiv-root')
  root.lang = 'en'

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'wiv-trigger'
  button.innerHTML = GLOBE
  button.setAttribute('aria-expanded', 'false')
  const badge = document.createElement('span')
  badge.className = 'wiv-badge'
  badge.setAttribute('aria-hidden', 'true')
  badge.hidden = true
  button.append(badge)

  const panel = document.createElement('section')
  panel.className = 'wiv-panel'
  panel.id = `wiv-panel-${widget.widgetId}`
  panel.hidden = true
  panel.tabIndex = -1
  panel.setAttribute('aria-label', 'Active World Info entries')
  button.setAttribute('aria-controls', panel.id)
  const list = document.createElement('div')
  list.className = 'wiv-list'
  panel.append(list)
  root.append(button, panel)

  function listen(target: EventTarget, event: string, handler: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(event, handler, options)
    disposers.push(() => target.removeEventListener(event, handler, options))
  }

  function positionPanel() {
    if (disposed || !open || !button.isConnected) return
    const view = viewport()
    const anchor = rect(button)
    panel.style.width = `${Math.max(1, Math.min(340, view.width - PAD * 2))}px`
    panel.style.maxHeight = `${Math.max(1, Math.min(480, view.height - PAD * 2))}px`
    const size = rect(panel)
    const x = Math.max(PAD, Math.min(anchor.x, view.width - size.width - PAD))
    const preferredY = anchor.y - size.height - 12
    const y = Math.max(PAD, Math.min(preferredY >= PAD ? preferredY : anchor.y + anchor.height + 12, view.height - size.height - PAD))
    panel.style.left = `${x - anchor.x}px`
    panel.style.top = `${y - anchor.y}px`
  }

  function schedulePosition() {
    cancelAnimationFrame(positionFrame)
    positionFrame = requestAnimationFrame(positionPanel)
  }

  function applySize(next: number) {
    if (disposed) return
    size = next
    root.style.setProperty('--wiv-size', `${size}px`)
    root.style.setProperty('--wiv-globe-size', `${size / 2}px`)
    root.style.setProperty('--wiv-badge-size', `${Math.max(16, size * 21 / 52)}px`)
    root.style.setProperty('--wiv-badge-font-size', `${Math.max(9, size * 11 / 52)}px`)
    widget.setSize(size, size)
    const view = viewport()
    const position = widget.getPosition()
    widget.moveTo(Math.max(PAD, Math.min(position.x, view.width - size - PAD)), Math.max(PAD, Math.min(position.y, view.height - size - PAD)))
    if (open) schedulePosition()
  }

  function setOpen(next: boolean, restoreFocus = false) {
    open = next && model.chatId !== null
    panel.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    if (open) {
      positionPanel()
      schedulePosition()
      panel.focus({ preventScroll: true })
    } else if (restoreFocus && button.isConnected) button.focus({ preventScroll: true })
  }

  function render() {
    const count = model.entries.length
    badge.hidden = count === 0
    badge.textContent = count ? String(count) : ''
    const label = count ? `World Info: ${count} active ${count === 1 ? 'entry' : 'entries'}` : 'World Info'
    button.setAttribute('aria-label', label)
    button.title = `${label} — click to view, drag to move`
    list.replaceChildren()
    if (!count) {
      const empty = document.createElement('div')
      empty.className = 'wiv-empty'
      empty.textContent = '?'
      empty.setAttribute('aria-label', 'No active entries recorded')
      list.append(empty)
    } else {
      for (const group of groupEntries(model.entries)) {
        const section = document.createElement('section')
        section.className = 'wiv-group'
        const title = document.createElement('h2')
        title.className = 'wiv-book'
        title.textContent = group.name
        const entries = document.createElement('ul')
        entries.className = 'wiv-entries'
        for (const entry of group.entries) {
          const row = document.createElement('li')
          row.className = 'wiv-entry'
          const type = entryActivationType(entry)
          const icon = document.createElement('span')
          icon.className = `wiv-entry-icon wiv-type-${type}`
          icon.title = activationIcons[type].label
          icon.setAttribute('role', 'img')
          icon.setAttribute('aria-label', activationIcons[type].label)
          icon.innerHTML = activationIcons[type].svg
          const name = document.createElement('span')
          name.className = 'wiv-entry-name'
          name.textContent = entryLabel(entry)
          row.append(icon, name)
          row.title = entryLabel(entry)
          entries.append(row)
        }
        section.append(title, entries)
        list.append(section)
      }
    }
    widget.setVisible(model.chatId !== null)
    if (!model.chatId) setOpen(false)
    if (open) schedulePosition()
  }

  // Stop the host's chrome drag handler. The same button supports thresholded
  // pointer dragging and clicks, so dragging never opens the list accidentally.
  let drag: { pointerId: number; x: number; y: number; originX: number; originY: number; moved: boolean } | null = null
  let suppressClickUntil = 0
  listen(button, 'pointerdown', event => {
    const pointer = event as PointerEvent
    event.stopPropagation()
    if (pointer.button !== 0) return
    const origin = widget.getPosition()
    drag = { pointerId: pointer.pointerId, x: layoutPx(pointer.clientX), y: layoutPx(pointer.clientY), originX: origin.x, originY: origin.y, moved: false }
    button.setPointerCapture?.(pointer.pointerId)
  })
  listen(button, 'pointermove', event => {
    const pointer = event as PointerEvent
    event.stopPropagation()
    if (!drag || pointer.pointerId !== drag.pointerId) return
    const dx = layoutPx(pointer.clientX) - drag.x
    const dy = layoutPx(pointer.clientY) - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 5) return
    drag.moved = true
    button.classList.add('wiv-dragging')
    setOpen(false)
    event.preventDefault()
    const view = viewport()
    widget.moveTo(Math.max(PAD, Math.min(drag.originX + dx, view.width - size - PAD)), Math.max(PAD, Math.min(drag.originY + dy, view.height - size - PAD)))
  })
  const endDrag: EventListener = event => {
    const pointer = event as PointerEvent
    event.stopPropagation()
    if (!drag || pointer.pointerId !== drag.pointerId) return
    if (drag.moved || event.type === 'pointercancel') suppressClickUntil = Date.now() + 350
    drag = null
    button.classList.remove('wiv-dragging')
    if (button.hasPointerCapture?.(pointer.pointerId)) button.releasePointerCapture(pointer.pointerId)
  }
  listen(button, 'pointerup', endDrag)
  listen(button, 'pointercancel', endDrag)
  listen(button, 'lostpointercapture', endDrag)
  listen(button, 'click', event => {
    event.stopPropagation()
    if ((event as MouseEvent).detail > 0 && Date.now() < suppressClickUntil) return
    syncActiveChat()
    setOpen(!open)
  })
  listen(panel, 'pointerdown', event => event.stopPropagation())
  listen(panel, 'pointerup', event => event.stopPropagation())
  listen(panel, 'click', event => event.stopPropagation())
  listen(document, 'pointerdown', event => {
    if (open && !event.composedPath().includes(root)) setOpen(false)
  }, { capture: true })
  listen(document, 'keydown', event => {
    if (open && (event as KeyboardEvent).key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false, true)
    }
  }, { capture: true })
  listen(window, 'resize', schedulePosition)
  if (window.visualViewport) {
    listen(window.visualViewport, 'resize', schedulePosition)
    listen(window.visualViewport, 'scroll', schedulePosition)
  }

  const cleanup = () => {
    if (disposed) return
    disposed = true
    cancelAnimationFrame(positionFrame)
    for (const dispose of disposers.reverse()) {
      try { dispose() } catch { /* Permission revocation can close host handles first. */ }
    }
    root.replaceChildren()
    widget.destroy()
  }

  try {
    disposers.push(ctx.dom.addStyle(styles))
    applySize(MAX_GLOBE_SIZE)
    disposers.push(mountSizeSettings(ctx, applySize))
    const changeChat = (value: unknown) => {
      const chatId = value && typeof value === 'object' ? (value as { chatId?: unknown }).chatId : null
      if (model.switchChat(typeof chatId === 'string' ? chatId : null)) {
        setOpen(false)
        render()
      }
    }
    const activeChat = watchActiveChat(ctx, changeChat)
    syncActiveChat = activeChat.sync
    disposers.push(activeChat.dispose)
    for (const event of EVENTS) {
      disposers.push(ctx.events.on(event, payload => {
        if (disposed) return
        syncActiveChat()
        if (!model.event(event, payload)) return
        render()
        // The inspected host provides a read-only entries(bookId) function;
        // SDK 0.6.31 still types this member as the older CRUD helper object.
        const entriesApi: unknown = ctx.worldBooks?.entries
        if (event === 'WORLD_INFO_ACTIVATED' && typeof entriesApi === 'function') {
          const snapshot = model.entries
          const fetchEntries = entriesApi as (bookId: string) => Promise<readonly unknown[]>
          void hydrateActivationTypes(snapshot, bookId => fetchEntries.call(ctx.worldBooks, bookId)).then(enriched => {
            // A late response cannot repopulate an empty result or a different chat.
            if (disposed || model.entries !== snapshot || !enriched.some((entry, index) => entry !== snapshot[index])) return
            model.entries = enriched
            render()
          }).catch(() => { /* Keep the observed snapshot if the host API becomes unavailable. */ })
        }
      }))
    }
    const teardown = ctx.onTeardown?.(cleanup)
    if (teardown) disposers.push(teardown)
    render()
    return cleanup
  } catch (error) {
    cleanup()
    throw error
  }
}
