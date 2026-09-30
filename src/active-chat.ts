import type { SpindleFrontendContext } from 'lumiverse-spindle-types'

/** Some staging hosts expose selectors before their authority map is wired.
 * The shipped getActiveChat() API exposes the same IDs without that selector. */
export function watchActiveChat(ctx: SpindleFrontendContext, change: (value: unknown) => void) {
  let active = true
  const publish = (value: unknown) => { if (active) change(value) }
  if (ctx.state && typeof ctx.state.get === 'function' && typeof ctx.state.subscribe === 'function') {
    try {
      const initial = ctx.state.get('chat.active')
      const unsubscribe = ctx.state.subscribe('chat.active', publish)
      publish(initial)
      return {
        sync: () => {},
        dispose: () => { active = false; unsubscribe() },
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('PERMISSION_DENIED:spindle_authority_map_unwired')
        && !message.includes('SELECTOR_UNKNOWN:chat.active')) throw error
    }
  }
  if (typeof ctx.getActiveChat !== 'function') {
    throw new Error('World Info Visualizer requires an active-chat API from Lumiverse.')
  }
  const sync = () => { if (active) publish(ctx.getActiveChat()) }
  sync()
  const timer = window.setInterval(sync, 250)
  return {
    sync,
    dispose: () => { active = false; window.clearInterval(timer) },
  }
}
