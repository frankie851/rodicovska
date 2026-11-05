import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planRodiny } from '../rodina.js';
import { svgOsa } from '../timeline.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));

test('SVG osa: jeden řádek na měsíc a nic nepřesahuje šířku 360 px', () => {
  const plan = planRodiny({ terminPorodu: '2027-03-15', prijemMatka: 40000, prijemOtec: 50000, stridani: true, stridaniOdMesice: 18 }, rules);
  const svg = svgOsa(plan, { sirka: 360 });
  assert.match(svg, /viewBox="0 0 360 /);
  assert.equal((svg.match(/class="pozadi"/g) || []).length, plan.mesice.length);
  for (const [, x, w] of svg.matchAll(/class="seg [^"]+" x="([\d.]+)" y="[\d.]+" width="([\d.]+)"/g)) {
    assert.ok(Number(x) + Number(w) <= 360 + 0.01, `segment přesahuje: ${x} + ${w}`);
  }
  for (const typ of ['ppm-matka', 'otcovska', 'rp', 'mzda']) assert.match(svg, new RegExp(`seg-${typ}`));
});

test('SVG osa escapuje text', () => {
  const plan = planRodiny({ terminPorodu: '2026-05-01' }, rules);
  plan.mesice[0].popis = '<script>';
  assert.doesNotMatch(svgOsa(plan), /<script>/);
});
