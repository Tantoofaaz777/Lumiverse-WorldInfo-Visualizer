import type { SpindleFrontendContext } from 'lumiverse-spindle-types'
import { mountPlacementSettings, type IconPlacement } from './placement-settings'

export const MIN_GLOBE_SIZE = 32
export const MAX_GLOBE_SIZE = 52
export const GLOBE_SIZE_KEY = 'ui:globe_size'

export function globeSize(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_GLOBE_SIZE, Math.min(MAX_GLOBE_SIZE, Math.round(value))) : MAX_GLOBE_SIZE
}

export function mountSizeSettings(ctx: SpindleFrontendContext, applySize: (size: number) => void, applyPlacement: (placement: IconPlacement) => void): () => void {
  const settings = ctx.settings
  if (!settings || typeof ctx.ui.mount !== 'function' || typeof ctx.components?.mountRangeSlider !== 'function') {
    console.warn('[World Info Visualizer] Native size settings are unavailable in this Lumiverse build.')
    return () => {}
  }
  const root = ctx.ui.mount('settings_extensions')
  root.classList.add('wiv-settings')
  root.setAttribute('lang', 'en')
  const title = document.createElement('h3')
  title.textContent = 'World Info Visualizer'
  const target = document.createElement('div')
  const status = document.createElement('p')
  status.className = 'wiv-setting-status'
  status.setAttribute('role', 'status')
  const sizeField = document.createElement('div')
  sizeField.className = 'wiv-size-setting'
  sizeField.append(target, status)
  root.append(title)

  let disposed = false
  let revision = 0
  let dragging = false
  let topBar = false
  let committed = MAX_GLOBE_SIZE
  let pendingWrites = 0
  let writes = Promise.resolve()
  const slider = ctx.components.mountRangeSlider(target, {
    label: 'Floating icon size',
    hint: 'Drag to resize the globe. The original size is 52 px.',
    min: MIN_GLOBE_SIZE, max: MAX_GLOBE_SIZE, step: 1, integer: true,
    value: committed, format: { suffix: ' px' },
    onDragValue(value) {
      if (disposed || topBar) return
      revision++
      dragging = value !== null
      applySize(value === null ? committed : globeSize(value))
    },
    onCommit(value) {
      if (disposed || topBar) return
      const size = globeSize(value)
      const writeRevision = ++revision
      dragging = false
      committed = size
      applySize(size)
      pendingWrites++
      status.textContent = 'Saving…'
      // Serialize commits so a slower earlier save cannot overwrite the latest size.
      writes = writes.then(async () => {
        if (disposed) return
        try {
          await settings.set(GLOBE_SIZE_KEY, size)
          if (!disposed && revision === writeRevision) status.textContent = ''
        } catch (error) {
          if (!disposed && revision === writeRevision) status.textContent = 'Could not save icon size. Try again.'
          console.warn('[World Info Visualizer] Could not save icon size:', error)
        }
      }).finally(() => { pendingWrites-- })
    },
  })
  const disposePlacement = mountPlacementSettings(ctx, root, placement => {
    topBar = placement === 'top_bar'
    sizeField.hidden = topBar
    dragging = false
    applySize(committed)
    slider.update({ disabled: topBar })
    applyPlacement(placement)
  })
  root.append(sizeField)
  const receive = (value: unknown) => {
    committed = globeSize(value)
    applySize(committed)
    slider.update({ value: committed })
  }
  const unwatch = settings.watch<unknown>(GLOBE_SIZE_KEY, value => {
    if (disposed || dragging || pendingWrites) return
    revision++
    receive(value)
  })
  const readRevision = revision
  void settings.get<unknown>(GLOBE_SIZE_KEY).then(value => {
    if (!disposed && revision === readRevision) receive(value)
  }).catch(error => {
    if (!disposed && revision === readRevision) status.textContent = 'Could not load saved icon size. Using the default size.'
    console.warn('[World Info Visualizer] Could not load icon size:', error)
  })
  return () => {
    disposed = true
    disposePlacement()
    unwatch()
    slider.destroy()
    root.replaceChildren()
  }
}
