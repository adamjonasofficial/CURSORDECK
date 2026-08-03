# CursorDeck hooks

`csd-hook.mjs` is installed into `~/.cursor/hooks/` by `pnpm setup:cursor`.

It reads the Cursor hook JSON payload from stdin and POSTs it to:

```
http://127.0.0.1:3847/hooks
```

Override with `CSD_BRIDGE_URL`. Always fail-open (exit 0) so agent work is never blocked.
