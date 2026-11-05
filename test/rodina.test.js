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

// Zadání uvádí 24 měsíců (23 × 15 000 + 5 000), to ale odporuje § 30 odst. 6 ZSSP: zbytek nižší než
// měsíční částka se vyplatí spolu s ní, tedy 22 × 15 000 + 20 000 za 23 měsíců (revize 5. 11. 2026, ROD-05).
test('bez DVZ, 15 000 Kč měsíčně → 350 000 Kč vyčerpáno za 23 měsíců (22 × 15 000 + 20 000)', () => {
  const rp = pravidlaRp(rules, '2026-06-01');
  const strop = stropRp({ redDvz: [], vicercata: false }, rp, rules);
  assert.equal(strop, 15000);
  const c = cerpaniRp({ celkem: rp.celkem, mesicniVyse: 15000, odMesice: 0 });
  assert.equal(c.vycerpano, 350000);
  assert.equal(c.mesice.length, 23);
  assert.equal(c.mesice.filter((m) => m.castka === 15000).length, 22);
  assert.equal(c.mesice.at(-1).castka, 20000);
  assert.equal(c.mesicVycerpani, 22);
  assert.equal(c.propadne, 0);
});

// Zadání uvádí 240 000 / 110 000 Kč, to ale odporuje § 30b odst. 1 písm. d) ZSSP: měsíc, v němž dítě
// dosáhne 3 let, se počítá celý, takže se čerpá v měsících 6–36 (31 měsíců). Revize 5. 11. 2026, ROD-01.
test('rodičovská od 6. měsíce po 8 000 Kč → do 3 let 248 000 Kč, propadne 102 000 Kč a aplikace upozorní', () => {
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 8000, odMesice: 6 });
  assert.equal(c.vycerpano, 248000);
  assert.equal(c.propadne, 102000);
  assert.equal(c.mesicVycerpani, null);

  // Celý plán: matka na mateřské 6 týdnů před porodem → RP od 6. měsíce dítěte.
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 40000,
    kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.odMesice, 6);
  assert.equal(plan.rp.vycerpano, 248000);
  assert.equal(plan.rp.propadne, 102000);
  const v = plan.varovani.find((x) => x.typ === 'propadnuti');
  assert.ok(v, 'chybí varování o propadnutí');
  assert.match(v.text, /102\s000/);
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

// Od 1. 1. 2027 se mateřská přepočítá podle hranic 2027 (§ 22 odst. 2 ZNP; revize 5. 11. 2026, ROD-03).
test('porod v lednu 2027 s nástupem v prosinci 2026 → mateřská podle hranic 2026 do 31. 12., od 1. 1. 2027 podle hranic 2027, RP 400 000', () => {
  const plan = planRodiny({ terminPorodu: '2027-01-20', prijemMatka: 200000, kdoPpm: 'matka' }, rules);
  assert.equal(plan.matka.ppm.hranice.rok, 2026);
  assert.equal(plan.matka.ppm.redDvz, 2857);
  assert.equal(plan.matka.ppm.denni, 2000); // 0,7 × 2857 = 1999,9 → 2000, jen do 31. 12. 2026
  assert.equal(plan.matka.ppm.poNovemRoce.redDvz, 3015);
  assert.equal(plan.matka.ppm.poNovemRoce.denni, 2111); // 0,7 × 3015 = 2110,5 → 2111 od 1. 1. 2027
  assert.equal(plan.souhrn.ppm, 411203); // 23 × 2 000 + 173 × 2 111
  assert.equal(plan.rp.celkem, 400000);
});

