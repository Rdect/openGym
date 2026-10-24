import { calorieValue, calorieKey, calorieWeek, dayInZone, reportingTimezone, validTimezone } from './calories.js'
import { MOBILE, nativePlatform, readJsonFile } from './mobile.js'

const PREF = 'opengym-calorie-import.json'
let stopped = false
let consentGeneration = 0
async function saveConsent(value) {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({ path: PREF, directory: Directory.Data, data: JSON.stringify(value), encoding: Encoding.UTF8 })
}
export function normalizeSamsungDay(raw = {}) {
  const permissions = Array.isArray(raw.permissions) ? raw.permissions.filter(p => ['steps', 'exercise'].includes(p)) : []
  return {
    steps: permissions.includes('steps') ? calorieValue(raw.steps) : null,
    exercise: permissions.includes('exercise') ? calorieValue(raw.exercise) : null,
    // Samsung's Health Connect energy is exercise energy, not its daily activity summary.
    totalBurn: null, permissions, source: 'samsung-health-connect',
    at: calorieValue(raw.at) || Date.now(), timezone: validTimezone(raw.timezone) ? raw.timezone : null,
    intervalStart: calorieValue(raw.intervalStart), intervalEnd: calorieValue(raw.intervalEnd),
    observedThrough: calorieValue(raw.observedThrough),
  }
}

export function saveSamsungReading(state, date, raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw Error('Invalid date')
  const snapshot = normalizeSamsungDay(raw)
  if (!snapshot.timezone) throw Error('Missing reporting timezone')
  const key = calorieKey('samsung', date, snapshot.timezone)
  state.calorieReadings ||= {}
  if ((state.calorieReadings[key]?.at || 0) > snapshot.at) return
  state.calorieReadings[key] = { ...snapshot, date, _ts: Date.now() }
}

async function native() {
  if (!MOBILE || await nativePlatform() !== 'android') throw Error('Connect Samsung Health from the updated Android app.')
  const { registerPlugin } = await import('@capacitor/core')
  return { plugin: registerPlugin('HealthConnect') }
}

export async function samsungEnabled(owner) {
  if (!MOBILE || !owner || stopped) return false
  const saved = await readJsonFile(PREF)
  return !stopped && saved?.owner === owner
}
export async function disconnectSamsung(write = saveConsent) {
  consentGeneration++
  stopped = true
  await write({ owner: null })
}
export async function connectSamsung(owner, getState, { request, write = saveConsent } = {}) {
  if (!owner) throw Error('Sign in to your OpenGym account first.')
  const reset = getState().S.resetAt, generation = consentGeneration
  const current = () => getState().user?.id === owner && getState().S.resetAt === reset && consentGeneration === generation
  if (!current()) throw Error('Account changed. Connect again.')
  if (!request) { const { plugin } = await native(); request = () => plugin.requestCaloriePermissions() }
  const result = await request()
  if (!current()) throw Error('Account or consent changed. Connect again.')
  if (!result.permissions?.length) throw Error('Allow Steps or Exercise calories to connect Samsung Health.')
  await write({ owner })
  if (!current()) { await disconnectSamsung(write); throw Error('Account or consent changed. Connect again.') }
  const zone = reportingTimezone(getState().S)
  if (!getState().S.calorieTimezone && getState().update) getState().update(s => { s.calorieTimezone = zone })
  stopped = false
}

// Recheck identity and consent after the native call; a response must never cross accounts
// or resurrect readings after a reset/disconnect while the system dialog was open.
export async function importSamsungDay({ date, getState, read, enabled = samsungEnabled }) {
  const before = getState(), owner = before.user?.id, reset = before.S.resetAt, generation = consentGeneration
  const timezone = reportingTimezone(before.S)
  const current = () => getState().user?.id === owner && getState().S.resetAt === reset && generation === consentGeneration
  if (!owner || !await enabled(owner)) return false
  if (!current()) return false
  try {
    const raw = await read(date, timezone)
    if (!await enabled(owner) || !current()) return false
    if (raw.timezone !== timezone || (raw.date && raw.date !== date)) throw Error('Reporting interval mismatch')
    getState().update(s => {
      s.calorieTimezone ||= timezone
      saveSamsungReading(s, date, raw)
      saveImportStatus(s, date, timezone, 'success', raw.at || Date.now())
    })
    return true
  } catch (error) {
    if (!await enabled(owner) || !current()) return false
    const state = error?.code === 'permission' ? 'permission' : 'failed'
    getState().update(s => {
      s.calorieTimezone ||= timezone
      saveImportStatus(s, date, timezone, state, Date.now())
    })
    throw Error(state === 'permission' ? 'Health Connect read permission is missing or revoked. Reconnect Samsung Health.' : 'Samsung import failed. Saved readings were kept; retry on Android.')
  }
}

function saveImportStatus(s, date, timezone, state, at) {
  const key = calorieKey('samsung', date, timezone)
  s.calorieImportStatus ||= {}
  if ((s.calorieImportStatus[key]?.at || 0) > at) return
  s.calorieImportStatus[key] = { state, at, date, timezone, _ts: Date.now() }
}

export async function syncSamsungDay(date, getState) {
  return importSamsungDay({ date, getState, read: async (d, timezone) => {
    const { plugin } = await native()
    return plugin.readCalorieDay({ date: d, timezone })
  } })
}

export async function syncRecentSamsungDays(getState, { now = Date.now(), sync = syncSamsungDay, enabled = samsungEnabled } = {}) {
  const before = getState(), owner = before.user?.id, reset = before.S.resetAt, generation = consentGeneration
  if (!before.ready || !owner) return
  const days = calorieWeek(dayInZone(reportingTimezone(before.S), now)).slice(-2).reverse()
  for (const date of days) {
    if (!await enabled(owner) || getState().user?.id !== owner || getState().S.resetAt !== reset || generation !== consentGeneration) return
    try { await sync(date, getState) } catch { /* syncSamsungDay stores a visible, sanitized failure for this day. Continue yesterday. */ }
  }
}

export async function initCalorieImport(getState) {
  if (!MOBILE) return () => {}
  let running = false, disposed = false
  const run = async () => {
    if (running || disposed || !getState().ready || !getState().user) return
    running = true
    try {
      await syncRecentSamsungDays(getState)
    }
    finally { running = false }
  }
  const { App } = await import('@capacitor/app')
  const sub = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) run() })
  run()
  return () => { disposed = true; sub.remove() }
}
