import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dvz, redukovanyDvz, denniDavka, dnyRozhodnehoObdobi, hraniceProDatum,
  pravidlaRp, stropRp, cerpaniRp, navrhVyse, cistaMzda, parametryMzdy,
  planRodiny, pridejDny,
} from '../rodina.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
const H2026 = rules.redukcniHranice['2026'];
const H2027 = rules.redukcniHranice['2027'];
const R = rules.ppm.redukce;

// ---------- Požadované případy ze zadání ----------

test('příjem 30 000 Kč měsíčně → DVZ 986,30 Kč, redukovaný DVZ 987 Kč', () => {
  const d = dvz(30000, 365);
  assert.equal(d.toFixed(2), '986.30');
  assert.equal(redukovanyDvz(d, H2026, R), 987);
  assert.equal(redukovanyDvz(d, H2027, R), 987);
});

test('DVZ 1 000 Kč → strop rodičovské 21 000 Kč měsíčně', () => {
  const rp = pravidlaRp(rules, '2026-06-01');
  assert.equal(stropRp({ redDvz: [1000], vicercata: false }, rp, rules), 21000);
});

test('bez DVZ, 15 000 Kč měsíčně → 350 000 Kč vyčerpáno za 24 měsíců (23 × 15 000 + 5 000)', () => {
  const rp = pravidlaRp(rules, '2026-06-01');
  const strop = stropRp({ redDvz: [], vicercata: false }, rp, rules);
  assert.equal(strop, 15000);
  const c = cerpaniRp({ celkem: rp.celkem, mesicniVyse: 15000, odMesice: 0 });
  assert.equal(c.vycerpano, 350000);
  assert.equal(c.mesice.length, 24);
  assert.equal(c.mesice.filter((m) => m.castka === 15000).length, 23);
  assert.equal(c.mesice.at(-1).castka, 5000);
  assert.equal(c.mesicVycerpani, 23);
  assert.equal(c.propadne, 0);
});

test('rodičovská od 6. měsíce po 8 000 Kč → do 3 let 240 000 Kč, propadne 110 000 Kč a aplikace upozorní', () => {
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 8000, odMesice: 6 });
  assert.equal(c.vycerpano, 240000);
  assert.equal(c.propadne, 110000);
  assert.equal(c.mesicVycerpani, null);

  // Celý plán: matka na mateřské 6 týdnů před porodem → RP od 6. měsíce dítěte.
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 40000,
    kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.odMesice, 6);
  assert.equal(plan.rp.vycerpano, 240000);
  assert.equal(plan.rp.propadne, 110000);
  const v = plan.varovani.find((x) => x.typ === 'propadnuti');
  assert.ok(v, 'chybí varování o propadnutí');
  assert.match(v.text, /110\s000/);
});

test('vícerčata bez DVZ → strop 30 000 Kč, celkem 700 000 Kč', () => {
  const rp = pravidlaRp(rules, '2026-06-01');
  assert.equal(stropRp({ redDvz: [], vicercata: true }, rp, rules), 30000);
  const plan = planRodiny({
    terminPorodu: '2026-06-01', vicercata: true, prijemMatka: 0, prijemOtec: 0,
    kdoPpm: 'nikdo', otcovska: false, rpVyse: 30000,
  }, rules);
  assert.equal(plan.rp.strop, 30000);
  assert.equal(plan.rp.celkem, 700000);
  assert.equal(plan.rp.vycerpano, 700000);
  assert.equal(plan.rp.propadne, 0);
});

// ---------- Další kontroly ----------

test('mateřská z příjmu 30 000 Kč = 691 Kč denně (70 % z 987, nahoru)', () => {
  assert.equal(denniDavka(987, 0.7), 691);
});

test('redukce po pásmech 2026: 100 % / 60 % / 30 % a nic nad 3. hranicí', () => {
  assert.equal(redukovanyDvz(1633, H2026, R), 1633);
  assert.equal(redukovanyDvz(2000, H2026, R), Math.ceil(1633 + 0.6 * 367));        // 1853,2 → 1854
  assert.equal(redukovanyDvz(3000, H2026, R), Math.ceil(1633 + 0.6 * 816 + 0.3 * 551)); // 2287,9 → 2288
  assert.equal(redukovanyDvz(4897, H2026, R), 2857);
  assert.equal(redukovanyDvz(10000, H2026, R), 2857);
});

test('maximální strop RP 2026 = 59 997 Kč (0,7 × 30 × 2 857)', () => {
  const rp = pravidlaRp(rules, '2026-06-01');
  assert.equal(stropRp({ redDvz: [2857], vicercata: false }, rp, rules), 59997);
  assert.equal(stropRp({ redDvz: [500, 2857], vicercata: false }, rp, rules), 59997, 'použije se vyšší DVZ');
  assert.equal(stropRp({ redDvz: [1000], vicercata: true }, rp, rules), 42000, 'vícerčata 2 × 0,7 × 30 × DVZ');
});

test('počet dní rozhodného období (12 kalendářních měsíců před měsícem nároku)', () => {
  assert.equal(dnyRozhodnehoObdobi('2027-02-01'), 365); // 2/2026–1/2027
  assert.equal(dnyRozhodnehoObdobi('2028-03-10'), 366); // 3/2027–2/2028 obsahuje 29. 2. 2028
});

