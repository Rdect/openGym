import { describe, it, expect } from 'vitest'
import { calorieDay, calorieWeek, calorieKey, calorieReading, reportingTimezone, dayInZone, samsungReadingStatus } from './calories.js'

describe('daily calorie overview', () => {
  it('keeps missing intake and burn unknown, including with a goal', () => {
    expect(calorieDay({}, 2000)).toMatchObject({ intake: null, balance: null, remaining: null, progress: null })
  })
  it('does not treat exercise calories as total daily burn or add them twice', () => {
    expect(calorieDay({ yazio: { energy: 1800 }, samsung: { exercise: 400 } }).balance).toBeNull()
    const interval = { intervalStart: 100, intervalEnd: 200 }
    expect(calorieDay({ yazio: { energy: 1800, ...interval }, samsung: { exercise: 400, totalBurn: 2300, ...interval } }).balance).toBe(-500)
  })
  it('preserves a genuine zero and rejects invalid source values', () => {
    expect(calorieDay({ yazio: { energy: 0, protein: -1, carbs: '20', fat: Infinity } }, 2000))
      .toMatchObject({ intake: 0, protein: null, carbs: null, fat: null, remaining: 2000, progress: 0 })
  })
  it('keeps over-target amounts signed without increasing the food goal by exercise', () => {
    expect(calorieDay({ yazio: { energy: 2500 }, samsung: { exercise: 400 } }, 2000))
      .toMatchObject({ remaining: -500, progress: 100 })
  })
  it('includes the selected day across a year boundary', () => {
    expect(calorieWeek('2026-01-03')).toEqual(['2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03'])
  })
  it('does not combine mismatched or unknown reporting intervals', () => {
    expect(calorieDay({ yazio: { energy: 1800, timezone: 'Europe/Istanbul' }, samsung: { totalBurn: 2300, timezone: 'America/Los_Angeles' } }).balance).toBeNull()
    expect(calorieDay({ yazio: { energy: 1800, intervalStart: 100, intervalEnd: 200 }, samsung: { totalBurn: 2300, intervalStart: 110, intervalEnd: 210 } }).balance).toBeNull()
  })
  it('pins the reporting zone across travel and selects only matching snapshots', () => {
    const S = { calorieTimezone: 'Europe/Istanbul', calorieReadings: { 'samsung:2026-10-24': { timezone: 'America/Los_Angeles', steps: 3 } } }
    expect(reportingTimezone(S, 'America/Los_Angeles')).toBe('Europe/Istanbul')
    expect(calorieReading(S, 'samsung', '2026-10-24')).toBeUndefined()
    S.calorieReadings[calorieKey('samsung', '2026-10-24', 'Europe/Istanbul')] = { timezone: 'Europe/Istanbul', steps: 5 }
    expect(calorieReading(S, 'samsung', '2026-10-24').steps).toBe(5)
    expect(dayInZone('Europe/Istanbul', Date.parse('2026-10-24T22:30:00Z'))).toBe('2026-10-25')
  })
  it('shows failed/revoked imports over retained values and marks partial or old readings', () => {
    const now = Date.parse('2026-10-25T12:00:00Z')
    const reading = { at: now - 1000, permissions: ['steps', 'exercise'], steps: 1, exercise: 2, intervalEnd: now - 2000, observedThrough: now - 2000 }
    expect(samsungReadingStatus(reading, { state: 'permission', at: now }, now)).toContain('Permission')
    expect(samsungReadingStatus(reading, { state: 'failed', at: now }, now)).toContain('failed')
    expect(samsungReadingStatus({ ...reading, observedThrough: now - 3000 }, null, now)).toContain('Partial')
    expect(samsungReadingStatus({ ...reading, at: now - 3600000 }, null, now)).toContain('Stale')
    expect(samsungReadingStatus({ ...reading, permissions: ['steps'], exercise: null }, null, now)).toContain('Partial')
  })
})
