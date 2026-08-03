# Publish CursorDeck to GitHub

## What goes where

| Co | Kam |
|---|---|
| Zdrojový kód | GitHub repo (`main`) |
| **`CursorDeck-Setup-*.exe`** | **GitHub Release** (příloha) — ne do gitu (`dist/` je ignorovaný) |

Uživatelé si stáhnou Setup z Releases a nainstalují. Vývojáři klonují repo.

## 0) Požadavky

- [Git for Windows](https://git-scm.com/download/win) (při instalaci nech „Git from command line“)
- Účet na [GitHub](https://github.com/)
- Volitelně [GitHub CLI](https://cli.github.com/) (`gh`) pro snadný Release

## 1) Lokální commit

Z kořene repa (`c:\cursorstreamdeck`):

```bat
git init
git add .
git status
git commit -m "Initial commit: CursorDeck Setup + tray + Stream Deck plugin"
```

## 2) Prázdné repo na GitHubu

1. https://github.com/new  
2. Name: **`cursordeck`** (nebo jiné)  
3. **Bez** README / .gitignore / license (už máš lokálně)  
4. Create repository  

Pak (nahraď `YOUR_USER`):

```bat
git branch -M main
git remote add origin https://github.com/YOUR_USER/cursordeck.git
git push -u origin main
```

Přihlášení: browser / Personal Access Token, pokud Git požádá o heslo.

## 3) Setup EXE (instalátor)

Sestav (trvá pár minut):

```bat
build-installer.bat
```

Výstup: `dist\CursorDeck-Setup-0.9.x.exe`

## 4) GitHub Release (aby šlo jen stáhnout a nainstalovat)

### Přes web

1. Repo → **Releases** → **Draft a new release**  
2. Tag: `v0.9.2` (nebo aktuální verze z `package.json`)  
3. Title: `CursorDeck 0.9.2`  
4. Description např.:

```text
## Install
1. Node.js 20+ LTS from https://nodejs.org/
2. Download CursorDeck-Setup-0.9.2.exe below
3. Run Setup (no admin)
4. Quit Stream Deck and reopen if you installed the plugin

## Notes
- Installs to %LOCALAPPDATA%\CursorDeck
- Optional: Start with Windows, Cursor hooks, Stream Deck plugin
```

5. **Attach** soubor `dist\CursorDeck-Setup-0.9.2.exe`  
6. **Publish release**

### Přes `gh` (pokud máš GitHub CLI)

```bat
gh auth login
gh release create v0.9.2 "dist\CursorDeck-Setup-0.9.2.exe" --title "CursorDeck 0.9.2" --notes "Windows Setup — Node.js 20+ required. See README."
```

## 5) Ověření

- Otevři `https://github.com/YOUR_USER/cursordeck/releases/latest`  
- Stáhni EXE na čistém PC / jiném profilu a vyzkoušej Setup  

### Do not commit

- Secrets / API keys  
- `logs/`  
- `node_modules/`  
- `dist/` (Setup patří do **Release**, ne do gitu)  
- Generované idle/press framypacky (gitignore)  

Po clone z gitu (bez Setup): `setup.bat` → `start.bat` → `install-plugin.bat`.
