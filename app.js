import {
  planRodiny, VYCHOZI_VSTUP, formatCz, pridejDny, prvniDenMesice, popisMesice,
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

// ---------- localStorage (vždy v try/catch) ----------
function nactiUlozeny() {
  try {
    const s = window.localStorage.getItem(KLIC);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
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

function prectiFormular() {
  for (const el of form().elements) {
    if (!el.name || !(el.name in VYCHOZI_VSTUP)) continue;
    if (el.type === 'checkbox') stav[el.name] = el.checked;
    else if (el.type === 'number' || el.name === 'ppmTydnuPred') stav[el.name] = el.value === '' ? 0 : Number(el.value);
    else stav[el.name] = el.value;
  }
  form().elements.ppmTydnuPred.disabled = stav.kdoPpm !== 'matka';
  form().elements.otcovskaOdDne.disabled = !stav.otcovska;
  form().elements.stridaniOdMesice.disabled = !stav.stridani;
  form().elements.navratOdMesice.disabled = !stav.navrat;
}

// ---------- Vykreslení ----------
function prepocitej() {
  const min = [...rules.rodicovsky].map((r) => r.narozeniOd).sort()[0];
  const varovani = $('#varovani');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(stav.terminPorodu || '') || stav.terminPorodu < min) {
    varovani.innerHTML = `<li class="pozor"><strong>Zadejte termín porodu</strong> od ${formatCz(min)}. Pro dřívější narození platí jiná pravidla.</li>`;
    $('#osa').innerHTML = '';
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

function vykresliTabulku() {
  $('#tabulka tbody').innerHTML = plan.mesice.map((m) => `<tr>
    <td>${esc(m.popis)}${m.index === 0 ? ' ★' : ''}</td>
    <td>${NF.format(m.davky)}</td><td>${NF.format(m.mzdy)}</td><td><strong>${NF.format(m.celkem)}</strong></td></tr>`).join('');
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
    plan.matka.ppm && `matka ${kc(plan.matka.ppm.denni)} denně`,
    plan.otec.ppm && `otec ${kc(plan.otec.ppm.denni)} denně`,
  ].filter(Boolean).join(', ');
  const vycerpani = r.mesicVycerpani != null
    ? popisMesiceDitete(r.mesicVycerpani)
    : 'nevyčerpá se do 3 let';

  $('#souhrn').innerHTML = [
    dlazdice('Dávky celkem dostaneme', kc(s.davky), 'mateřská + otcovská + rodičovská'),
    dlazdice('Mateřská', kc(s.ppm), ppmPozn || 'bez nároku'),
    dlazdice('Otcovská', kc(s.otcovska), plan.otec.otcovska ? `${kc(plan.otec.otcovska.denni)} denně, 14 dní` : 'nečerpá se'),
    dlazdice('Rodičovský příspěvek vyčerpán', kc(r.vycerpano), `z ${kc(r.celkem)}, po ${kc(r.vyse)} měsíčně`),
    dlazdice('Rodičovská se vyčerpá', vycerpani, `${r.mesiceCerpani} měsíců čerpání`),
    dlazdice('Propadne k 3. narozeninám', kc(r.propadne), r.propadne > 0 ? 'zvyšte měsíční výši' : 'nic nepropadne', r.propadne > 0 ? 'pozor' : ''),
    dlazdice('Příjem rodiny za celé období', kc(s.celkem), `z toho orientační čisté mzdy ${kc(s.mzdy)}`),
  ].join('');

  const radekDvz = (nazev, info) => (info
    ? `<li>${nazev}: rozhodné období ${info.dny} dní, DVZ ${NF2.format(info.dvz)} Kč → redukovaný DVZ ${NF.format(info.redDvz)} Kč (hranice ${info.hranice.rok}: ${NF.format(info.hranice.h1)} / ${NF.format(info.hranice.h2)} / ${NF.format(info.hranice.h3)} Kč) → 70 % = ${kc(info.denni)} denně, nástup ${formatCz(info.datum)}.</li>`
    : '');
  $('#detail').innerHTML = `<ul>
    ${radekDvz('Mateřská – matka', plan.matka.ppm)}
    ${radekDvz('Mateřská – otec', plan.otec.ppm)}
    ${radekDvz('Otcovská', plan.otec.otcovska)}
    ${plan.ppm ? `<li>Období mateřské: ${formatCz(plan.ppm.start)} – ${formatCz(plan.ppm.konec)}.</li>` : ''}
    <li>Strop rodičovské = max(${kc(stav.vicercata ? r.minStropVicercata : r.minStrop)}; ${stav.vicercata ? '2 × ' : ''}70 % × 30 × vyšší redukovaný DVZ rodičů) = ${kc(r.strop)} měsíčně.</li>
    <li>Rodičovská se nevyplácí souběžně s mateřskou, začíná v kalendářním měsíci po jejím skončení. Čerpá se nejdéle do 3 let dítěte, zbytek propadne.</li>
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
  const zacatekRp = prvniDenMesice(B, plan.rp.odMesice);
  polozky.push([`Od ${popisMesice(Number(zacatekRp.slice(0, 4)), Number(zacatekRp.slice(5, 7)))}`, `Rodičovský příspěvek: žádost na Úřadu práce ČR (online přes portál MPSV, datovou schránkou nebo osobně). Chcete-li víc než ${kc(plan.rp.minStrop)} měsíčně, přiložte Potvrzení o denním vyměřovacím základu od ČSSZ.`]);
  polozky.push(['Kdykoli během čerpání', `Výši rodičovské lze měnit jednou za ${rules.rpZmenaMesicu} měsíce, na písemnou žádost a ne zpětně.`]);
  if (plan.navratOd) {
    polozky.push([`Před ${formatCz(plan.navratOd)}`, `Návrat do práce domluvte se zaměstnavatelem. U dítěte do 2 let hlídejte limit ${rules.jesleHodinMesicne} hodin měsíčně v jeslích nebo školce.`]);
  }
  polozky.push(['U zaměstnavatele', 'Uplatněte daňové zvýhodnění na dítě (v čisté mzdě zde není započteno).']);
  polozky.push(['Narodí-li se další dítě', 'Nahlaste to Úřadu práce. Nárok na rodičovskou na starší dítě zaniká, ale nevyčerpaný zbytek lze vyplatit jednorázově.']);

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
