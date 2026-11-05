// Referenční hodnoty z oficiální kalkulačky MPSV (K_PPM_2026.xlsx, K_Otcovská_2026.xlsx,
// https://mpsv.gov.cz/kalkulacka-pro-vypocet-davek-v-roce-2026), přepočítané v LibreOffice 5. 11. 2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dvz, redukovanyDvz, denniDavka } from '../rodina.js';

const rules = JSON.parse(readFileSync(new URL('../rules.json', import.meta.url), 'utf8'));
const H = rules.redukcniHranice['2026'];

const MPSV = [
  // měsíční příjem, DVZ, redukovaný DVZ, PPM 196 dní, otcovská 14 dní
  [30000, 986.30, 987, 135436, 9674],
  [50000, 1643.84, 1640, 225008, 16072],
  [50279, 1653.01, 1646, 225988, null], // DVZ se zaokrouhluje na haléře před redukcí
  [80000, 2630.14, 2177, 298704, 21336],
  [150000, 4931.51, 2857, 392000, 28000],
];

for (const [prijem, dvzMpsv, redMpsv, ppm196, otc14] of MPSV) {
  test(`shoda s kalkulačkou MPSV 2026: příjem ${prijem} Kč`, () => {
    const d = dvz(prijem, 365);
    assert.equal(d, dvzMpsv);
    const r = redukovanyDvz(d, H, rules.ppm.redukce);
    assert.equal(r, redMpsv);
    assert.equal(denniDavka(r, rules.ppm.sazba) * 196, ppm196);
    if (otc14 != null) assert.equal(denniDavka(r, rules.otcovska.sazba) * 14, otc14);
  });
}
