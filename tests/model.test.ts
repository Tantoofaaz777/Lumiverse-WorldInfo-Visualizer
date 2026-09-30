import { describe, expect, test } from 'bun:test'
import { ActivationModel, entryLabel, groupEntries, readEntries, entryActivationType, hydrateActivationTypes } from '../src/model'

const a = { id: 'a', comment: '  Exact NAME ★  ', bookId: 'book-a', bookName: 'Lorebook A' }
const b = { id: 'b', comment: 'Entry B', bookId: 'book-b', bookName: 'Lorebook B' }
function active() {
  const model = new ActivationModel()
  model.switchChat('chat-a')
  model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [a, b] })
  return model
}
const start = { chatId: 'chat-a', generationId: 'gen-1' }

describe('activation classification', () => {
  test('explicit origin takes precedence over generic source and configured flags', () => {
    const rows = readEntries([
      { ...a, activationType: 'constant', source: 'keyword' },
      { ...b, activationType: 'sticky', source: 'keyword', constant: true },
      { ...a, activationProvenance: { origin: 'vector' }, source: 'keyword' },
      { ...a, activationType: 'keyword', constant: true },
    ])!
    expect(rows.map(entryActivationType)).toEqual(['constant', 'sticky', 'vector', 'keyword'])
  })
  test('a vector source is authoritative; vectorized configuration is not activation evidence', () => {
    const rows = readEntries([{ ...a, source: 'vector', constant: true }, { ...b, source: 'keyword', vectorized: true }])!
    expect(rows.map(entryActivationType)).toEqual(['vector', 'unknown'])
  })
  test('legacy constants and keywords are resolved once per contributing book', async () => {
    const rows = readEntries([{ ...a, source: 'keyword' }, { ...a, id: 'another', source: 'keyword' }, { ...b, source: 'vector' }])!
    const calls: string[] = []
    const result = await hydrateActivationTypes(rows, async bookId => {
      calls.push(bookId)
      return [{ id: a.id, constant: true, content: 'Ignored' }, { id: 'another', constant: false, vectorized: true }]
    })
    expect(calls).toEqual(['book-a'])
    expect(result.map(entryActivationType)).toEqual(['constant', 'keyword', 'vector'])
    expect(result.map(entryLabel)).toEqual(rows.map(entryLabel))
    expect('content' in result[0]).toBe(false)
    expect(entryActivationType(rows[0])).toBe('unknown')
  })
  test('unavailable, incomplete or wrong-ID metadata stays unknown', async () => {
    const rows = readEntries([{ ...a, source: 'keyword' }, { ...b, source: 'keyword' }])!
    const result = await hydrateActivationTypes(rows, async bookId => {
      if (bookId === 'book-b') throw new Error('Unavailable')
      return [{ id: 'wrong-id', constant: true }, { id: 'a', constant: 'false' }]
    })
    expect(result.map(entryActivationType)).toEqual(['unknown', 'unknown'])
  })
  test('complete typed events do not fetch lorebook metadata', async () => {
    const rows = readEntries([{ ...a, activationType: 'constant' }, { ...b, source: 'vector' }])!
    let calls = 0
    await hydrateActivationTypes(rows, async () => { calls++; return [] })
    expect(calls).toBe(0)
  })
})

describe('latest real generation', () => {
  test('no data before the first observed generation', () => {
    const model = new ActivationModel()
    model.switchChat('chat-a')
    expect(model.entries).toEqual([])
  })
  test('keeps the previous result during assembly, then replaces it', () => {
    const model = active()
    model.event('GENERATION_STARTED', start)
    expect(model.entries).toEqual([a, b])
    model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [b] })
    model.event('STREAM_TOKEN_RECEIVED', { ...start, token: 'Hello' })
    expect(model.entries).toEqual([b])
  })
  test('missing zero-entry event clears old data on the first response token', () => {
    const model = active()
    model.event('GENERATION_STARTED', start)
    expect(model.event('STREAM_TOKEN_RECEIVED', { ...start, token: 'Thinking', type: 'reasoning' })).toBe(true)
    expect(model.entries).toEqual([])
  })
  test('empty successful completion also clears without any tokens', () => {
    const model = active()
    model.event('GENERATION_STARTED', start)
    model.event('GENERATION_ENDED', { ...start, content: '' })
    expect(model.entries).toEqual([])
  })
  test('an explicit empty activation is authoritative', () => {
    const model = active()
    model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [] })
    expect(model.entries).toEqual([])
  })
  test('error or cancellation before assembly preserves the previous result', () => {
    for (const event of ['GENERATION_ENDED', 'GENERATION_STOPPED']) {
      const model = active()
      model.event('GENERATION_STARTED', start)
      model.event(event, { ...start, error: 'Cancelled before assembly' })
      expect(model.entries).toEqual([a, b])
    }
  })
  test('chat changes clear data; background chat events cannot leak', () => {
    const model = active()
    model.event('GENERATION_STARTED', start)
    model.switchChat('chat-b')
    model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [a] })
    model.event('GENERATION_ENDED', start)
    expect(model.entries).toEqual([])
    expect(model.chatId).toBe('chat-b')
    model.switchChat(null)
    expect(model.chatId).toBeNull()
  })
  test('stale terminal events cannot clear a newer generation', () => {
    const model = active()
    model.event('GENERATION_STARTED', { ...start, generationId: 'gen-2' })
    model.event('GENERATION_ENDED', start)
    expect(model.entries).toEqual([a, b])
    model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [a] })
    model.event('STREAM_TOKEN_RECEIVED', { ...start, generationId: 'gen-2', token: 'New' })
    expect(model.entries).toEqual([a])
  })
  test('unrecognized previews and malformed activations do not replace real data', () => {
    const model = active()
    model.event('DRY_RUN', { chatId: 'chat-a', entries: [a] })
    model.event('WORLD_INFO_ACTIVATED', { chatId: 'chat-a', entries: [{ id: 'missing-title' }] })
    expect(model.entries).toEqual([a, b])
  })
})

describe('exact labels and grouping', () => {
  test('retains punctuation, case, whitespace and newlines', () => {
    const entry = { ...a, comment: '  Exact NAME ★\nSecond line  ' }
    expect(entryLabel(entry)).toBe(entry.comment)
    expect(entryLabel({ ...a, comment: '  ' })).toBe('Untitled entry (a)')
  })
  test('sorts books alphabetically and preserves server order within each', () => {
    const second = { ...a, id: 'a-2', comment: 'A comes later' }
    const groups = groupEntries([b, a, second])
    expect(groups.map(group => group.name)).toEqual(['Lorebook A', 'Lorebook B'])
    expect(groups[0].entries.map(entry => entry.id)).toEqual(['a', 'a-2'])
  })
  test('identical book names and entry names remain distinct by IDs', () => {
    const groups = groupEntries([a, { ...a, id: 'other-entry', bookId: 'other-book' }])
    expect(groups).toHaveLength(2)
    expect(groups[0].entries).toHaveLength(1)
    expect(groups[1].entries).toHaveLength(1)
  })
  test('missing book metadata has readable English fallbacks', () => {
    const groups = groupEntries([{ id: 'x', comment: 'X' }, { id: 'y', comment: 'Y', bookId: 'book-y' }])
    expect(groups.map(group => group.name)).toEqual(['Unknown lorebook', 'Unnamed lorebook (book-y)'])
  })
  test('copies allowlisted fields without retaining content or extra data', () => {
    const rows = readEntries([{ ...a, content: 'Secret content', unexpected: true }])!
    expect(rows).toEqual([a])
    expect('content' in rows[0]).toBe(false)
  })
})
