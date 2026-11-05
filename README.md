# Rodičovská pro celou rodinu

Statický web v češtině pro budoucí rodiče. Z hrubých příjmů obou rodičů odhadne denní vyměřovací
základ (DVZ), mateřskou (peněžitou pomoc v mateřství, PPM) a otcovskou. Na časové ose od nástupu na
mateřskou do 3 let dítěte rozvrhne mateřskou, otcovskou a rodičovský příspěvek (RP) a ukáže měsíční
příjem rodiny. Když by část rodičovské do 3 let nevyčerpali, upozorní je.

**Orientační výpočet, nejde o rozhodnutí úřadu.** Počítá se se zaměstnanci (ne s OSVČ) a s porodem v termínu.

## Soubory

| Soubor | Obsah |
|---|---|
| `index.html`, `styles.css` | stránka (mobile-first, světlý i tmavý režim) |
| `app.js` | práce s DOM, načtení `rules.json`, uložení plánu do `localStorage` |
| `rodina.js` | čisté výpočetní funkce (DVZ, redukce, dávky, čerpání RP, plán po měsících) |
| `timeline.js` | časová osa jako SVG řetězec (bez knihovny) |
| `rules.json` | **všechny parametry** po letech, se zdrojem a datem ověření |
| `test/` | testy pro `node --test` |
| `.github/workflows/pages.yml` | spustí testy a nasadí web na GitHub Pages |

Žádné závislosti ani build. Nic se neodesílá. Plán se ukládá jen do `localStorage` prohlížeče.

## Spuštění a testy

```bash
node --test
```

```bash
python3 -m http.server 8000
```

Pak otevřete http://localhost:8000. Stránka načítá `rules.json` přes `fetch`, takže ji nejde otevřít přímo jako soubor (`file://`).

## Nasazení na GitHub Pages

1. Nahrajte obsah složky do repozitáře na GitHubu (větev `main`).
2. V repozitáři otevřete **Settings → Pages → Build and deployment** a jako *Source* zvolte **GitHub Actions**.
3. Každý push do `main` spustí workflow `pages.yml`: nejdřív testy, a jen když projdou, nasazení.

## Každoroční aktualizace (`rules.json`)

Po každé změně spusťte `node --test`. Testy ze zadání počítají s dětmi narozenými v roce 2026, další testy pokrývají rok 2027.

### 1. Redukční hranice (každý rok, sdělení vychází obvykle v září nebo říjnu)