// 400 000 − 248 000 = 152 000 Kč (měsíce 6–36, § 30b odst. 1 písm. d) ZSSP; revize 5. 11. 2026, ROD-01).
test('narození od 1. 1. 2027 → 400 000 Kč, stejný scénář 8 000 Kč od 6. měsíce → propadne 152 000 Kč', () => {
  const plan = planRodiny({
    terminPorodu: '2027-03-15', prijemMatka: 30000, prijemOtec: 40000,
    kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.celkem, 400000);
  assert.equal(plan.rp.vycerpano, 248000);
  assert.equal(plan.rp.propadne, 152000);
  assert.ok(plan.varovani.some((x) => x.typ === 'novela400'));
});

test('vícerčata 2027 → 800 000 Kč', () => {
  assert.equal(pravidlaRp(rules, '2027-01-01').celkemVicercata, 800000);
});

test('návrh výše pro vyčerpání do 3 let', () => {
  // 350 000 / 31 měsíců (6–36, § 30b odst. 1 písm. d) ZSSP) = 11 290,32 → nahoru na stovky (revize 5. 11. 2026, ROD-01)
  assert.equal(navrhVyse(350000, 6, 36), 11300);
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 11300, odMesice: 6 });
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

// ---------- Regrese z revize 5. 11. 2026 ----------

// ROD-01: měsíc, v němž dítě dosáhne 3 let, se počítá celý (§ 30b odst. 1 písm. d) ZSSP).
test('ROD-01: měsíc 3. narozenin je poslední měsíc čerpání (cerpaniRp, měsíce 6–36)', () => {
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 8000, odMesice: 6, vekMesicu: 36 });
  assert.equal(c.vycerpano, 248000);
  assert.equal(c.propadne, 102000);
  assert.equal(c.mesice.length, 31);
  assert.equal(c.mesice.at(-1).mesic, 36);
});

test('ROD-01: plán končí březnem 2029 (měsíc 3. narozenin), propadne 102 000 Kč', () => {
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 40000,
    kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.propadne, 102000);
  const posledni = plan.mesice.at(-1);
  assert.equal(posledni.index, 36);
  assert.equal(posledni.rok, 2029);
  assert.equal(posledni.mesic, 3);
  assert.match(plan.varovani.find((x) => x.typ === 'propadnuti').text, /102\s000/);
});

test('ROD-01: návrh výše počítá s 31 měsíci (6–36) → 11 300 Kč', () => {
  assert.equal(navrhVyse(350000, 6, 36), 11300);
});

test('ROD-01: bez mateřské 9 000 Kč měsíčně → 37 měsíců (bře 2026 – bře 2029), 333 000 Kč', () => {
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 0, prijemOtec: 0, kdoPpm: 'nikdo', otcovska: false, rpVyse: 9000,
  }, rules);
  assert.equal(plan.rp.mesiceCerpani, 37);
  assert.equal(plan.rp.vycerpano, 333000);
  assert.equal(plan.rp.propadne, 17000);
});

// ROD-02: souběžně s mateřskou náleží RP ve výši rozdílu, je-li vyšší (§ 30b odst. 3 ZSSP), od měsíce narození.
const rpVMesici = (plan, index) => plan.mesice.find((m) => m.index === index)?.polozky.find((p) => p.typ === 'rp')?.castka;

test('ROD-02: nízká mateřská (346 Kč/den) → RP 15 000 Kč doplácí rozdíl od měsíce narození', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 15000, kdoPpm: 'matka', otcovska: false, rpVyse: 15000 }, rules);
  assert.equal(plan.matka.ppm.denni, 346);
  assert.equal(rpVMesici(plan, -1), undefined, 'RP nikdy před narozením');
  assert.equal(rpVMesici(plan, 0), 4274); // 15 000 − 31 × 346
  assert.equal(rpVMesici(plan, 1), 4620); // 15 000 − 30 × 346
  assert.equal(rpVMesici(plan, 5), 9810); // 15 000 − 15 × 346
  assert.equal(rpVMesici(plan, 6), 15000);
  assert.equal(plan.rp.odMesice, 0);
  // měsíc se souběhem ukazuje obě položky
  const m0 = plan.mesice.find((m) => m.index === 0);
  assert.ok(m0.polozky.some((p) => p.typ === 'ppm') && m0.polozky.some((p) => p.typ === 'rp'));
});

