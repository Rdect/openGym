import { describe, it, expect, vi } from 'vitest'
import { normalizeSamsungDay, saveSamsungReading, importSamsungDay, disconnectSamsung, samsungEnabled, connectSamsung } from './calorie-health.js'
import { mergeStates } from './sync-merge.js'
vi.mock('./mobile.js', () => ({ MOBILE: true, nativePlatform: async () => 'android', readJsonFile: async () => ({ owner: 'a' }), writeJsonFile: async () => {} }))

describe('Samsung calorie imports', () => {
  it('rejects consent when reset happens while the permission dialog is open', async () => {
    let resetAt = 1
    const write = vi.fn()
    await expect(connectSamsung('a', () => ({ user: { id: 'a' }, S: { resetAt } }), {
      request: async () => { resetAt = 2; return { permissions: ['steps'] } }, write,
    })).rejects.toThrow('Account or consent changed')
    expect(write).not.toHaveBeenCalled()
  })
  it('merges the latest source observation even when an older observation was saved later', () => {
    const a = { _ts: 300, calorieReadings: { 'samsung:2026-10-24': { steps: 10, at: 100, _ts: 300 } } }
    const b = { _ts: 200, calorieReadings: { 'samsung:2026-10-24': { steps: 20, at: 200, _ts: 200 } } }
    expect(mergeStates(a, b).calorieReadings['samsung:2026-10-24'].steps).toBe(20)
    expect(mergeStates(b, a).calorieReadings['samsung:2026-10-24'].steps).toBe(20)
  })
  it('requires source permissions and never infers full daily burn', () => {
    expect(normalizeSamsungDay({ steps: 1000, exercise: 150, totalBurn: 2500, permissions: [] }))
      .toMatchObject({ steps: null, exercise: null, totalBurn: null })
    expect(normalizeSamsungDay({ steps: 0, exercise: 150, permissions: ['steps', 'exercise'], at: 100 }))
      .toMatchObject({ steps: 0, exercise: 150, totalBurn: null, at: 100 })
  })
  it('rejects impossible readings without converting strings', () => {
    expect(normalizeSamsungDay({ steps: '100', exercise: -30, permissions: ['steps', 'exercise'] }))
      .toMatchObject({ steps: null, exercise: null })
  })
  it('replaces a source/day including deletion to null rather than adding it', () => {
    const s = {}
    saveSamsungReading(s, '2026-10-24', { steps: 20, permissions: ['steps'], at: 1 })
    saveSamsungReading(s, '2026-10-24', { steps: null, permissions: ['steps'], at: 2 })
    expect(s.calorieReadings['samsung:2026-10-24'].steps).toBeNull()
  })
  it('preserves independently updated sources and older-day history on merge', () => {
    const a = { _ts: 100, calorieReadings: { 'samsung:2026-10-24': { steps: 100, _ts: 40 } } }
    const b = { _ts: 90, calorieReadings: { 'yazio:2026-10-24': { energy: 300, _ts: 30 }, 'samsung:2026-10-24': { steps: 200, _ts: 50 } } }
    expect(mergeStates(a, b).calorieReadings).toEqual({ 'yazio:2026-10-24': { energy: 300, _ts: 30 }, 'samsung:2026-10-24': { steps: 200, _ts: 50 } })
  })
  it('does not overwrite a newer reading when an older import finishes late', () => {
    const s = {}
    saveSamsungReading(s, '2026-10-24', { steps: 50, permissions: ['steps'], at: 200 })
    saveSamsungReading(s, '2026-10-24', { steps: 20, permissions: ['steps'], at: 100 })
    expect(s.calorieReadings['samsung:2026-10-24'].steps).toBe(50)
  })
  it('discards readings if the account changes while checking consent', async () => {
    let writes = 0, checks = 0
    let state = { user: { id: 'a' }, S: {}, update: () => { writes++ } }
    const result = await importSamsungDay({ date: '2026-10-24', getState: () => state,
      read: async () => ({ steps: 20, permissions: ['steps'], at: 1 }),
      enabled: async () => { if (++checks === 2) state = { ...state, user: { id: 'b' } }; return true },
    })
    expect(result).toBe(false); expect(writes).toBe(0)
  })
  it('does not read without per-account consent', async () => {
    expect(await importSamsungDay({ date: '2026-10-24', getState: () => ({ user: { id: 'a' }, S: {} }), enabled: async () => false, read: async () => { throw Error('must not read') } })).toBe(false)
  })
  it('discards a reading after profile reset or disconnect', async () => {
    let resetAt = 1, writes = 0
    expect(await importSamsungDay({ date: '2026-10-24', getState: () => ({ user: { id: 'a' }, S: { resetAt }, update: () => { writes++ } }), enabled: async () => true, read: async () => { resetAt = 2; return {} } })).toBe(false)
    expect(writes).toBe(0)
  })
  it('stops imports in this session even if persisting disconnect fails', async () => {
    await expect(disconnectSamsung(async () => { throw Error('disk full') })).rejects.toThrow()
    expect(await samsungEnabled('a')).toBe(false)
  })
  it('discards a read spanning disconnect and reconnect to the same account', async () => {
    const state = { user: { id: 'a' }, S: {}, update: vi.fn() }
    const imported = await importSamsungDay({ date: '2026-10-24', getState: () => state, enabled: async () => true,
      read: async () => {
        await disconnectSamsung(async () => {})
        await connectSamsung('a', () => state, { request: async () => ({ permissions: ['steps'] }), write: async () => {} })
        return { steps: 20, permissions: ['steps'] }
      },
    })
    expect(imported).toBe(false)
    expect(state.update).not.toHaveBeenCalled()
  })
})
