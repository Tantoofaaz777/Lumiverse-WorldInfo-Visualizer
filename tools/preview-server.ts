import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const routes: Record<string, string> = {
  '/': 'tools/preview.html',
  '/preview.js': 'artifacts/preview.js',
  '/frontend.js': 'dist/frontend.js',
}
const build = await Bun.build({ entrypoints: [resolve(root, 'tools/preview.ts')], outdir: resolve(root, 'artifacts'), target: 'browser', format: 'esm' })
if (!build.success) throw new Error(build.logs.join('\n'))
const server = Bun.serve({
  hostname: '127.0.0.1', port: 4318,
  fetch(request) {
    const path = routes[new URL(request.url).pathname]
    return path ? new Response(Bun.file(resolve(root, path))) : new Response('Not found', { status: 404 })
  },
})
console.log(`World Info Visualizer preview: ${server.url}`)
