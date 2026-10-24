import { describe, it, expect } from 'vitest'
import { calorieDay, calorieWeek } from './calories.js'

describe('daily calorie overview', () => {
  it('keeps missing intake and burn unknown, including with a goal', () => {
    expect(calorieDay({}, 2000)).toMatchObject({ intake: null, balance: null, remaining: null, progress: null })
  })
  it('does not treat exercise calories as total daily burn or add them twice', () => {
    expect(calorieDay({ yazio: { energy: 1800 }, samsung: { exercise: 400 } }).balance).toBeNull()
    expect(calorieDay({ yazio: { energy: 1800 }, samsung: { exercise: 400, totalBurn: 2300 } }).balance).toBe(-500)
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
})