MPSV je vyhlašuje sdělením ve Sbírce zákonů („…kterým se vyhlašuje pro účely nemocenského pojištění výše
redukčních hranic…“). Najdete ho na [e-sbirka.gov.cz](https://e-sbirka.gov.cz) nebo na
[mpsv.gov.cz – Nemocenské pojištění](https://mpsv.gov.cz/nemocenske-pojisteni). Doplňte nový rok:

```json
"redukcniHranice": {
  "2028": { "h1": 0, "h2": 0, "h3": 0, "zdroj": "Sdělení MPSV č. …/2027 Sb.", "url": "https://e-sbirka.gov.cz/sb/2027/…" }
}
```

Dokud rok chybí, aplikace použije poslední známý rok a zobrazí upozornění. Hranice se vybírají podle
**data nástupu na dávku**, ne podle data porodu, ale jen do 31. 12. Trvá-li mateřská nebo otcovská i 1. ledna,
od tohoto dne se dávka přepočítá podle hranic nového roku (DVZ zůstává, § 22 odst. 2 ZNP). Strop
rodičovského příspěvku se počítá z DVZ redukovaného hranicemi roku narození dítěte (§ 30 odst. 3 ZSSP).

### 2. Rodičovský příspěvek (při změně zákona o státní sociální podpoře)

Pole `rodicovsky` obsahuje záznamy podle data narození dítěte (`narozeniOd`). Při změně částky
**přidejte nový záznam**, starý nepřepisujte. Platí pro děti narozené dřív.

- `celkem`, `celkemVicercata`: celková částka
- `minStrop`, `minStropVicercata`: měsíční maximum bez DVZ nebo s nízkým DVZ (15 000 / 30 000 Kč)
- `nasobekVicercata`: násobek stropu podle DVZ u vícerčat (od 2026 je to 2)
- `vekMesicu`: do kdy se čerpá (36 = včetně měsíce 3. narozenin, § 30b odst. 1 písm. d) ZSSP)
- `pozn`: volitelná poznámka, zobrazí se jako informace

Aktuálně: 350 000 / 700 000 Kč pro děti narozené od 1. 1. 2026 a 400 000 / 800 000 Kč pro děti
narozené od 1. 1. 2027 (novela schválená Senátem 29. 7. 2026). Až vyjde ve Sbírce, doplňte do `zdroj` číslo zákona.

### 3. Čistá mzda (každý rok)

`cistaMzda` obsahuje sazby pojistného zaměstnance, sazby daně, měsíční hranici pro 23 % (36násobek
průměrné mzdy / 12) a měsíční slevu na poplatníka. Nový rok doplňte podle
[Finanční správy](https://financnisprava.gov.cz) a [MPSV – Sociální pojištění](https://mpsv.gov.cz/socialni-pojisteni).

### 4. Ostatní

- `ppm`, `otcovska`: délky dávek a sazby (mění se jen se zákonem č. 187/2006 Sb.)
- `overeno`: datum posledního ověření, zobrazuje se v patičce
- `zdroje`: odkazy v patičce

## Jak se počítá

1. **DVZ** = hrubý měsíční příjem × 12 / počet dní rozhodného období (12 kalendářních měsíců před měsícem nástupu, 365 nebo 366), zaokrouhleno na haléře (stejně jako kalkulačka MPSV).
2. **Redukovaný DVZ**: do 1. hranice 100 %, mezi 1. a 2. hranicí 60 %, mezi 2. a 3. hranicí 30 %, nad 3. hranicí nic. Výsledek se zaokrouhluje nahoru na celé koruny.
3. **Mateřská a otcovská denně** = 70 % redukovaného DVZ, zaokrouhleno nahoru na celé koruny. Vyplácí se za každý kalendářní den.
4. **Mateřská**: 28 týdnů (vícerčata 37), nástup 6–8 týdnů před termínem. Otec ji může převzít nejdříve od 7. týdne.
5. **Otcovská**: 14 dní, nástup do 6 týdnů od narození.
6. **Strop RP** = max(15 000 Kč; 70 % × 30 × vyšší redukovaný DVZ rodičů). U vícerčat 30 000 Kč a dvojnásobek.
7. **Čerpání RP** začíná v měsíci narození. V měsících, za které náleží mateřská, se vyplácí jen rozdíl mezi zvolenou výší a mateřskou, je-li zvolená výše vyšší (§ 30b odst. 3 ZSSP). Každý měsíc se zbývající částka sníží o vyplacenou částku, nejdéle do konce kalendářního měsíce, v němž dítě dosáhne 3 let (měsíc 3. narozenin se počítá celý, § 30b odst. 1 písm. d) ZSSP). Zbytek **propadne**.

### Porovnání s kalkulačkou MPSV

Výpočet mateřské a otcovské byl 5. 11. 2026 porovnán s oficiálními kalkulačkami MPSV
([K_PPM_2026.xlsx a K_Otcovská_2026.xlsx](https://mpsv.gov.cz/kalkulacka-pro-vypocet-davek-v-roce-2026)).
Kalkulačky byly přepočítané v LibreOffice pro 40 měsíčních příjmů od 5 000 do 200 000 Kč, včetně hodnot
na redukčních hranicích, a pro 196 i 259 dní mateřské a 14 dní otcovské. Ve všech 80 případech se shoduje DVZ,
redukovaný DVZ i celková částka. Vybrané hodnoty jsou v `test/mpsv-kalkulacka.test.js`.

Kalkulačka MPSV zaokrouhluje DVZ na haléře ještě před redukcí. Bez toho by u zhruba 1 ze 2 400 příjmů
vyšel redukovaný DVZ o 1 Kč jinak (například u 50 279 Kč).

Kalkulačka MPSV je jen pro nástup v roce 2026. Hodnoty pro rok 2027 jsou spočítané stejným postupem s hranicemi
ze sdělení 185/2026 Sb.

Mateřská 28 týdnů (196 dní), rozhodné období 365 dní:

| Hrubý příjem | Nástup | DVZ | Redukovaný DVZ | PPM denně | PPM celkem | Strop RP |
|---|---|---|---|---|---|---|
| 30 000 Kč | 2026 | 986,30 | 987 | 691 | 135 436 | 20 727 |
| 50 000 Kč | 2026 | 1 643,84 | 1 640 | 1 148 | 225 008 | 34 440 |
| 80 000 Kč | 2026 | 2 630,14 | 2 177 | 1 524 | 298 704 | 45 717 |
| 150 000 Kč | 2026 | 4 931,51 | 2 857 (max) | 2 000 | 392 000 | 59 997 |
| 50 000 Kč | 2027 | 1 643,84 | 1 644 | 1 151 | 225 596 | 34 524 |
| 80 000 Kč | 2027 | 2 630,14 | 2 254 | 1 578 | 309 288 | 47 334 |
| 150 000 Kč | 2027 | 4 931,51 | 2 944 (max) | 2 061 | 403 956 | 61 824 |

Řádky 2026 se shodují s kalkulačkou MPSV.

## Zjednodušení

- Porod v termínu a stejný měsíční příjem v celém rozhodném období, bez vyloučených dob (nemoc, předchozí mateřská).
- Jen zaměstnanci. U OSVČ jsou jiné podmínky nároku i výpočtu.
- Rodičovská má jednu měsíční výši po celou dobu (úřad dovolí změnu jednou za 3 měsíce).
- Čistá mzda nezahrnuje daňové zvýhodnění na dítě ani další slevy a odpočty.
- Výjimky jako jednorázová výplata při narození dalšího dítěte nebo převzetí dítěte do péče se nepočítají, jen se zmiňují v kontrolním seznamu.
