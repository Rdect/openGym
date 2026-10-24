import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeYazioDay, readYazioDay } from '../integrations/yazio.js';

const summary = () => ({ units: { unit_energy: 'kcal' }, meals: Object.fromEntries(['breakfast', 'lunch', 'dinner', 'snack'].map(m => [m, { nutrients: { 'energy.energy': 100, 'nutrient.protein': 10, 'nutrient.carb': 12, 'nutrient.fat': 3 } }])) });
test('uses daily meal totals including recipes, never activity energy or goals', () => {
  const raw = { ...summary(), activity_energy: 500, goals: { 'energy.energy': 2000 } };
  assert.deepEqual(normalizeYazioDay(raw), { energy: 400, protein: 40, carbs: 48, fat: 12 });
});
test('missing meals and missing nutrients are not a false complete total', () => {
  const raw = summary(); delete raw.meals.snack.nutrients['nutrient.protein'];
  assert.equal(normalizeYazioDay(raw).protein, null);
  delete raw.meals.lunch;
  assert.equal(normalizeYazioDay(raw).energy, null);
});
test('rejects unknown energy units and negative values', () => {
  const raw = summary(); raw.units.unit_energy = 'joules';
  assert.throws(() => normalizeYazioDay(raw), /Unsupported/);
  raw.units.unit_energy = 'kcal'; raw.meals.snack.nutrients['energy.energy'] = -1;
  assert.equal(normalizeYazioDay(raw).energy, null);
});
test('reads exactly the requested date with bounded fetch and no redirects', async () => {
  const got = await readYazioDay({ access_token: 'private' }, '2026-10-24', { timezone: 'Europe/Istanbul', fetch: async (url, opts) => {
    assert.equal(new URL(url).searchParams.get('date'), '2026-10-24');
    assert.equal(opts.redirect, 'error'); assert.ok(opts.signal);
    return Response.json(summary());
  } });
  assert.equal(got.energy, 400); assert.equal(got.timezone, 'Europe/Istanbul'); assert.ok(got.at);
});
test('rejects invalid calendar dates before contacting provider', async () => {
  await assert.rejects(readYazioDay({ access_token: 'private' }, '2026-02-30', { fetch: () => { throw Error('must not call'); } }), /date/);
});
test('sanitizes provider errors and does not expose tokens or response text', async () => {
  await assert.rejects(readYazioDay({ access_token: 'private' }, '2026-10-24', { fetch: async () => new Response('private secret response', { status: 401 }) }), e => e.code === 'yazio-auth' && !e.message.includes('private'));
});
test('refreshes once on expiry and uses the new session only once', async () => {
  let calls = 0, refreshes = 0;
  const result = await readYazioDay({ access_token: 'old' }, '2026-10-24', {
    refresh: async () => { refreshes++; return { access_token: 'new' }; },
    fetch: async (_, opts) => { calls++; return opts.headers.Authorization === 'Bearer old' ? new Response('', { status: 401 }) : Response.json(summary()); },
  });
  assert.equal(result.energy, 400); assert.equal(calls, 2); assert.equal(refreshes, 1);
});
