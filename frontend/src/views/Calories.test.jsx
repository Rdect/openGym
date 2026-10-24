// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
const model = vi.hoisted(() => ({ S: {}, user: { id: 'test' } }))
vi.mock('../store/useStore.js', () => ({ useStore: Object.assign(select => select(model), { getState: () => model }) }))
import Calories from './Calories.jsx'

afterEach(() => vi.useRealTimers())
describe('visible import health', () => {
  it.each(['failed', 'permission'])('exposes %s beside saved metrics without expanding source setup', state => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
    model.S = {
      calorieTimezone: 'Europe/Istanbul',
      calorieReadings: { 'samsung:2026-10-24:Europe/Istanbul': { steps: 5000, exercise: 150, at: Date.now() - 3600000, timezone: 'Europe/Istanbul', permissions: ['steps', 'exercise'] } },
      calorieImportStatus: { 'samsung:2026-10-24:Europe/Istanbul': { state, at: Date.now() } },
    }
    const container = document.createElement('div')
    container.innerHTML = renderToStaticMarkup(<MemoryRouter><Calories /></MemoryRouter>)
    const status = container.querySelector('[aria-label="Samsung import status"]')
    expect(status.closest('details')).toBeNull()
    expect(status.textContent).toContain(state === 'failed' ? 'Import failed' : 'Permission missing or revoked')
    expect(status.textContent).toContain('Last successful import:')
    expect(status.textContent).toContain('Europe/Istanbul')
    expect(container.textContent).toContain('5,000')
    expect(container.textContent).not.toContain('Enabled on this phone')
  })
})
