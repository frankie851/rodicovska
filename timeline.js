// Časová osa po měsících jako SVG řetězec. Čistá funkce bez DOM, barvy přes CSS třídy.

const NF = new Intl.NumberFormat('cs-CZ');

export const TYPY = [
  { klic: 'ppm-matka', nazev: 'Mateřská – matka' },
  { klic: 'ppm-otec', nazev: 'Mateřská – otec' },
  { klic: 'otcovska', nazev: 'Otcovská' },
  { klic: 'rp', nazev: 'Rodičovský příspěvek' },
  { klic: 'mzda', nazev: 'Čistá mzda' },
];

const NAZEV_KDO = { matka: 'matka', otec: 'otec' };

export function klicPolozky(p) {
  if (p.typ === 'ppm') return `ppm-${p.kdo}`;
  return p.typ;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function popisPolozky(p) {
  const nazev = TYPY.find((t) => t.klic === klicPolozky(p))?.nazev ?? p.typ;
  const kdo = p.typ === 'rp' || p.typ === 'mzda' ? ` (${NAZEV_KDO[p.kdo]})` : '';
  const dni = p.dni && p.typ !== 'mzda' ? `, ${p.dni} dní` : '';
  return `${nazev}${kdo}: ${NF.format(p.castka)} Kč${dni}`;
}

/**
 * @param {object} plan výsledek planRodiny
 * @param {{sirka?: number, radek?: number}} volby sirka = skutečná šířka kontejneru v px
 */
export function svgOsa(plan, { sirka = 360, radek = 24 } = {}) {
  const sirkaPopisku = 76;
  const sirkaCastky = sirka < 420 ? 74 : 92;
  const mezera = 6;
  const x0 = sirkaPopisku;
  const sirkaPruhu = Math.max(40, sirka - sirkaPopisku - sirkaCastky - mezera);
  const maximum = Math.max(1, ...plan.mesice.map((m) => m.celkem));
  const vyska = plan.mesice.length * radek + 4;

  const radky = plan.mesice.map((m, i) => {
    const y = i * radek + 2;
    const tridy = ['radek'];
    if (m.index === 0) tridy.push('radek-porod');
    if (m.index === plan.rp.mesicVycerpani) tridy.push('radek-vycerpano');
    if (m.rok % 2 === 0) tridy.push('radek-sudy');

    let x = x0;
    const segmenty = m.polozky.map((p) => {
      const w = (p.castka / maximum) * sirkaPruhu;
      const r = `<rect class="seg seg-${klicPolozky(p)}" x="${x.toFixed(2)}" y="${y + 4}" width="${w.toFixed(2)}" height="${radek - 8}"><title>${esc(popisPolozky(p))}</title></rect>`;
      x += w;
      return r;
    }).join('');

    const popisek = m.popis;
    if (m.index < 0) tridy.push('radek-pred');
    const znacka = m.index === 0 ? '<tspan class="znacka"> ★</tspan>' : m.index === plan.rp.mesicVycerpani ? '<tspan class="znacka"> ✓</tspan>' : '';
    const titulek = `${m.popis}${m.index >= 0 ? `, ${m.index}. měsíc dítěte` : ', před porodem'}: celkem ${NF.format(m.celkem)} Kč`;

    return `<g class="${tridy.join(' ')}"><title>${esc(titulek)}</title>`
      + `<rect class="pozadi" x="0" y="${y}" width="${sirka}" height="${radek}"></rect>`
      + `<text class="popisek" x="4" y="${y + radek / 2}" dominant-baseline="central">${esc(popisek)}${znacka}</text>`
      + segmenty
      + `<text class="castka" x="${sirka - 4}" y="${y + radek / 2}" dominant-baseline="central" text-anchor="end">${NF.format(m.celkem)}</text>`
      + '</g>';
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" class="osa" width="${sirka}" height="${vyska}" viewBox="0 0 ${sirka} ${vyska}" role="img" aria-labelledby="osa-nadpis">`
    + `<title id="osa-nadpis">Příjem rodiny po měsících od mateřské do 3 let dítěte</title>`
    + radky
    + '</svg>';
}