test('ROD-02: mateřskou čerpá otec od 7. týdne → RP v měsíci narození celá, v dubnu rozdíl', () => {
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 0, narokMatka: false, prijemOtec: 50000,
    kdoPpm: 'otec', otcovska: false, rpVyse: 34440,
  }, rules);
  assert.equal(plan.ppm.start, '2026-04-26');
  assert.equal(plan.rp.strop, 34440);
  assert.equal(rpVMesici(plan, 0), 34440);
  assert.equal(rpVMesici(plan, 1), 28700); // 34 440 − 5 × 1 148
});

test('ROD-02: mateřská vyšší než zvolená RP → v měsících 0–5 žádná RP, čerpání od 6. měsíce', () => {
  const plan = planRodiny({
    terminPorodu: '2026-03-15', prijemMatka: 30000, prijemOtec: 40000, kdoPpm: 'matka', otcovska: false, rpVyse: 8000,
  }, rules);
  assert.equal(plan.rp.odMesice, 6);
  for (let i = 0; i <= 5; i++) assert.equal(rpVMesici(plan, i), undefined, `RP v měsíci ${i}`);
});

// ROD-03: dávka, na kterou vznikl nárok před 1. lednem a trvá, se od 1. ledna přepočítá podle nových
// redukčních hranic (§ 22 odst. 2 ZNP); strop RP z DVZ redukovaného hranicemi roku narození (§ 30 odst. 3 ZSSP).
const ppmVMesici = (plan, rok, mesic) => plan.mesice.find((m) => m.rok === rok && m.mesic === mesic)
  .polozky.filter((p) => p.typ === 'ppm').reduce((s, p) => s + p.castka, 0);

test('ROD-03: mateřská přes Nový rok (80 000 Kč) → do 31. 12. 1 524 Kč/den, od 1. 1. 2027 1 578 Kč/den', () => {
  const plan = planRodiny({ terminPorodu: '2027-01-20', prijemMatka: 80000, kdoPpm: 'matka', otcovska: false }, rules);
  assert.equal(plan.ppm.start, '2026-12-09');
  assert.equal(ppmVMesici(plan, 2026, 12), 23 * 1524);
  assert.equal(ppmVMesici(plan, 2027, 1), 31 * 1578);
  assert.equal(plan.souhrn.ppm, 308046);
  assert.equal(plan.matka.ppm.poNovemRoce.denni, 1578);
  assert.equal(plan.rp.strop, 47334); // 0,7 × 30 × 2 254 (DVZ redukovaný hranicemi 2027)
});

test('ROD-03: mateřská přes Nový rok (200 000 Kč) → 411 203 Kč', () => {
  const plan = planRodiny({ terminPorodu: '2027-01-20', prijemMatka: 200000, kdoPpm: 'matka', otcovska: false }, rules);
  assert.equal(plan.souhrn.ppm, 411203);
});

test('ROD-03: otcovská 28. 12. 2026 – 10. 1. 2027 (80 000 Kč) → 4 × 1 524 + 10 × 1 578 = 21 876 Kč', () => {
  const plan = planRodiny({ terminPorodu: '2026-12-24', prijemOtec: 80000, otcovska: true, otcovskaOdDne: 4 }, rules);
  assert.equal(plan.otec.otcovska.start, '2026-12-28');
  assert.equal(plan.otec.otcovska.konec, '2027-01-10');
  assert.equal(plan.souhrn.otcovska, 21876);
});

test('ROD-03 kontrola: mateřská celá v jednom roce se nemění (135 436 Kč)', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 30000, kdoPpm: 'matka', otcovska: false }, rules);
  assert.equal(plan.souhrn.ppm, 135436);
  assert.equal(plan.matka.ppm.poNovemRoce, undefined);
});

