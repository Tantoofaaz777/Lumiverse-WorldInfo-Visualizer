# World Info Visualizer

A small Spindle extension for Lumiverse. A draggable floating globe shows the number of World Info entries used in the latest observed generation. Click or tap it to see their exact titles, grouped by lorebook.

## Behavior

- All extension UI is in English. Lorebook and entry titles remain exactly as saved, in any language.
- The globe uses the same Lucide Globe icon as Lumiverse's native World Info tab.
- The floating globe and list use Lumiverse's live theme surfaces, text, borders, and accent colors. The badge uses the theme's contrast color for its number.
- The badge is hidden before the first observed generation and when there are zero entries. The empty list shows only `?`.
- Lorebooks are sorted alphabetically. Entries keep their received order inside each book. Books are grouped by ID, so duplicate names stay separate.
- Entry icons distinguish constants (blue Pin, `Always active`), keywords (green KeyRound, `Keyword`), and vectors (violet Link, `Vector`). Only the icons are colored. Light themes use darker shades of the same colors.
- Explicit sticky activations use a neutral Clock (`Sticky — retained from an earlier generation`), never the constant Pin. If the type cannot be established, a neutral question icon says `Activation type unavailable`.
- Untitled entries show `Untitled entry (ID)`. Missing book metadata has an English fallback.
- The panel starts directly with the lorebook groups, without a title bar or close button. Click the globe again, click outside, or press Escape to dismiss the list.
- Drag the globe to move it. Spindle saves its position. The list wraps long names and scrolls on small screens.
- Switching chats closes and clears the list. The globe is hidden on the home screen.

## Generation data

This extension listens to actual `WORLD_INFO_ACTIVATED` events. It never calls `getActivated()`, runs a dry run, modifies a prompt, or predicts activation.

For icon classification, explicit `activationType` or activation provenance takes priority. Older hosts report both constants and keywords as `source: keyword`; the extension then reads each contributing book's entry configuration through `ctx.worldBooks.entries()` to distinguish the `constant` flag. These lookups do not affect the observed active set, count, names, or order, and late responses are discarded after chat changes or newer activation results. Only IDs and boolean flags are retained. Metadata lookup failure leaves the type unknown. A legacy payload that omits sticky provenance cannot establish whether a keyword entry was retained by a timed effect; the fallback indicates its configured entry category.

Lumiverse 1.2.0 can omit the activation event when no entries survive. The extension tracks `GENERATION_STARTED` and clears the previous result on the first real `STREAM_TOKEN_RECEIVED` if no activation event arrived. A successful `GENERATION_ENDED` without tokens also clears it. Cancellation or failure before an observed assembly result keeps the previous generation's result.

After loading/reloading the extension, refreshing the application, or switching chats, the list starts empty and waits for the next observed generation. It does not reconstruct historical activation snapshots. This avoids presenting a possibly stale host snapshot as the last generation's actual result.

## Requirements and permissions

- Lumiverse 1.2.0 or a compatible newer host with persistent floating widgets and an active-chat API.
- `ui_panels`: creates the host-managed floating widget.
- `generation`: observes generation lifecycle events for the zero-entry fallback. It does not start generations.
- Bun for rebuilding or running the local preview. The compiled bundle has no runtime dependencies and does not require React.

## Install from GitHub

1. Open Lumiverse's **Spindle / Extensions** panel and choose its install-from-repository action.
2. Enter `https://github.com/Tantoofaaz777/Lumiverse-WorldInfo-Visualizer` and install the extension from the default `main` branch.
3. Grant the listed permissions and enable the extension.
4. Open a chat and generate a response. The globe will update when the actual activation event arrives.

The repository includes the compiled `dist/frontend.js`. The manifest disables `dev_mode`, so Spindle can fetch updates from GitHub. This initial release has passed automated tests and a local preview; testing in a running Lumiverse instance is still pending.

On staging builds whose `chat.active` selector reports `spindle_authority_map_unwired`, the extension uses the shipped `ctx.getActiveChat()` API instead. It checks for chat changes every 250 ms and immediately before processing generation events or opening the list. No additional permissions are requested. Hosts with working selectors use their normal subscription.

## Install a local development copy

For local-only development, set `dev_mode` to `true` in the copy's `spindle.json` before importing it. This prevents Spindle updates from overwriting local changes.

1. Find the **data directory of the running Lumiverse instance**. Its extensions directory is `<data directory>/extensions` (usually `data/extensions` under a source checkout unless configured otherwise).
2. Extract the release ZIP into `<data directory>/extensions/world_info_visualizer/`, so that `spindle.json` is directly inside that folder. Alternatively, copy `spindle.json`, `dist/`, `src/`, `package.json`, `bun.lock`, `tsconfig.json`, `README.md`, and `THIRD_PARTY_NOTICES.md` there. Do not copy `node_modules/` or `artifacts/`.
3. Sign in as the Lumiverse owner and open the **Spindle / Extensions** panel. Use its **Import Local** action.
4. Grant the listed permissions and enable the extension.
5. Open a chat and generate a response. The globe will update when the actual activation event arrives.

The project folder is independent from Lumiverse's installed copy. After editing a local development copy, rebuild here, copy the updated files to the installed extension's `repo/` directory, and reload the extension through the host.

## Development

```powershell
bun install
bun run typecheck
bun test
bun run build
bun run preview
```

The preview is served only on `http://127.0.0.1:4318`. Its sample controls exercise active entries, missing zero-entry events, chat changes, home visibility, theme changes, and reloading. Add `?scene=long` to inspect a long scrollable list. This is a host simulation, not a test inside a running Lumiverse instance.

Use `?scene=active&state=unwired` to reproduce the staging selector error and exercise the compatibility path.

Create a local installation ZIP after building:

```powershell
powershell -NoProfile -File tools/package.ps1
```

## Source layout

- `src/frontend.ts`: Spindle setup, widget, list, drag, dismissal, and teardown.
- `src/model.ts`: generation observation, exact labels, and lorebook grouping.
- `src/active-chat.ts`: chat subscriptions and staging compatibility.
- `src/icons.ts`: Lucide activation icons and English tooltips.
- `src/styles.ts`: theme-aware styles scoped by extension class names.
- `tests/`: generation and frontend behavior tests.
- `dist/frontend.js`: ready-to-load browser module.
- `tools/`: optional local preview and packaging helpers; never loaded by Spindle.

The implementation was written for Lumiverse's public frontend APIs. It uses WorldInfoInfo only as a behavioral reference.
