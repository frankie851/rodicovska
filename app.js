import {
  planRodiny, VYCHOZI_VSTUP, formatCz, pridejDny, prvniDenMesice, popisMesice, overVstup, popisDenniDavky,
} from './rodina.js';
import { svgOsa, TYPY } from './timeline.js';

const KLIC = 'rodicovska-plan-v1';
const NF = new Intl.NumberFormat('cs-CZ');
const NF2 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kc = (x) => `${NF.format(Math.round(x))} Kč`;
const $ = (s) => document.querySelector(s);

let rules = null;
let stav = { ...VYCHOZI_VSTUP };
let plan = null;
let chyby = {};

// ---------- localStorage (vždy v try/catch) ----------
function nactiUlozeny() {
  try {
    const s = window.localStorage.getItem(KLIC);
    return s ? ocistiUlozeny(JSON.parse(s)) : null;
  } catch {
    return null;
  }
}

/** Z uloženého plánu převezme jen známé klíče se správným typem a rozsahem, ostatní zůstanou výchozí. */
function ocistiUlozeny(ulozeny) {
  if (!ulozeny || typeof ulozeny !== 'object') return null;
  const vysledek = {};
  for (const [klic, vychozi] of Object.entries(VYCHOZI_VSTUP)) {
    const h = ulozeny[klic];
    if (h === undefined) continue;
    let ok;
    if (klic === 'kdoPpm') ok = ['matka', 'otec', 'nikdo'].includes(h);
    else if (klic === 'terminPorodu') ok = typeof h === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(h);
    else if (klic === 'rpVyse') ok = h === null || (Number.isFinite(h) && h >= 0);
    else if (typeof vychozi === 'boolean') ok = typeof h === 'boolean';
    else if (typeof vychozi === 'number') ok = Number.isFinite(h) && h >= 0;
    else ok = typeof h === typeof vychozi;
    if (ok) vysledek[klic] = h;
  }
  return vysledek;
}
function uloz() {
  try {
    window.localStorage.setItem(KLIC, JSON.stringify(stav));
    return true;
  } catch {
    return false;
  }
}
function smaz() {
  try {
    window.localStorage.removeItem(KLIC);
    return true;
  } catch {
    return false;
  }
}

// ---------- Formulář ----------
const form = () => $('#formular');

function vyplnFormular() {
  for (const el of form().elements) {
    if (!el.name || !(el.name in stav)) continue;
    if (el.type === 'checkbox') el.checked = Boolean(stav[el.name]);
    else el.value = stav[el.name] ?? '';
  }
}

