import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { calorieDay, calorieWeek, calorieKey, calorieReading, reportingTimezone, dayInZone, samsungReadingStatus } from '../lib/calories.js'
import { MOBILE, nativePlatform } from '../lib/mobile.js'
import { openHealthConnect } from '../lib/health-sync.js'
import { connectSamsung, disconnectSamsung, samsungEnabled, syncSamsungDay, syncRecentSamsungDays } from '../lib/calorie-health.js'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import './Calories.css'

const number = value => value == null ? '—' : Math.round(value).toLocaleString('en-US')
const timestamp = value => Number.isFinite(value) && value > 0 ? new Date(value).toLocaleString('en-GB') : 'No data imported yet'

export default function Calories() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const owner = useStore(s => s.user?.id)
  const timezone = reportingTimezone(S)
  const [now, setNow] = useState(Date.now)
  const today = dayInZone(timezone, now)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [android, setAndroid] = useState(false)
  const [date, setDate] = useState(() => dayInZone(timezone))
  const [goal, setGoal] = useState(String(S.calorieGoal || ''))
  const [notice, setNotice] = useState('')
  const [healthMessage, setHealthMessage] = useState('')
  const dayFor = d => ({ yazio: calorieReading(S, 'yazio', d, timezone), samsung: calorieReading(S, 'samsung', d, timezone) })
  const day = dayFor(date)
  const attempt = S.calorieImportStatus?.[calorieKey('samsung', date, timezone)]
  const status = samsungReadingStatus(day.samsung, attempt, now)
  const needsPermission = (attempt?.state === 'permission' && attempt.at >= (day.samsung?.at || 0)) ||
    (day.samsung && (!day.samsung.permissions?.includes('steps') || !day.samsung.permissions?.includes('exercise')))
  const values = calorieDay(day, S.calorieGoal)
  const dates = calorieWeek(date)
  const week = dates.map(d => ({ date: d, ...calorieDay(dayFor(d)) }))
  const chartMax = Math.max(1, ...week.flatMap(d => [d.intake || 0, d.totalBurn || 0]))
  const hasWeek = week.some(d => d.intake !== null || d.totalBurn !== null)

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let gone = false
    setEnabled(false); setHealthMessage('')
    Promise.all([nativePlatform(), samsungEnabled(owner)]).then(([platform, on]) => {
      if (!gone) {
        setAndroid(MOBILE && platform === 'android'); setEnabled(on)
        if (on && platform === 'android') syncRecentSamsungDays(useStore.getState)
      }
    }).catch(() => { if (!gone) setHealthMessage('Could not read connection settings.') })
    return () => { gone = true }
  }, [owner])

  async function syncSamsung(connect = false) {
    if (busy) return
    setBusy(true); setHealthMessage('')
    try {
      if (connect) await connectSamsung(owner, useStore.getState)
      if (useStore.getState().user?.id !== owner) return
      setEnabled(await samsungEnabled(owner))
      const imported = await syncSamsungDay(date, useStore.getState)
      if (useStore.getState().user?.id === owner) setHealthMessage(imported ? 'Imported available Samsung records for this day. Blank fields mean no reading was available.' : 'Import stopped. Check your account and connection settings.')
    } catch (e) {
      if (useStore.getState().user?.id === owner) setHealthMessage(e.message || 'Could not import Samsung data.')
    } finally { setBusy(false) }
  }

  async function stopSamsung() {
    setBusy(true)
    try { await disconnectSamsung(); setEnabled(false); setHealthMessage('Imports stopped on this phone. Previously imported history is kept. You can revoke read permissions in Health Connect.') }
    catch { setEnabled(false); setHealthMessage('Imports stopped for this session, but the setting could not be saved. Revoke OpenGym read permissions in Health Connect before restarting.') }
    finally { setBusy(false) }
  }

  function saveGoal(e) {
    e.preventDefault()
    const n = goal.trim() === '' ? null : Number(goal)
    if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 20000)) {
      setNotice('Enter a target between 1 and 20,000 kcal, or leave it blank to clear it.')
      return
    }
    useStore.getState().update(s => { s.calorieGoal = n === null ? null : Math.round(n) })
    setNotice('Daily target saved. It syncs with your OpenGym account.')
  }

  async function openSamsung() {
    try {
      if (!MOBILE || await nativePlatform() !== 'android') {
        setHealthMessage('On your Android phone, open Samsung Health → Settings → Health Connect → App permissions → Samsung Health. Allow writing Steps and Exercise calories when available.')
        return
      }
      await openHealthConnect()
      setHealthMessage('Check Samsung Health write permissions here, then return and choose Connect Samsung Health.')
    } catch {
      setHealthMessage('Could not open Health Connect. Open it from Samsung Health → Settings → Health Connect.')
    }
  }

  return <div className="narrow calories-page">
    <div className="hdr">
      <div><div className="energy-eyebrow">YOUR DAILY OVERVIEW</div><h1>Calories</h1><div className="sub">Food, movement & your daily balance.</div></div>
      <button className="iconbtn" onClick={() => nav('/home')} aria-label="Back to home"><Icon name="house" /></button>
    </div>
    <div className="energy-date-row">
      <label htmlFor="energy-date">Your day</label>
      <input id="energy-date" className="field" type="date" max={today} value={date} onChange={e => { if (e.target.value && e.target.value <= today) setDate(e.target.value) }} />
      <Button size="sm" onClick={() => setDate(today)}>Today</Button>
    </div>
    <p className="small muted">Reporting day: {timezone}. This account timezone stays fixed when you travel.</p>

    <section className="card energy-hero" aria-label="Daily calorie overview">
      <div className="energy-eyebrow">FOOD INTAKE · YAZIO</div>
      <div className="energy-big">{number(values.intake)} <span>kcal</span></div>
      <p className="muted">{values.intake === null ? 'Connect your food diary to bring your daily intake here.' : `Recorded for ${date}. Your day may still be in progress.`}</p>
      {day.yazio && <p className="small muted">Last food import: {timestamp(day.yazio.at)}. Imported diary totals may be incomplete.</p>}
      {values.progress !== null && <progress aria-label="Food intake compared with daily target" max="100" value={values.progress} />}
      <div className="energy-hero-footer"><span>Daily food target</span><strong>{S.calorieGoal ? `${number(S.calorieGoal)} kcal` : 'Not set'}</strong></div>
      <div className="energy-hero-footer"><span>{values.remaining !== null && values.remaining < 0 ? 'Above target' : 'Remaining to target'}</span><strong>{number(values.remaining === null ? null : Math.abs(values.remaining))} kcal</strong></div>
    </section>

    <section className="card energy-import-state" aria-label="Samsung import status" role="status">
      <h2>Samsung readings · {date}</h2>
      <p>{status}</p>
      <p className="small muted">Last successful import: {timestamp(day.samsung?.at)} · Reporting timezone: {timezone}</p>
      {attempt && <p className="small muted">Last attempt: {timestamp(attempt.at)}</p>}
      {day.samsung?.observedThrough != null && <p className="small muted">Records queried through {new Date(day.samsung.observedThrough).toLocaleString('en-GB', { timeZone: timezone })} ({timezone}).</p>}
    </section>
    <div className="energy-grid">
      <Metric title="Total daily burn" value={values.totalBurn} unit="kcal" note="Resting + active energy, when available" />
      <Metric title="Exercise calories" value={values.exercise} unit="kcal" note="A part of your daily burn; not added again" />
      <Metric title="Daily balance" value={values.balance} unit="kcal" note="Food intake minus total daily burn" />
      <Metric title="Steps" value={values.steps} unit="steps" note="From Samsung Health" />
    </div>
    {values.intake !== null && values.totalBurn !== null && values.balance === null && <p role="status">Balance unavailable: the source reporting intervals are missing or do not match.</p>}

    <section className="card"><h2>Food breakdown</h2><div className="energy-macros">
      <div><span className="energy-dot protein" />Protein<strong>{number(values.protein)} <small>g</small></strong></div>
      <div><span className="energy-dot carbs" />Carbs<strong>{number(values.carbs)} <small>g</small></strong></div>
      <div><span className="energy-dot fat" />Fat<strong>{number(values.fat)} <small>g</small></strong></div>
    </div></section>

    <section className="card"><h2>What to do next</h2>
      <p>{values.intake === null ? 'Keep logging meals in Yazio. Connect the food importer below to see your intake here.' : values.remaining === null ? 'Set your own daily food target below to compare it with your intake.' : `${number(Math.abs(values.remaining))} kcal ${values.remaining >= 0 ? 'below' : 'above'} your chosen food target so far.`}</p>
      <p className="muted small">{values.totalBurn === null ? 'Total daily burn is missing, so your energy balance is not calculated. Exercise calories alone cannot fill that gap.' : 'Daily burn is an estimate and changes throughout the day. An unfinished day is not a final calorie deficit or surplus.'}</p>
    </section>

    <section className="card"><h2>Last 7 days</h2><p className="muted small">Food intake and total daily burn · kcal</p>
      {!hasWeek ? <div className="energy-empty">Your history will appear after the first import.<br /><span className="small muted">Missing readings stay blank, rather than becoming zero.</span></div> : <div className="energy-chart">{week.map(d => <div key={d.date} className="energy-chart-day">
        <div className="energy-bars">{[['intake', 'Food intake'], ['totalBurn', 'Total burn']].map(([key, name]) => <div key={key} className={`energy-bar ${key}`} style={{ height: d[key] === null ? 0 : `${Math.max(2, d[key] / chartMax * 100)}%` }} title={`${d.date} · ${name}: ${number(d[key])} kcal`} />)}</div>
        <span>{new Date(d.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        <span className="small">{number(d.intake)} / {number(d.totalBurn)}</span>
      </div>)}</div>}
    </section>

    <section className="card energy-connections" id="calorie-connections"><h2>Your data sources</h2>
      <p className="muted small">Samsung imports run on the Android phone and sync to your account. Yazio Google sign-in is not connected yet.</p>
      <details><summary><span><strong>Yazio</strong><small>Food calories & macros</small></span><span className="energy-status">Setup needed</span></summary>
        <p>Keep using your existing Yazio account for meals. The next step is a direct food importer for OpenGym.</p>
        <p className="small muted">Your Google sign-in has not been connected to OpenGym yet. Opening Yazio or its help page will not grant access to your diary.</p>
        <a href="https://help.yazio.com/hc/en-us/sections/360000139445-Account-User-Data" target="_blank" rel="noopener noreferrer">Open Yazio account help ↗</a>
        <p className="small muted">Last imported: {timestamp(day.yazio?.at)}</p>
      </details>
      <details><summary><span><strong>Samsung Health</strong><small>Movement, steps & burned calories</small></span><span className="energy-status">{needsPermission ? 'Check permissions' : enabled ? 'Auto-import requested' : day.samsung ? 'Imported history' : 'Setup needed'}</span></summary>
        <p>Read Samsung Health steps and exercise calories through Health Connect. New readings replace the selected day and sync with your OpenGym account.</p>
        <p className="small muted">The complete daily burn may require a direct Samsung integration. Nutrition stays on the separate Yazio connection.</p>
        {android && <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Button variant="tinted" disabled={busy || !owner} onClick={() => syncSamsung(!enabled)}>{busy ? 'Importing…' : enabled ? 'Sync selected day' : 'Connect Samsung Health'}</Button>
          {enabled && needsPermission && <Button disabled={busy || !owner} onClick={() => syncSamsung(true)}>Review permissions</Button>}
          {enabled && <Button disabled={busy} onClick={stopSamsung}>Disconnect</Button>}
          {!owner && <p className="small">Sign in to OpenGym first to keep health imports in your account.</p>}
        </div>}
        <Button onClick={openSamsung}>{android ? 'Health Connect settings' : 'Show phone setup'}</Button>
        {healthMessage && <p role="status" className="small">{healthMessage}</p>}
        <p className="small muted">Last imported: {timestamp(day.samsung?.at)}</p>
      </details>
    </section>

    <section className="card"><h2>Your daily food target</h2><p className="muted small">Use a target you already follow. Exercise calories do not automatically increase it.</p>
      <form onSubmit={saveGoal} className="energy-target-form"><label htmlFor="energy-goal">kcal / day<input id="energy-goal" className="field" type="number" min="1" max="20000" step="1" placeholder="Not set" value={goal} onChange={e => setGoal(e.target.value)} /></label><Button type="submit" variant="tinted">Save target</Button></form>
      {notice && <p role="status" className="small">{notice}</p>}
    </section>
    <p className="energy-future muted small">Next chapter: meal planning. For now, this page brings your tracking and connection setup together.</p>
  </div>
}

function Metric({ title, value, unit, note }) {
  return <section className="card energy-metric"><h2>{title}</h2><div className="energy-metric-value">{number(value)} <small>{unit}</small></div><p className="muted small">{note}</p></section>
}
