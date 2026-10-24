// Unofficial read-only provider adapter. No Google sign-in or credential collection is
// exposed until a supported flow is verified. Schema references: juriadams/yazio
// src/api/user/summary.ts (meals.*.nutrients); no food database or recipe writes.
const ORIGIN = 'https://yzapi.yazio.com/v15';
const meals = ['breakfast', 'lunch', 'dinner', 'snack'];
const error = (code, message) => Object.assign(new Error(message), { code });
const numeric = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function normalizeYazioDay(raw) {
  const unit = raw?.units?.unit_energy;
  if (!['kcal', 'kJ', 'kj'].includes(unit)) throw error('yazio-format', 'Unsupported Yazio energy unit.');
  const fields = { energy: 'energy.energy', protein: 'nutrient.protein', carbs: 'nutrient.carb', fat: 'nutrient.fat' };
  return Object.fromEntries(Object.entries(fields).map(([key, field]) => {
    const values = meals.map(meal => raw?.meals?.[meal]?.nutrients?.[field]);
    const total = values.every(numeric) ? values.reduce((a, b) => a + b, 0) : null;
    return [key, total === null ? null : key === 'energy' && unit !== 'kcal' ? total / 4.184 : total];
  }));
}

export async function readYazioDay(session, date, { fetch = globalThis.fetch, refresh, timezone = 'UTC' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw error('date', 'Invalid calendar date.');
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
  catch { throw error('timezone', 'Invalid timezone.'); }
  let token = session?.access_token;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (typeof token !== 'string' || !token || token.length > 16384) throw error('yazio-auth', 'Connect your Yazio account first.');
    let response;
    try {
      response = await fetch(`${ORIGIN}/user/widgets/daily-summary?date=${date}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (response.status === 401 && attempt === 0 && refresh) {
        token = (await refresh())?.access_token;
        continue;
      }
      if (!response.ok) throw error(response.status === 401 || response.status === 403 ? 'yazio-auth' : 'yazio-unavailable', 'Yazio could not provide this day.');
      const normalized = normalizeYazioDay(await response.json());
      return { ...normalized, at: Date.now(), timezone };
    } catch (e) {
      if (e?.code?.startsWith('yazio-')) throw e;
      throw error('yazio-unavailable', 'Yazio did not return a usable response. Try again later.');
    }
  }
  throw error('yazio-auth', 'Reconnect your Yazio account.');
}
