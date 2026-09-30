export type ActivationType = 'constant' | 'keyword' | 'vector' | 'sticky' | 'unknown'

export interface ActiveEntry {
  id: string
  comment: string
  bookId?: string
  bookName?: string
  activationType?: Exclude<ActivationType, 'unknown'>
  source?: 'keyword' | 'vector'
  constant?: boolean
}

export interface LorebookGroup {
  key: string
  name: string
  entries: ActiveEntry[]
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null
}

function readActivationType(value: unknown): ActiveEntry['activationType'] {
  return value === 'constant' || value === 'keyword' || value === 'vector' || value === 'sticky' ? value : undefined
}

/** Prefer the actual origin; a vectorized setting alone never implies vector activation. */
export function entryActivationType(entry: ActiveEntry): ActivationType {
  if (entry.activationType) return entry.activationType
  if (entry.source === 'vector') return 'vector'
  if (entry.constant === true) return 'constant'
  if (entry.source === 'keyword' && entry.constant === false) return 'keyword'
  return 'unknown'
}

/** Older host events combine constants and keywords. Read only the constant flag;
 * never retain entry content or re-evaluate which entries would activate. */
export async function hydrateActivationTypes(
  entries: readonly ActiveEntry[],
  fetchBookEntries: (bookId: string) => Promise<readonly unknown[]>,
): Promise<ActiveEntry[]> {
  const bookIds = [...new Set(entries.filter(entry => entryActivationType(entry) === 'unknown' && entry.source === 'keyword')
    .map(entry => entry.bookId).filter((id): id is string => Boolean(id)))]
  const flags = new Map<string, Map<string, boolean>>()
  await Promise.all(bookIds.map(async bookId => {
    try {
      const rows = await fetchBookEntries(bookId)
      const bookFlags = new Map<string, boolean>()
      for (const value of rows) {
        const row = record(value)
        if (row && typeof row.id === 'string' && typeof row.constant === 'boolean') bookFlags.set(row.id, row.constant)
      }
      flags.set(bookId, bookFlags)
    } catch { /* Unavailable metadata must never turn a possible constant into a keyword. */ }
  }))
  return entries.map(entry => {
    const constant = entry.bookId ? flags.get(entry.bookId)?.get(entry.id) : undefined
    return entryActivationType(entry) === 'unknown' && entry.source === 'keyword' && constant !== undefined
      ? { ...entry, constant } : entry
  })
}

/** Retain labels exactly; neither content nor unknown payload fields are stored. */
export function readEntries(value: unknown): ActiveEntry[] | null {
  if (!Array.isArray(value)) return null
  const entries: ActiveEntry[] = []
  for (const item of value) {
    const row = record(item)
    if (!row || typeof row.id !== 'string' || typeof row.comment !== 'string') return null
    entries.push({
      id: row.id,
      comment: row.comment,
      bookId: typeof row.bookId === 'string' ? row.bookId : undefined,
      bookName: typeof row.bookName === 'string' ? row.bookName : undefined,
      activationType: readActivationType(row.activationType) ?? readActivationType(record(row.activationProvenance)?.origin),
      source: row.source === 'keyword' || row.source === 'vector' ? row.source : undefined,
      constant: typeof row.constant === 'boolean' ? row.constant : undefined,
    })
  }
  return entries
}

export function entryLabel(entry: ActiveEntry): string {
  return entry.comment.trim() ? entry.comment : `Untitled entry (${entry.id})`
}

export function groupEntries(entries: readonly ActiveEntry[]): LorebookGroup[] {
  const groups = new Map<string, LorebookGroup>()
  for (const entry of entries) {
    const key = entry.bookId ? `id:${entry.bookId}`
      : entry.bookName ? `name:${entry.bookName}` : 'unknown'
    let group = groups.get(key)
    if (!group) {
      group = { key, name: entry.bookName?.trim() ? entry.bookName
        : entry.bookId ? `Unnamed lorebook (${entry.bookId})` : 'Unknown lorebook', entries: [] }
      groups.set(key, group)
    }
    group.entries.push(entry)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'en') || a.key.localeCompare(b.key, 'en'))
}

/** Track observed generations only. A preview/dry run never enters this model. */
export class ActivationModel {
  chatId: string | null = null
  entries: ActiveEntry[] = []
  private pending: { generationId?: string; receivedActivation: boolean; streaming: boolean } | null = null

  switchChat(chatId: string | null): boolean {
    if (this.chatId === chatId) return false
    this.chatId = chatId
    this.entries = []
    this.pending = null
    return true
  }

  event(name: string, value: unknown): boolean {
    const payload = record(value)
    if (!payload || !this.chatId || payload.chatId !== this.chatId) return false
    if (name === 'WORLD_INFO_ACTIVATED') {
      const entries = readEntries(payload.entries)
      if (!entries) return false
      this.entries = entries
      if (this.pending) this.pending.receivedActivation = true
      return true
    }
    if (name === 'GENERATION_STARTED') {
      this.pending = { generationId: typeof payload.generationId === 'string' ? payload.generationId : undefined,
        receivedActivation: false, streaming: false }
      return false
    }
    if (!this.pending) return false
    if (this.pending.generationId && payload.generationId !== this.pending.generationId) return false
    if (name === 'STREAM_TOKEN_RECEIVED') {
      if (typeof payload.token !== 'string' || !payload.token.length || this.pending.streaming) return false
      this.pending.streaming = true
      // Lumiverse emits WI before streaming; some versions omit the zero-entry event.
      if (!this.pending.receivedActivation) {
        this.entries = []
        return true
      }
    }
    if (name === 'GENERATION_ENDED' || name === 'GENERATION_STOPPED') {
      const clear = name === 'GENERATION_ENDED' && !payload.error
        && payload.stopped !== true && payload.aborted !== true && !this.pending.receivedActivation
      this.pending = null
      if (clear) {
        this.entries = []
        return true
      }
    }
    return false
  }
}
