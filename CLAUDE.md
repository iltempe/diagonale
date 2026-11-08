# CLAUDE.md

Leggi sempre [`SPEC.md`](SPEC.md) prima di ogni task. Le scelte non coperte dalla spec sono in [`docs/decisions.md`](docs/decisions.md).

## Regole (SPEC §17)

- Lavora per milestone nell'ordine indicato, una PR per milestone o sotto-feature.
- `packages/core` non deve mai importare React, DOM o Konva.
- Ogni nuovo comando: schema Zod + `recipe` puro + test + descrizione utilizzabile come tool AI (in `packages/core/src/commands/commands.ts`, registrato in `COMMANDS`).
- Nessuna logica di modifica board dentro i componenti React: solo dispatch di comandi (`useEditor().dispatch`).
- Ogni testo visibile all'utente passa da i18next, con chiave aggiunta sia in `it` sia in `en` nello stesso commit (`pnpm check:i18n`).
- Le coordinate nel modello sono sempre in metri; la conversione in pixel sta solo in `packages/render`.
- Nessuna chiamata reale ai provider AI nei test: usa fixture (`packages/ai/test/fixtures`).
- Non usare nomi, loghi, testi o asset di Total Football Studio.
- Quando una scelta non è coperta dalla spec, scegli l'opzione più semplice, annotala in `docs/decisions.md` e prosegui.

## Comandi utili

```bash
pnpm install
pnpm dev              # web app su http://localhost:5173
pnpm test             # vitest in tutti i pacchetti
pnpm typecheck && pnpm lint && pnpm check:i18n
pnpm gen:data         # rigenera data/formations e data/routines dai sorgenti TS
pnpm --filter @diagonale/web e2e   # Playwright
pnpm --filter @diagonale/mcp-server build
```

## Mappa del codice

- `packages/core` — schema Zod (`schema.ts`), comandi (`commands/`), `Dispatcher` con undo/redo a patch Immer, `evaluate()` (animazione), formazioni, routine, sequence, `describeBoard`, migrazioni, link di condivisione, `toolDefinitions()`.
- `packages/render` — `BoardRenderer` (Konva imperativo) + `Viewport` (omografia flat/broadcast, orizzontale/verticale).
- `packages/ai` — adapter `anthropic` / `openai-compatible` / `gemini`, `runAgent` (loop AI Coach, fallback JSON), prompt in `prompts/*.md` (compilati in `src/prompts.generated.ts`).
- `packages/mcp-server` — server MCP (stdio o Streamable HTTP), modalità file e live.
- `apps/web` — React 19 + Zustand; `store/editor.ts` è l'unico ponte verso il `Dispatcher`.
