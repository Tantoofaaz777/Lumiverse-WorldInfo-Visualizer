import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

export type IconPlacement = 'floating' | 'top_bar'
export const ICON_PLACEMENT_KEY = 'ui:icon_placement'
export const iconPlacement = (value: unknown): IconPlacement => value === 'top_bar' ? 'top_bar' : 'floating'

export function mountPlacementSettings(ctx: SpindleFrontendContext, root: Element, apply: (placement: IconPlacement) => void): () => void {
  const settings = ctx.settings
  if (!settings || typeof ctx.components?.mountSelect !== 'function') return () => {}
  const field = document.createElement('div')
  field.className = 'wiv-placement-setting'
  const label = document.createElement('div')
  label.className = 'wiv-setting-label'
  label.textContent = 'Icon placement'
  const target = document.createElement('div')
  const status = document.createElement('p')
  status.className = 'wiv-setting-status'
  status.setAttribute('role', 'status')
  field.append(label, target, status)
  root.append(field)
  let disposed = false
  let revision = 0
  let pending = 0
  let writes = Promise.resolve()
  const select = ctx.components.mountSelect(target, {
    ariaLabel: 'Icon placement', value: 'floating',
    options: [{ value: 'floating', label: 'Floating' }, { value: 'top_bar', label: 'Top bar' }],
    onChange(value) {
      if (disposed) return
      const placement = iconPlacement(value)
      const writeRevision = ++revision
      receive(placement)
      pending++
      status.textContent = 'Saving…'
      writes = writes.then(async () => {
        if (disposed) return
        try {
          await settings.set(ICON_PLACEMENT_KEY, placement)
          if (!disposed && revision === writeRevision) status.textContent = ''
        } catch (error) {
          if (!disposed && revision === writeRevision) status.textContent = 'Could not save icon placement. Try again.'
          console.warn('[World Info Visualizer] Could not save icon placement:', error)
        }
      }).finally(() => { pending-- })
    },
  })
  function receive(value: unknown) {
    const placement = iconPlacement(value)
    apply(placement)
    select.update({ value: placement })
  }
  const unwatch = settings.watch<unknown>(ICON_PLACEMENT_KEY, value => {
    if (disposed || pending) return
    revision++
    receive(value)
  })
  const readRevision = revision
  void settings.get<unknown>(ICON_PLACEMENT_KEY).then(value => {
    if (!disposed && revision === readRevision) receive(value)
  }).catch(error => {
    if (!disposed && revision === readRevision) status.textContent = 'Could not load icon placement. Using Floating.'
    console.warn('[World Info Visualizer] Could not load icon placement:', error)
  })
  return () => { disposed = true; unwatch(); select.destroy(); field.remove() }
}