// Pole, u nichž se ukazuje chybová hláška (kontejner s role="alert", propojený přes aria-describedby).
function pripravChyboveHlasky() {
  for (const el of form().elements) {
    if (!el.name || !(el.name in VYCHOZI_VSTUP) || el.type === 'checkbox' || el.tagName === 'SELECT') continue;
    const id = `chyba-${el.name}`;
    if (document.getElementById(id)) continue;
    const hlaska = document.createElement('span');
    hlaska.id = id;
    hlaska.className = 'chyba-pole';
    hlaska.setAttribute('role', 'alert');
    (el.closest('label') || el.parentElement).appendChild(hlaska);
    el.setAttribute('aria-describedby', [el.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
  }
}

function ukazChyby() {
  for (const el of form().elements) {
    const hlaska = el.name && document.getElementById(`chyba-${el.name}`);
    if (!hlaska) continue;
    const text = chyby[el.name] || '';
    hlaska.textContent = text;
    if (text) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
}

/** Číselná pole (type="number") kontroluje prohlížeč: nečitelná, prázdná nebo mimo rozsah hodnota je chyba. */
function chybaCiselnehoPole(el) {
  const v = el.validity;
  if (v.badInput || v.rangeUnderflow || v.rangeOverflow || v.stepMismatch || el.value === '') {
    return `Zadejte celé číslo od ${el.min} do ${el.max}.`;
  }
  return null;
}

function prectiFormular() {
  const hodnoty = { ...stav };
  const chybyCisel = {};
  const el = form().elements;
  el.ppmTydnuPred.disabled = el.kdoPpm.value !== 'matka';
  el.otcovskaOdDne.disabled = !el.otcovska.checked;
  el.stridaniOdMesice.disabled = !el.stridani.checked;
  el.navratOdMesice.disabled = !el.navrat.checked;
  for (const e of el) {
    if (!e.name || !(e.name in VYCHOZI_VSTUP)) continue;
    if (e.type === 'checkbox') hodnoty[e.name] = e.checked;
    else if (e.type === 'number') {
      const chyba = e.disabled ? null : chybaCiselnehoPole(e);
      if (chyba) chybyCisel[e.name] = chyba;
      else if (e.value !== '') hodnoty[e.name] = Number(e.value);
    } else if (e.name === 'ppmTydnuPred') hodnoty[e.name] = Number(e.value);
    else hodnoty[e.name] = e.value;
  }
  const vysledek = overVstup(hodnoty, rules);
  chyby = { ...vysledek.chyby, ...chybyCisel };
  // Do stavu (a tím do uloženého plánu) jdou jen platné hodnoty.
  for (const [klic, hodnota] of Object.entries(vysledek.vstup)) {
    if (!chyby[klic]) stav[klic] = hodnota;
  }
  ukazChyby();
}

// ---------- Vykreslení ----------
/** Při chybném zadání nesmí pod hláškou zůstat výsledky předchozího plánu. */
function vyprazdniVysledky() {
  plan = null;
  for (const s of ['#osa', '#souhrn', '#detail', '#tabulka tbody', '#checklist']) $(s).innerHTML = '';
  $('#rpVyseText').textContent = '–';
  $('#rpVyseInfo').textContent = '–';
  const seznam = Object.values(chyby).map((t) => `<li class="pozor">${esc(t)}</li>`).join('');
  $('#varovani').innerHTML = `<li class="pozor"><strong>Opravte zadání.</strong> Výsledky se ukážou, až budou všechna pole vyplněná správně.</li>${seznam}`;
}

function prepocitej() {
  if (Object.keys(chyby).length) {
    vyprazdniVysledky();
    return;
  }
  plan = planRodiny(stav, rules);
  vykresliOvladani();
  vykresliVarovani();
  vykresliOsu();
  vykresliTabulku();
  vykresliSouhrn();
  vykresliChecklist();
}

function vykresliOvladani() {
  const r = plan.rp;
  const slider = $('#rpVyse');
  slider.max = String(r.strop);
  slider.min = String(Math.min(1000, r.strop));
  slider.value = String(r.vyse);
  $('#rpVyseText').textContent = kc(r.vyse);
  const zacatek = plan.mesice.find((m) => m.index === r.odMesice);
  $('#rpVyseInfo').textContent = `Celkem ${kc(r.celkem)}, váš strop ${kc(r.strop)} měsíčně. `
    + `Čerpání od ${zacatek ? zacatek.popis : `${r.odMesice}. měsíce`} (${r.odMesice}. měsíc dítěte). `
    + `Výši lze měnit jednou za ${rules.rpZmenaMesicu} měsíce.`;
}

function vykresliVarovani() {
  $('#varovani').innerHTML = plan.varovani.map((v) => {
    const tucne = v.typ === 'propadnuti' ? '<strong>Část rodičovské propadne.</strong> ' : '';
    return `<li class="${v.uroven}">${tucne}${esc(v.text)}</li>`;
  }).join('');
}

function vykresliOsu() {
  const obal = $('#osa');
  const sirka = Math.max(280, Math.floor(obal.clientWidth || 328));
  obal.innerHTML = svgOsa(plan, { sirka });
}

const NAZEV_DAVKY = { ppm: 'mateřská', otcovska: 'otcovská', rp: 'rodičovská' };

function vykresliTabulku() {
  // V měsících se souběhem (např. mateřská + rodičovská ve výši rozdílu) se ukáže rozpad dávek.
  const rozpad = (m) => {
    const davky = m.polozky.filter((p) => p.typ !== 'mzda');
    return davky.length > 1
      ? `<br><small>${davky.map((p) => `${NAZEV_DAVKY[p.typ]} ${NF.format(p.castka)}`).map(esc).join(' + ')}</small>`
      : '';
  };
  $('#tabulka tbody').innerHTML = plan.mesice.map((m) => `<tr>
    <td>${esc(m.popis)}${m.index === 0 ? ' ★' : ''}</td>
    <td>${NF.format(m.davky)}${rozpad(m)}</td><td>${NF.format(m.mzdy)}</td><td><strong>${NF.format(m.celkem)}</strong></td></tr>`).join('');
}

function dlazdice(nazev, hodnota, pozn = '', trida = '') {
  return `<div class="dlazdice ${trida}"><div class="nazev">${esc(nazev)}</div><div class="hodnota">${esc(hodnota)}</div>${pozn ? `<div class="pozn">${esc(pozn)}</div>` : ''}</div>`;
}

function popisMesiceDitete(index) {
  const m = plan.mesice.find((x) => x.index === index);
  return m ? `${m.popis} (${index}. měsíc dítěte)` : `${index}. měsíc dítěte`;
}

function vykresliSouhrn() {
  const s = plan.souhrn;
  const r = plan.rp;
  const ppmPozn = [
    plan.matka.ppm && `matka ${popisDenniDavky(plan.matka.ppm)}`,
    plan.otec.ppm && `otec ${popisDenniDavky(plan.otec.ppm)}`,
  ].filter(Boolean).join(', ');
  const vycerpani = r.mesicVycerpani != null
    ? popisMesiceDitete(r.mesicVycerpani)
    : 'nevyčerpá se do 3 let';

  $('#souhrn').innerHTML = [
    dlazdice('Dávky celkem dostaneme', kc(s.davky), 'mateřská + otcovská + rodičovská'),
    dlazdice('Mateřská', kc(s.ppm), ppmPozn || 'bez nároku'),
    dlazdice('Otcovská', kc(s.otcovska), plan.otec.otcovska ? `${popisDenniDavky(plan.otec.otcovska)}, 14 dní` : 'nečerpá se'),
    dlazdice('Rodičovský příspěvek vyčerpán', kc(r.vycerpano), `z ${kc(r.celkem)}, po ${kc(r.vyse)} měsíčně`),
    dlazdice('Rodičovská se vyčerpá', vycerpani, `${r.mesiceCerpani} měsíců čerpání`),
    dlazdice('Propadne k 3. narozeninám', kc(r.propadne), r.propadne > 0 ? 'zvyšte měsíční výši' : 'nic nepropadne', r.propadne > 0 ? 'pozor' : ''),
    dlazdice('Příjem rodiny za celé období', kc(s.celkem), `z toho orientační čisté mzdy ${kc(s.mzdy)}`),
  ].join('');

  const hraniceText = (h) => `hranice ${h.rok}: ${NF.format(h.h1)} / ${NF.format(h.h2)} / ${NF.format(h.h3)} Kč`;
  const poNovemRoce = (info) => (info.poNovemRoce
    ? ` Od ${formatCz(info.poNovemRoce.od)} se dávka přepočítá podle nových hranic (§ 22 odst. 2 ZNP): redukovaný DVZ ${NF.format(info.poNovemRoce.redDvz)} Kč (${hraniceText(info.poNovemRoce.hranice)}) → ${kc(info.poNovemRoce.denni)} denně.`
    : '');
  const radekDvz = (nazev, info) => (info
    ? `<li>${nazev}: rozhodné období ${info.dny} dní, DVZ ${NF2.format(info.dvz)} Kč → redukovaný DVZ ${NF.format(info.redDvz)} Kč (${hraniceText(info.hranice)}) → 70 % = ${kc(info.denni)} denně, nástup ${formatCz(info.datum)}.${poNovemRoce(info)}</li>`
    : '');
  $('#detail').innerHTML = `<ul>
    ${radekDvz('Mateřská – matka', plan.matka.ppm)}
    ${radekDvz('Mateřská – otec', plan.otec.ppm)}
    ${radekDvz('Otcovská', plan.otec.otcovska)}
    ${plan.ppm ? `<li>Období mateřské: ${formatCz(plan.ppm.start)} – ${formatCz(plan.ppm.konec)}.</li>` : ''}
    <li>Strop rodičovské = max(${kc(stav.vicercata ? r.minStropVicercata : r.minStrop)}; ${stav.vicercata ? '2 × ' : ''}70 % × 30 × vyšší redukovaný DVZ rodičů) = ${kc(r.strop)} měsíčně.</li>
    <li>Souběžně s mateřskou náleží rodičovská jen ve výši rozdílu, je-li zvolená výše vyšší než mateřská za daný měsíc (§ 30b odst. 3 ZSSP). Čerpá se nejdéle do 3 let dítěte, zbytek propadne.</li>
    <li>Čistá mzda: sociální 7,1 %, zdravotní 4,5 %, daň 15 % po slevě na poplatníka. Daňové zvýhodnění na dítě ani další slevy se nepočítají.</li>
  </ul>`;
}

function vykresliChecklist() {
  const B = stav.terminPorodu;
  const polozky = [];
  if (plan.ppm && plan.vstup.kdoPpm === 'matka') {
    polozky.push([`Do ${formatCz(plan.ppm.start)}`, 'Ošetřující gynekolog vystaví žádost o peněžitou pomoc v mateřství (nástup 8 až 6 týdnů před termínem). Dávku vyplácí ČSSZ, postup předání ověřte u zaměstnavatele nebo na cssz.cz.']);
  }
  polozky.push(['Po porodu', 'Rodný list vystaví matrika podle místa narození. Dítě co nejdříve nahlaste zdravotní pojišťovně.']);
  if (plan.otec.otcovska) {
    polozky.push([`Nástup nejpozději ${formatCz(pridejDny(B, rules.otcovska.nastupDoDne))}`, 'Otcovská: žádost na tiskopisu ČSSZ podejte přes zaměstnavatele. Nástup je možný do 6 týdnů od narození.']);
  }
  if (plan.otec.ppm) {
    polozky.push([`Od ${formatCz(plan.otec.ppm.datum)}`, 'Převzetí mateřské otcem: písemná dohoda s matkou a žádost o PPM přes zaměstnavatele. Nejdříve od 7. týdne po porodu, aspoň na 7 dní.']);
  }
  const popisIso = (iso) => popisMesice(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)));
  const mesicNarozeni = prvniDenMesice(B, 0);
  const zacatekRp = prvniDenMesice(B, plan.rp.odMesice);
  polozky.push([`Od ${popisIso(mesicNarozeni)} (měsíc narození)`, `Rodičovský příspěvek: žádost na Úřadu práce ČR (online přes portál MPSV, datovou schránkou nebo osobně) lze podat hned po narození. Podle plánu náleží od ${popisIso(zacatekRp)}; výplatu lze uplatnit nejvýš 3 měsíce zpětně (§ 54 odst. 2 ZSSP), starší měsíce propadnou. Chcete-li víc než ${kc(plan.rp.minStrop)} měsíčně, přiložte Potvrzení o denním vyměřovacím základu od ČSSZ.`]);
  polozky.push(['Kdykoli během čerpání', `Výši rodičovské lze měnit jednou za ${rules.rpZmenaMesicu} měsíce, na písemnou žádost a ne zpětně.`]);
  if (plan.navratOd) {
    polozky.push([`Před ${formatCz(plan.navratOd)}`, `Návrat do práce domluvte se zaměstnavatelem. U dítěte do 2 let hlídejte limit ${rules.jesleHodinMesicne} hodin měsíčně v dětské skupině, mateřské škole nebo obdobném zařízení.`]);
  }
  polozky.push(['U zaměstnavatele', 'Uplatněte daňové zvýhodnění na dítě (v čisté mzdě zde není započteno).']);
  polozky.push(['Narodí-li se další dítě', 'Nahlaste to Úřadu práce. Nárok na rodičovskou na starší dítě zaniká, ale nevyčerpaný zbytek lze vyplatit jednorázově, lze-li aspoň jednomu rodiči stanovit DVZ nebo je-li OSVČ (§ 30a odst. 1 ZSSP).']);

  const treti = pridejDny(prvniDenMesice(B, plan.rp.vekMesicu + 1), -1); // konec měsíce 3. narozenin
  polozky.push([`Do ${formatCz(treti)}`, 'Měsíc 3. narozenin je poslední měsíc čerpání rodičovské. Co do té doby nevyčerpáte, propadne.']);

  $('#checklist').innerHTML = polozky.map(([kdy, co]) => `<li><span class="kdy">${esc(kdy)}:</span> ${esc(co)}</li>`).join('');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Start ----------
async function start() {
  try {
    const odpoved = await fetch('rules.json', { cache: 'no-cache' });
    rules = await odpoved.json();
  } catch {
    $('#varovani').innerHTML = '<li class="pozor"><strong>Nepodařilo se načíst pravidla (rules.json).</strong></li>';
    return;
  }

  const vychoziTermin = pridejDny(new Date().toISOString().slice(0, 10), 150);
  const ulozeny = nactiUlozeny();
  stav = { ...VYCHOZI_VSTUP, terminPorodu: vychoziTermin, ...(ulozeny || {}) };
  if (ulozeny) $('#ulozeniStav').textContent = 'Načten uložený plán.';

  $('#legenda').innerHTML = TYPY.map((t) => `<li><span class="vzorek seg-${t.klic}" aria-hidden="true"></span>${t.nazev}</li>`).join('');
  $('#overeno').textContent = formatCz(rules.overeno);
  $('#zdroje').innerHTML = rules.zdroje.map((z) => `<li><a href="${esc(z.url)}" rel="noopener" target="_blank">${esc(z.nazev)}</a></li>`).join('');

  form().elements.otcovskaOdDne.max = String(rules.otcovska.nastupDoDne);
  pripravChyboveHlasky();
  vyplnFormular();
  prectiFormular();
  prepocitej();

  // Některá pole leží mimo <form> (atribut form="formular"), proto posloucháme na dokumentu.
  const zmena = (e) => { if (e.target.form === form()) { prectiFormular(); prepocitej(); } };
  document.addEventListener('input', zmena);
  document.addEventListener('change', zmena);
  $('#rpVyse').addEventListener('input', (e) => { stav.rpVyse = Number(e.target.value); prepocitej(); });
  $('#btnNavrh').addEventListener('click', () => { stav.rpVyse = null; prepocitej(); });
  $('#btnMax').addEventListener('click', () => { stav.rpVyse = plan ? plan.rp.strop : null; prepocitej(); });
  $('#btnUlozit').addEventListener('click', () => {
    $('#ulozeniStav').textContent = uloz() ? 'Plán je uložený v tomto prohlížeči.' : 'Uložení se nepodařilo (prohlížeč úložiště blokuje).';
  });
  $('#btnSmazat').addEventListener('click', () => {
    $('#ulozeniStav').textContent = smaz() ? 'Uložený plán je smazaný.' : 'Smazání se nepodařilo.';
  });

  let posledniSirka = 0;
  const ro = new ResizeObserver(() => {
    const w = $('#osa').clientWidth;
    if (plan && Math.abs(w - posledniSirka) > 2) { posledniSirka = w; vykresliOsu(); }
  });
  ro.observe($('#osa'));
}

start();
