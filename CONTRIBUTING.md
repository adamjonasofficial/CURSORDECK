# Contributing to CursorDeck

## Prerequisites

- Windows 10+ (key injection)
- Node.js 20+
- pnpm 9.x (or `npx pnpm@9.15.0`)
- Optional: Elgato Stream Deck 6.5+
- Optional: [Git for Windows](https://git-scm.com/download/win)

## Develop

```bat
pnpm install
pnpm --filter @csd/shared build
start.bat --console
```

Silent tray mode:

```bat
start.bat
```

or `Start CursorDeck.vbs`.

## Build

```bat
pnpm build
pnpm plugin:build
```

Generated PNG art is gitignored — always build before `install-plugin.bat`.

Appearance overrides live in `%USERPROFILE%\.cursor-streamdeck\appearance.json` (see `appearance.example.json`). After editing colors/icons/motion run `regenerate-icons.bat` then `install-plugin.bat`.

Full user guide: [docs/USAGE.md](docs/USAGE.md).

## Layout

| Path | Role |
|---|---|
| `apps/bridge` | Bridge + appearance API + static web pad |
| `apps/web` | React pad |
| `apps/streamdeck-plugin` | Elgato plugin |
| `packages/shared` | Shared types |
| `hooks/` | Hook relay |
| `setup/` | Installer |
| `scripts/tray-host.ps1` | Tray host |

## Pull requests

- Keep changes focused
- Do not commit `node_modules`, `logs/`, or generated plugin imgs
- After plugin changes: `install-plugin.bat`, Quit Stream Deck, smoke-test
