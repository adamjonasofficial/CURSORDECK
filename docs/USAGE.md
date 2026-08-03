# CursorDeck — kompletní návod

CursorDeck spojuje **Cursor IDE** se **Stream Deck** (a volitelným web padem) přes lokální bridge na `http://127.0.0.1:3847`.

## Obsah

1. [Instalace od nuly](#1-instalace-od-nuly) (Setup.exe nebo Git)
2. [Denní používání](#2-denní-používání)
3. [Stream Deck plugin](#3-stream-deck-plugin)
4. [Přizpůsobení vzhledu](#4-přizpůsobení-vzhledu)
5. [Multi-key graph walls](#4b-multi-key-graph-walls-2×2--3×3)
6. [Web pad](#5-web-pad)
7. [Akce a klávesové zkratky](#6-akce-a-klávesové-zkratky)
8. [Live status a grafy](#7-live-status-a-grafy)
9. [Konfigurace](#8-konfigurace)
10. [API bridge](#9-api-bridge)
11. [Řešení problémů](#10-řešení-problémů)
12. [Nahrání na GitHub](#11-nahrání-na-github)

---

## 1. Instalace od nuly

### Požadavky

- Windows 10+
- [Node.js 20+](https://nodejs.org/) (doporučeno LTS)
- Cursor IDE
- Volitelně: Elgato Stream Deck software 6.5+ / 7.x + hardwarový Stream Deck
- Volitelně: [Git for Windows](https://git-scm.com/download/win)

### A) Setup.exe (doporučeno)

1. Sestav installer v tomto repu: `build-installer.bat` → `dist\CursorDeck-Setup-*.exe`
2. Spusť Setup na cílovém PC (bez admin práv)
3. Instaluje do `%LOCALAPPDATA%\CursorDeck`
4. Ve wizardu (výchozí zapnuto):
   - **Start CursorDeck with Windows** (HKCU Run → tichý tray)
   - Cursor keybindings/hooks
   - Stream Deck plugin
5. Po dokončení můžeš rovnou spustit CursorDeck

**Autostart:** po přihlášení se spustí `Start CursorDeck.vbs` → tray. Vypnout/zapnout: tray menu **Start with Windows**, nebo odinstalace přes Nastavení → Aplikace.

**Odinstalace:** Windows Apps → CursorDeck (smaže soubory, Start Menu, Desktop zkratku a Run klíč).

### B) Z Gitu / ZIP

```bat
git clone https://github.com/YOUR_USER/cursordeck.git
cd cursordeck
```

Nebo stáhni ZIP z GitHubu a rozbal.

```bat
setup.bat
```

To nainstaluje:

- Cursor **keybindings** (záloha před úpravou)
- Cursor **hooks** → `hooks/csd-hook.mjs` → bridge
- závislosti projektu (`pnpm install` / build shared)

Pak:

```bat
start.bat
```

V tray (skryté ikony) uvidíš **CursorDeck**. Bridge běží na portu **3847**.

Pro Stream Deck:

```bat
install-plugin.bat
```

1. Ukonči Stream Deck (Quit), znovu otevři
2. Preferences → Plugins → povol **CursorDeck**
3. Přetáhni akce z kategorie **CursorDeck** na profil
4. Nech běžet tray (bridge)

Po `setup.bat` v Cursoru: **Developer: Reload Window**.

---

## 2. Denní používání

| Co | Jak |
|---|---|
| Start | `start.bat` nebo `Start CursorDeck.vbs` |
| Stop | `stop.bat` nebo tray → Quit |
| Web pad | tray → **Open Web Pad** → `http://127.0.0.1:3847/` |
| Logy | tray → Open logs folder |
| Start with Windows | tray → **Start with Windows** (toggle) |
| Debug (konzole + Vite) | `start.bat --console` |
| Kontrola | `verify.bat` |

Bez běžícího bridge Stream Deck klávesy selžou (červený alert) a live grafy ukazují OFF.

---

## 3. Stream Deck plugin

### Kategorie CursorDeck

**Režimy:** Agent, Ask, Plan, Debug, Cycle Model  

**Chat:** New, Focus Chat, Stop, Accept All, Reject All  

**IDE:** Focus Cursor, Side Panel, Terminal, Command Palette, Save All, Explorer  

**Live / grafy:** Live Status, Metrics, Activity, Work Mix, Pace, Session Timer, Health  

### Property Inspector

Klikni na klávesu v Stream Deck editoru → panel vpravo:

1. **Bridge URL** — výchozí `http://127.0.0.1:3847` (globální)
2. **Test** — ověří `/health`
3. U akčních kláves (Agent, Ask, …) sekce **Vzhled** (viz níže)

---

## 4. Přizpůsobení vzhledu

Jsou **dvě vrstvy**:

### A) Okamžité (runtime, bez rebuild)

Uloží se do nastavení konkrétní klávesy ve Stream Deck:

| Pole | Efekt |
|---|---|
| Titulek | `setTitle` na klávese |
| Rychlost | 0.25×–4× idle animace |
| Fáze / „rotace“ | offset framů 0–15 (posun smyčky) |
| Pozpátku | animace reverse |
| Idle animace | vypnout = statický obrázek |

Změny platí hned po uložení v Property Inspectoru.

### B) Barva, ikona, motion, label v art (regenerace PNG)

Tyto hodnoty se ukládají také do:

```text
%USERPROFILE%\.cursor-streamdeck\appearance.json
```

V Property Inspectoru klikni **Aplikovat art (barva/ikona)** — bridge přegeneruje PNG a zkopíruje plugin. Nebo v repu:

```bat
apply-appearance.bat
```

Pak **Quit Stream Deck** (tray) a znovu otevři.

Stejné API:

- `GET http://127.0.0.1:3847/appearance`
- `PUT /appearance` — celý soubor
- `PUT /appearance/:key` — jedna klávesa (`agent`, `ask`, …)
- `POST /appearance/apply-art` — regenerace + instalace pluginu

Property Inspector při uložení vzhledu automaticky volá `PUT /appearance/:key`.

### Klíče art (`:key`)

`agent`, `ask`, `plan`, `debug`, `model`, `new`, `stop`, `accept`, `reject`, `focus`, `sidepanel`, `chatfocus`, `terminal`, `palette`, `save`, `explorer`

---

## 4b. Multi-key graph walls (2×2 / 3×3)

Stream Deck neumí jednu akci natáhnout nativně. CursorDeck vykreslí **jeden velký graf** (s kompenzací mezer) a rozřízne ho na klávesy.

Platí pro: **Live Status, Metrics, Activity, Work Mix, Pace, Session Timer, Health**.

### Auto (doporučeno)

1. Přetáhni **4** stejné klávesy do čtverce 2×2 (nebo **9** do 3×3).
2. Nech **Layout = Auto** (default v Property Inspectoru).
3. Plugin podle pozic na decku zeď **sám spojí** — žádné Tile / Wall ID.

Jedna samotná klávesa zůstane 1×1. Dvě oddělené 2×2 zdi stejného typu fungují nezávisle.

### Ruční override

V PI nastav Layout `2×2` / `3×3`, unikátní Tile a stejné Wall ID — nebo `1×1`, pokud nechceš auto-spojení sousedů.

---

## 5. Web pad

Otevři z tray nebo prohlížeče:

```text
http://127.0.0.1:3847/
```

(Vývoj: `start.bat --console` → Vite na `:5173`.)

### Záložky

| Tab | Obsah |
|---|---|
| **Pad** | Live status, modes/chat/IDE klávesy, health, session metrics, activity feed |
| **Stats** | Lifetime KPI, model mix, denní aktivita, work mix, konverzace, otázky s náhledem promptu a modelem |

Stats data se ukládají do `%USERPROFILE%\.cursor-streamdeck\analytics.json` (přežijí restart). Každá odeslaná otázka (`beforeSubmitPrompt`) založí turn s náhledem textu (max 120 znaků). Clear v Stats smaže historii (`DELETE /analytics`).

---

## 6. Akce a klávesové zkratky

Bridge fokusuje okno Cursor a injektuje chord. Zkratky instaluje `setup.bat`:

| Akce | Shortcut |
|---|---|
| Agent / Ask / Plan / Debug | Ctrl+Alt+Shift+1…4 |
| Cycle model | Ctrl+Alt+Shift+5 |
| New chat | Ctrl+Alt+Shift+N |
| Stop | Ctrl+Alt+Shift+Backspace |
| Accept / Reject all | Ctrl+Alt+Shift+Enter / Delete |
| Side panel | Ctrl+Alt+Shift+I |
| Focus chat / Terminal / Palette / Save / Explorer | dle `setup` / `packages/shared` |

Přemapování: uprav `~/.cursor-streamdeck/config.json` → `chords` **a** znovu sladě Cursor keybindings přes `setup.bat` (nebo ručně v Cursoru).

---

## 7. Live status a grafy

Cursor **hooks** posílají eventy do bridge (`POST /hooks/:event`). Live Status animuje stavy: idle / thinking / running / responding / completed / aborted / error.

Grafy (Metrics, Activity, Work Mix, Pace, Session, Health) čtou `GET /state`.

Pokud metriky zůstávají 0: ověř hooks (`setup.bat`), Reload Window, a že tray běží.

---

## 8. Konfigurace

| Soubor | Účel |
|---|---|
| `%USERPROFILE%\.cursor-streamdeck\config.json` | port, host, chords, inject delay |
| `%USERPROFILE%\.cursor-streamdeck\appearance.json` | vzhled kláves pro generátor ikon |
| `%USERPROFILE%\.cursor-streamdeck\analytics.json` | perzistentní otázky / modely / lifetime stats |
| `logs/` | tray / bridge logy |

---

## 9. API bridge

| Method | Path | Popis |
|---|---|---|
| GET | `/health` | alive + port |
| GET | `/state` | session, metrics, activity |
| GET | `/actions` | katalog akcí |
| POST | `/actions/:id` | spustí akci |
| POST | `/hooks` / `/hooks/:event` | Cursor hooks |
| GET | `/appearance` | vzhled + cesta k souboru |
| PUT | `/appearance` | uloží celý appearance |
| POST | `/appearance/apply-art` | regenerace PNG + copy plugin |
| GET | `/analytics` | plná analytika (turns, conversations, lifetime) |
| GET | `/analytics/turns/:id` | jedna otázka |
| DELETE | `/analytics` | smaže historii |
| WS | `/ws` | live state push (včetně compact analytics) |
| GET | `/` | web pad (pokud je build) |

---

## 10. Řešení problémů

| Problém | Řešení |
|---|---|
| Klávesa červeně bliká | Spusť `start.bat`, Test v PI |
| Plugin chybí | `install-plugin.bat`, Quit SD |
| Zkratky nefungují | `setup.bat`, Reload Cursor, Cursor musí mít focus |
| Grafy ukazují OFF / nespojují se | Bridge running; u wall stejný Layout + Wall ID + unikátní Tile |
| Tray bez loga | `icon/tray.ico`; restart tray |
| Po změně barev starý art | V PI **Aplikovat art**, nebo `apply-appearance.bat`, Quit SD |
| PUT appearance z PI selže | Bridge musí běžet (`start.bat`); CORS je otevřený |
| Port obsazen | změň port v `config.json` a Bridge URL v PI |

---

## 11. Nahrání na GitHub

Viz [GITHUB.md](../GITHUB.md). Stručně:

```bat
git init
git add .
git commit -m "Initial commit: CursorDeck"
git branch -M main
git remote add origin https://github.com/YOUR_USER/cursordeck.git
git push -u origin main
```

Do repa **necommituj** `logs/`, lokální `node_modules` (jsou v `.gitignore`), ani tajemství. Vygenerované idle/press framy jsou typicky ignorované — po clone spusť `pnpm install` a `install-plugin.bat` (build vygeneruje art).

Další: [CONTRIBUTING.md](../CONTRIBUTING.md), [README.md](../README.md).