test('redukční hranice podle roku nástupu, neznámý rok → poslední známé s příznakem odhadu', () => {
  assert.equal(hraniceProDatum(rules, '2026-12-20').h1, 1633);
  assert.equal(hraniceProDatum(rules, '2027-01-05').h1, 1723);
  const h = hraniceProDatum(rules, '2028-02-01');
  assert.equal(h.rok, 2027);
  assert.equal(h.odhad, true);
});

test('porod v lednu 2027 s nástupem v prosinci 2026 → mateřská podle hranic 2026, RP 400 000', () => {
  const plan = planRodiny({ terminPorodu: '2027-01-20', prijemMatka: 200000, kdoPpm: 'matka' }, rules);
  assert.equal(plan.matka.ppm.hranice.rok, 2026);
  assert.equal(plan.matka.ppm.redDvz, 2857);
  assert.equal(plan.matka.ppm.denni, 2000); // 0,7 × 2857 = 1999,9 → 2000
  assert.equal(plan.rp.celkem, 400000);
});

test('narození od 1. 1. 2027 → 400 000 Kč, stejný scénář 8 000 Kč od 6. měsíce → propadne 160 000 Kč', () => {
  const plan = planRodiny({
    terminPorodu: '2027-03-15', prijemMatka: 30000, prijemOtec: 40000,
    kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.celkem, 400000);
  assert.equal(plan.rp.vycerpano, 240000);
  assert.equal(plan.rp.propadne, 160000);
  assert.ok(plan.varovani.some((x) => x.typ === 'novela400'));
});

test('vícerčata 2027 → 800 000 Kč', () => {
  assert.equal(pravidlaRp(rules, '2027-01-01').celkemVicercata, 800000);
});

test('návrh výše pro vyčerpání do 3 let', () => {
  assert.equal(navrhVyse(350000, 6, 36), 11700); // 350 000 / 30 = 11 666,67 → nahoru na stovky
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 11700, odMesice: 6 });
  assert.equal(c.propadne, 0);
});

test('orientační čistá mzda zaměstnance 2026 z 30 000 Kč = 24 590 Kč', () => {
  const p = parametryMzdy(rules, 2026);
  // SP 2 130, ZP 1 350, daň 4 500 − sleva 2 570 = 1 930
  assert.equal(cistaMzda(30000, p), 24590);
  assert.equal(cistaMzda(0, p), 0);
});

test('mateřská se rozpadne do kalendářních měsíců: 196 dní celkem', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 30000, kdoPpm: 'matka', otcovska: false }, rules);
  const dny = plan.mesice.flatMap((m) => m.polozky).filter((p) => p.typ === 'ppm').reduce((s, p) => s + p.dni, 0);
  assert.equal(dny, 196);
  assert.equal(plan.souhrn.ppm, 196 * 691);
  assert.equal(plan.ppm.start, pridejDny('2026-03-15', -42));
});

test('vícerčata: mateřská 37 týdnů', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', vicercata: true, prijemMatka: 30000, kdoPpm: 'matka', otcovska: false }, rules);
  const dny = plan.mesice.flatMap((m) => m.polozky).filter((p) => p.typ === 'ppm').reduce((s, p) => s + p.dni, 0);
  assert.equal(dny, 259);
});

test('otcovská 14 dní, 70 % redukovaného DVZ otce', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 30000, kdoPpm: 'matka', otcovska: true }, rules);
  assert.equal(plan.otec.otcovska.denni, 691);
  assert.equal(plan.souhrn.otcovska, 14 * 691);
});

test('střídání: otec převezme mateřskou nejdříve od 7. týdne a RP pak pobírá on', () => {
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 60000, kdoPpm: 'matka',
    otcovska: false, stridani: true, stridaniOdMesice: 1,
  }, rules);
  const prevzeti = plan.mesice.flatMap((m) => m.polozky).find((p) => p.typ === 'ppm' && p.kdo === 'otec');
  assert.ok(prevzeti, 'otec nepobírá mateřskou');
  assert.ok(plan.varovani.some((x) => x.typ === 'sestinedeli'));
  const rpMesic = plan.mesice.find((m) => m.polozky.some((p) => p.typ === 'rp'));
  assert.equal(rpMesic.polozky.find((p) => p.typ === 'rp').kdo, 'otec');
  // strop podle vyššího DVZ (otec)
  assert.ok(plan.rp.strop > 21000);
});

test('výše nad stropem se omezí a aplikace upozorní', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 0, prijemOtec: 0, kdoPpm: 'nikdo', rpVyse: 40000 }, rules);
  assert.equal(plan.rp.vyse, 15000);
  assert.ok(plan.varovani.some((x) => x.typ === 'nadStrop'));
});

test('bez mateřské začíná RP v měsíci narození a mzda otce se počítá', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 0, prijemOtec: 30000, kdoPpm: 'nikdo', otcovska: false, rpVyse: 10000 }, rules);
  assert.equal(plan.rp.odMesice, 0);
  assert.equal(plan.mesice[0].index, 0);
  assert.equal(plan.mesice[1].polozky.find((p) => p.typ === 'mzda' && p.kdo === 'otec').castka, 24590);
});

test('dřívější návrat do práce do 2 let → upozornění na limit jeslí', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 30000, kdoPpm: 'matka', navrat: true, navratOdMesice: 12 }, rules);
  assert.ok(plan.varovani.some((x) => x.typ === 'jesle'));
  const m12 = plan.mesice.find((m) => m.index === 12);
  assert.ok(m12.polozky.some((p) => p.typ === 'mzda' && p.kdo === 'matka'));
});