// ROD-04: dítě do 2 let smí být v jeslích nebo školce do 120 hodin v kalendářním měsíci
// (§ 31 odst. 3 písm. a) ZSSP ve znění zákona č. 84/2025 Sb., od 1. 5. 2025).
test('ROD-04: limit docházky do jeslí 120 hodin měsíčně', () => {
  assert.equal(rules.jesleHodinMesicne, 120);
  const plan = planRodiny({ terminPorodu: '2026-05-10', prijemMatka: 30000, kdoPpm: 'matka', navrat: true, navratOdMesice: 10 }, rules);
  const v = plan.varovani.find((x) => x.typ === 'jesle');
  assert.match(v.text, /120 hodin/);
  assert.doesNotMatch(v.text, /92/);
});

// ROD-05: zbývá-li po odečtení aktuální měsíční částky méně než tato částka, vyplatí se zbytek spolu s ní
// (§ 30 odst. 6 ZSSP).
test('ROD-05: 350 000 Kč po 15 000 Kč → 23 měsíců, poslední 20 000 Kč', () => {
  const c = cerpaniRp({ celkem: 350000, mesicniVyse: 15000, odMesice: 0, vekMesicu: 36 });
  assert.equal(c.mesice.length, 23);
  assert.equal(c.mesice.at(-1).castka, 20000);
  assert.equal(c.mesicVycerpani, 22);
  assert.equal(c.vycerpano, 350000);
  assert.equal(c.propadne, 0);
});

test('ROD-05: vícerčata 700 000 Kč po 30 000 Kč od 1. 6. 2026 → vyčerpání duben 2028, poslední 40 000 Kč', () => {
  const plan = planRodiny({
    terminPorodu: '2026-06-01', prijemMatka: 0, prijemOtec: 0, kdoPpm: 'nikdo', vicercata: true, otcovska: false, rpVyse: 30000,
  }, rules);
  assert.equal(plan.rp.mesicVycerpani, 22);
  const m = plan.mesice.find((x) => x.index === 22);
  assert.equal(m.rok, 2028);
  assert.equal(m.mesic, 4);
  const rpPolozky = plan.mesice.flatMap((x) => x.polozky).filter((p) => p.typ === 'rp');
  assert.equal(rpPolozky.at(-1).castka, 40000);
  assert.equal(plan.rp.mesiceCerpani, 23);
});

test('ROD-05 + ROD-02: zbytek se přičte i ke skutečné částce měsíce; nízká mateřská → vyčerpání v měsíci 26', () => {
  const plan = planRodiny({ terminPorodu: '2026-03-15', prijemMatka: 15000, kdoPpm: 'matka', otcovska: false, rpVyse: 15000 }, rules);
  assert.equal(plan.rp.mesicVycerpani, 26);
  assert.equal(plan.rp.vycerpano, 350000);
  assert.equal(rpVMesici(plan, 26), 15000 + 3128); // 350 000 − 31 872 (měsíce 0–5) − 21 × 15 000
});

// ROD-06: zvýšení na 400 000 / 800 000 Kč je zákon č. 152/2026 Sb. (účinnost 1. 1. 2027), ne „novela schválená Senátem“.
test('ROD-06: záznam RP od 1. 1. 2027 cituje zákon č. 152/2026 Sb.', () => {
  const r = rules.rodicovsky.find((x) => x.narozeniOd === '2027-01-01');
  assert.match(r.zdroj, /152\/2026/);
  assert.ok(/zakonyprolidi\.cz\/cs\/2026-152|e-sbirka\.gov\.cz\/sb\/2026\/152/.test(r.url), r.url);
  assert.doesNotMatch(r.pozn, /Senát/);
  const plan = planRodiny({ terminPorodu: '2027-04-04' }, rules);
  assert.match(plan.varovani.find((x) => x.typ === 'novela400').text, /152\/2026 Sb\./);
});
