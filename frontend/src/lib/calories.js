// Missing readings are unknown, not zero. Exercise energy is never a substitute for total burn.
export const calorieValue = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

export function validTimezone(zone) {
  if (typeof zone !== 'string' || !zone) return false
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true } catch { return false }
}
export const calorieKey = (source, date, timezone) => `${source}:${date}:${timezone}`
// One account reporting zone, pinned on first connection/import. Older installations adopt
// the earliest recorded zone. Travel changes neither the selected day nor its UTC interval.
export function reportingTimezone(state = {}, fallback = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  if (validTimezone(state.calorieTimezone)) return state.calorieTimezone
  const old = Object.values(state.calorieReadings || {}).filter(r => validTimezone(r?.timezone))
    .sort((a, b) => (a.at || 0) - (b.at || 0) || a.timezone.localeCompare(b.timezone))[0]
  return old?.timezone || (validTimezone(fallback) ? fallback : 'UTC')
}
export function dayInZone(timezone, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).map(p => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}
export function calorieReading(state, source, date, zone = reportingTimezone(state)) {
  const readings = state.calorieReadings || {}
  const legacy = readings[`${source}:${date}`]
  return readings[calorieKey(source, date, zone)] || (legacy?.timezone === zone ? legacy : undefined)
}
export function compatibleIntervals(a, b) {
  return Number.isFinite(a?.intervalStart) && Number.isFinite(a?.intervalEnd) && a.intervalEnd > a.intervalStart &&
    a.intervalStart === b?.intervalStart && a.intervalEnd === b?.intervalEnd
}
export function samsungReadingStatus(reading, attempt, now = Date.now()) {
  if (attempt && attempt.at >= (reading?.at || 0)) {
    if (attempt.state === 'permission') return 'Permission missing or revoked — reconnect on Android. Saved readings may be outdated.'
    if (attempt.state === 'failed') return 'Import failed — saved readings may be outdated. Retry on Android.'
  }
  if (!reading) return 'No Samsung readings imported for this reporting day.'
  const partial = !reading.permissions?.includes('steps') || !reading.permissions?.includes('exercise') ||
    reading.steps == null || reading.exercise == null || !Number.isFinite(reading.intervalEnd) ||
    !Number.isFinite(reading.observedThrough) || reading.observedThrough < reading.intervalEnd
  const stale = !Number.isFinite(reading.at) || now - reading.at > 15 * 60 * 1000
  return [stale ? 'Stale — last check was over 15 minutes ago.' : 'Recently checked.',
    partial ? 'Partial — day in progress, missing records or limited permission.' : 'Available records only; late watch uploads may change these values.'].join(' ')
}

export function calorieDay(day = {}, goal) {
  const intake = calorieValue(day.yazio?.energy)
  const totalBurn = calorieValue(day.samsung?.totalBurn)
  const exercise = calorieValue(day.samsung?.exercise)
  const target = calorieValue(goal)
  return {
    intake, totalBurn, exercise,
    steps: calorieValue(day.samsung?.steps),
    protein: calorieValue(day.yazio?.protein),
    carbs: calorieValue(day.yazio?.carbs),
    fat: calorieValue(day.yazio?.fat),
    balance: intake !== null && totalBurn !== null && compatibleIntervals(day.yazio, day.samsung) ? intake - totalBurn : null,
    remaining: intake !== null && target > 0 ? target - intake : null,
    progress: intake !== null && target > 0 ? Math.min(100, intake / target * 100) : null,
  }
}

export function calorieWeek(date) {
  const end = new Date(date + 'T12:00:00')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(end)
    d.setDate(d.getDate() - 6 + i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
}
