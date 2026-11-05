// ROD-07, ROD-08 (revize 5. 11. 2026): kontrola a čtení vstupů formuláře bez DOM.
// Zvolený návrh: příjmy jsou textová pole (inputmode="decimal") s vlastním parsováním,
// prázdný příjem je chyba – „bez příjmu“ se zadává výslovně jako 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as rodina from '../rodina.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { overVstup, prectiCastku, planRodiny } = rodina;
const PLATNY = { terminPorodu: '2026-03-15', prijemMatka: '30000', prijemOtec: '40000', kdoPpm: 'matka' };

test('ROD-07: termín před 1. 1. 2026 nebo prázdný → chyba u termínu', () => {
  assert.equal(typeof overVstup, 'function', 'overVstup chybí');
  assert.ok(overVstup({ ...PLATNY, terminPorodu: '2025-12-31' }, rules).chyby.terminPorodu);
  assert.ok(overVstup({ ...PLATNY, terminPorodu: '' }, rules).chyby.terminPorodu);
  assert.ok(overVstup({ ...PLATNY, terminPorodu: '2026-02-30' }, rules).chyby.terminPorodu);
});

test('ROD-07: záporný příjem → chyba (ne „bez nároku“)', () => {
  const r = overVstup({ ...PLATNY, prijemMatka: '-30000' }, rules);
  assert.match(r.chyby.prijemMatka, /záporn/);
  assert.ok(overVstup({ ...PLATNY, prijemOtec: -1 }, rules).chyby.prijemOtec);
});

test('ROD-07: prázdný příjem je chyba, 0 znamená výslovně „bez příjmu“', () => {
  assert.match(overVstup({ ...PLATNY, prijemMatka: '' }, rules).chyby.prijemMatka, /0/);
  const r = overVstup({ ...PLATNY, prijemMatka: '0' }, rules);
  assert.deepEqual(r.chyby, {});
  assert.equal(r.vstup.prijemMatka, 0);
});

test('ROD-07: platný vstup projde beze změny do planRodiny', () => {
  const r = overVstup(PLATNY, rules);
  assert.deepEqual(r.chyby, {});
  assert.equal(r.vstup.prijemMatka, 30000);
  assert.equal(r.vstup.prijemOtec, 40000);
  assert.equal(r.vstup.terminPorodu, '2026-03-15');
  assert.equal(r.vstup.kdoPpm, 'matka');
  const plan = planRodiny({ ...r.vstup, otcovska: false }, rules);
  assert.equal(plan.souhrn.ppm, 135436);
});

test('ROD-08: čtení částky s desetinnou čárkou a mezerami', () => {
  assert.equal(typeof prectiCastku, 'function', 'prectiCastku chybí');
  assert.equal(prectiCastku('30000,50').hodnota, 30000.5);
  assert.equal(prectiCastku('1500,5').hodnota, 1500.5);
  assert.equal(prectiCastku('30 000').hodnota, 30000);
  assert.equal(prectiCastku('30 000,50').hodnota, 30000.5);
  assert.equal(prectiCastku('30000.50').hodnota, 30000.5);
  assert.ok(prectiCastku('abc').chyba);
  assert.ok(prectiCastku('30.000').chyba, '„30.000“ je nejednoznačné, nesmí se přečíst jako 30 Kč');
  assert.ok(prectiCastku('-5').chyba);
  assert.equal(overVstup({ ...PLATNY, prijemMatka: '30000,50' }, rules).vstup.prijemMatka, 30000.5);
});

test('ROD-08: pole příjmů nejsou type="number" se step="100" (čárka by se v en-US zahodila)', () => {
  for (const name of ['prijemMatka', 'prijemOtec']) {
    const tag = html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))[0];
    assert.doesNotMatch(tag, /step="100"/);
    assert.match(tag, /type="text"/);
    assert.match(tag, /inputmode="decimal"/);
  }
});
