import { describe, it, expect, vi } from 'vitest'
import { normalizeSamsungDay, saveSamsungReading, importSamsungDay, disconnectSamsung, samsungEnabled, connectSamsung, syncRecentSamsungDays } from './calorie-health.js'
import { mergeStates, resetIdsOf } from './sync-merge.js'
vi.mock('./mobile.js', () => ({ MOBILE: true, nativePlatform: async () => 'android', readJsonFile: async () => ({ owner: 'a' }), writeJsonFile: async () => {} }))

describe('Samsung calorie imports', () => {
  it('preserves different timezone intervals, including pre-upgrade history, without collision', () => {
    const legacy = { steps: 9, timezone: 'Europe/Istanbul', at: 1 }
    const s = { calorieReadings: { 'samsung:2026-10-24': legacy } }
    saveSamsungReading(s, '2026-10-24', { steps: 5000, permissions: ['steps'], at: 100, timezone: 'Europe/Istanbul', intervalStart: 1, intervalEnd: 2, observedThrough: 2 })
    saveSamsungReading(s, '2026-10-24', { steps: 3000, permissions: ['steps'], at: 200, timezone: 'America/Los_Angeles', intervalStart: 3, intervalEnd: 4, observedThrough: 4 })
    expect(s.calorieReadings['samsung:2026-10-24:Europe/Istanbul']).toMatchObject({ steps: 5000, intervalStart: 1, intervalEnd: 2 })
    expect(s.calorieReadings['samsung:2026-10-24:America/Los_Angeles'].steps).toBe(3000)
    expect(s.calorieReadings['samsung:2026-10-24']).toEqual(legacy)
  })
  it('retains last success on revoked permission and records a visible failure for that interval', async () => {
    const snapshot = { steps: 50, at: 1, timezone: 'Europe/Istanbul' }
    const state = { user: { id: 'a' }, S: { calorieTimezone: 'Europe/Istanbul', calorieReadings: { 'samsung:2026-10-24:Europe/Istanbul': snapshot } }, update: fn => fn(state.S) }
    const read = vi.fn(async () => { throw Object.assign(Error('sensitive native details'), { code: 'permission' }) })
    await expect(importSamsungDay({ date: '2026-10-24', getState: () => state, enabled: async () => true, read })).rejects.toThrow()
    expect(read).toHaveBeenCalledWith('2026-10-24', 'Europe/Istanbul')
    expect(state.S.calorieReadings['samsung:2026-10-24:Europe/Istanbul']).toEqual(snapshot)
    expect(state.S.calorieImportStatus['samsung:2026-10-24:Europe/Istanbul'].state).toBe('permission')
    expect(JSON.stringify(state.S.calorieImportStatus)).not.toContain('sensitive')
  })
  it('does not write failure status after account reset during a failed read', async () => {
    const state = { user: { id: 'a' }, S: {}, update: vi.fn() }
    await importSamsungDay({ date: '2026-10-24', getState: () => state, enabled: async () => true,
      read: async () => { state.S.resetAt = 2; throw Error('failed') },
    }).catch(() => {})
    expect(state.update).not.toHaveBeenCalled()
  })
  it('refreshes yesterday even when today fails, using the reporting zone across midnight', async () => {
    const state = { ready: true, user: { id: 'a' }, S: { calorieTimezone: 'Europe/Istanbul' } }
    const sync = vi.fn(async date => { if (date === '2026-10-25') throw Error('today failed') })
    await syncRecentSamsungDays(() => state, { now: Date.parse('2026-10-24T22:30:00Z'), sync, enabled: async () => true })
    expect(sync.mock.calls.map(c => c[0])).toEqual(['2026-10-25', '2026-10-24'])
  })
  it('does not start yesterday for another account after today finishes', async () => {
    const state = { ready: true, user: { id: 'a' }, S: {} }
    const sync = vi.fn(async () => { state.user = { id: 'b' } })
    await syncRecentSamsungDays(() => state, { sync, enabled: async () => true })
    expect(sync).toHaveBeenCalledTimes(1)
  })
  it('merges independent reporting intervals and their failure states without losing either', () => {
    const a = { _ts: 1, calorieReadings: { 'samsung:2026-10-24:Europe/Istanbul': { steps: 5, at: 1, _ts: 1 } }, calorieImportStatus: { 'samsung:2026-10-24:Europe/Istanbul': { state: 'failed', at: 1, _ts: 1 } } }
    const b = { _ts: 2, calorieReadings: { 'samsung:2026-10-24:America/Los_Angeles': { steps: 3, at: 2, _ts: 2 } }, calorieImportStatus: { 'samsung:2026-10-24:America/Los_Angeles': { state: 'success', at: 2, _ts: 2 } } }
    expect(Object.keys(mergeStates(a, b).calorieReadings)).toHaveLength(2)
    expect(Object.keys(mergeStates(b, a).calorieImportStatus)).toHaveLength(2)
  })
  it('does not hide a newer permission failure behind an older status saved later', () => {
    const key = 'samsung:2026-10-24:UTC'
    const a = { _ts: 300, calorieImportStatus: { [key]: { state: 'success', at: 100, _ts: 300 } } }
    const b = { _ts: 200, calorieImportStatus: { [key]: { state: 'permission', at: 200, _ts: 200 } } }
    expect(mergeStates(a, b).calorieImportStatus[key].state).toBe('permission')
    expect(mergeStates(b, a).calorieImportStatus[key].state).toBe('permission')
  })
  it('does not resurrect readings or import failures after an account reset', () => {
    const key = 'samsung:2026-10-24:UTC'
    const old = { _ts: 100, workouts: [], calorieReadings: { [key]: { steps: 1, at: 100, _ts: 100 } }, calorieImportStatus: { [key]: { state: 'failed', at: 100, _ts: 100 } } }
    const reset = { _ts: 200, workouts: [], resetAt: 200, resetIds: resetIdsOf(old) }
    expect(mergeStates(old, reset).calorieReadings || {}).toEqual({})
    expect(mergeStates(old, reset).calorieImportStatus || {}).toEqual({})
  })
  it('clears an earlier failure after a successful same-interval refresh', async () => {
    const state = { user: { id: 'a' }, S: { calorieTimezone: 'UTC', calorieImportStatus: { 'samsung:2026-10-24:UTC': { state: 'failed', at: 1 } } }, update: fn => fn(state.S) }
    await importSamsungDay({ date: '2026-10-24', getState: () => state, enabled: async () => true,
      read: async () => ({ timezone: 'UTC', date: '2026-10-24', at: 2, steps: 0, permissions: ['steps'] }),
    })
    expect(state.S.calorieImportStatus['samsung:2026-10-24:UTC'].state).toBe('success')
    expect(state.S.calorieReadings['samsung:2026-10-24:UTC'].steps).toBe(0)
  })
  it('does not write errors after disconnect during a failed request', async () => {
    const state = { user: { id: 'a' }, S: {}, update: vi.fn() }
    expect(await importSamsungDay({ date: '2026-10-24', getState: () => state, enabled: async () => true,
      read: async () => { await disconnectSamsung(async () => {}); throw Error('late failure') },
    })).toBe(false)
    expect(state.update).not.toHaveBeenCalled()
  })
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
    saveSamsungReading(s, '2026-10-24', { steps: 20, permissions: ['steps'], timezone: 'UTC', at: 1 })
    saveSamsungReading(s, '2026-10-24', { steps: null, permissions: ['steps'], timezone: 'UTC', at: 2 })
    expect(s.calorieReadings['samsung:2026-10-24:UTC'].steps).toBeNull()
  })
  it('preserves independently updated sources and older-day history on merge', () => {
    const a = { _ts: 100, calorieReadings: { 'samsung:2026-10-24': { steps: 100, _ts: 40 } } }
    const b = { _ts: 90, calorieReadings: { 'yazio:2026-10-24': { energy: 300, _ts: 30 }, 'samsung:2026-10-24': { steps: 200, _ts: 50 } } }
    expect(mergeStates(a, b).calorieReadings).toEqual({ 'yazio:2026-10-24': { energy: 300, _ts: 30 }, 'samsung:2026-10-24': { steps: 200, _ts: 50 } })
  })
  it('does not overwrite a newer reading when an older import finishes late', () => {
    const s = {}
    saveSamsungReading(s, '2026-10-24', { steps: 50, permissions: ['steps'], timezone: 'UTC', at: 200 })
    saveSamsungReading(s, '2026-10-24', { steps: 20, permissions: ['steps'], timezone: 'UTC', at: 100 })
    expect(s.calorieReadings['samsung:2026-10-24:UTC'].steps).toBe(50)
  })
  it('discards readings if the account changes while checking consent', async () => {
    let writes = 0, checks = 0
    let state = { user: { id: 'a' }, S: {}, update: () => { writes++ } }
    const result = await importSamsungDay({ date: '2026-10-24', getState: () => state,
      read: async () => ({ steps: 20, permissions: ['steps'], timezone: 'UTC', at: 1 }),
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
    const state = { user: { id: 'a' }, S: { calorieTimezone: 'UTC' }, update: vi.fn() }
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
