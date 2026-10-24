import { calorieValue } from './calories.js'
import { MOBILE, nativePlatform, readJsonFile } from './mobile.js'
import { todayISO } from './format.js'

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
    at: calorieValue(raw.at) || Date.now(), timezone: typeof raw.timezone === 'string' ? raw.timezone : 'UTC',
  }
}

export function saveSamsungReading(state, date, raw) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw Error('Invalid date')
  const snapshot = normalizeSamsungDay(raw)
  state.calorieReadings ||= {}
  if ((state.calorieReadings[`samsung:${date}`]?.at || 0) > snapshot.at) return
  state.calorieReadings[`samsung:${date}`] = { ...snapshot, _ts: Date.now() }
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
  stopped = false
}

// Recheck identity and consent after the native call; a response must never cross accounts
// or resurrect readings after a reset/disconnect while the system dialog was open.
export async function importSamsungDay({ date, getState, read, enabled = samsungEnabled }) {
  const before = getState(), owner = before.user?.id, reset = before.S.resetAt, generation = consentGeneration
  if (!owner || !await enabled(owner)) return false
  const raw = await read(date)
  if (!await enabled(owner)) return false
  const after = getState()
  if (after.user?.id !== owner || after.S.resetAt !== reset || generation !== consentGeneration) return false
  after.update(s => saveSamsungReading(s, date, raw))
  return true
}

export async function syncSamsungDay(date, getState) {
  const { plugin } = await native()
  return importSamsungDay({ date, getState, read: d => plugin.readCalorieDay({ date: d, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) })
}

export async function initCalorieImport(getState) {
  if (!MOBILE) return () => {}
  let running = false, disposed = false
  const run = async () => {
    if (running || disposed || !getState().ready || !getState().user) return
    running = true
    try {
      if (await samsungEnabled(getState().user.id)) await syncSamsungDay(todayISO(), getState)
    } catch { /* The Calories screen retries explicitly and displays the error. Old readings retain their timestamp. */ }
    finally { running = false }
  }
  const { App } = await import('@capacitor/app')
  const sub = await App.addListener('appStateChange', ({ isActive }) => { if (isActive) run() })
  run()
  return () => { disposed = true; sub.remove() }
}
