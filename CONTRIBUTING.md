# Contribuire a Diagonale · Contributing

**🇮🇹** Grazie per l'interesse! Segnalazioni di bug, idee e pull request sono benvenute.

- **Bug e idee**: apri una [issue](https://github.com/iltempe/diagonale/issues/new) descrivendo cosa ti aspettavi e cosa è successo; se puoi, allega il file `.diagonale.json` o il link di condivisione della lavagna.
- **Codice**: leggi [`SPEC.md`](SPEC.md) e [`CLAUDE.md`](CLAUDE.md) (regole del progetto), poi:
  ```bash
  pnpm install
  pnpm dev
  pnpm typecheck && pnpm lint && pnpm check:i18n && pnpm test
  ```
  Ogni testo visibile va tradotto in `it` e `en`, e ogni modifica alla lavagna passa da un comando in `packages/core`.
- **Traduzioni**: i file sono in `apps/web/src/locales/<lingua>/`. Per aggiungere una lingua copia la cartella `en`, traduci e apri una pull request.

**🇬🇧** Thanks for your interest! Bug reports, ideas and pull requests are welcome.

- **Bugs and ideas**: open an [issue](https://github.com/iltempe/diagonale/issues/new) describing what you expected and what happened; if you can, attach the `.diagonale.json` file or the board's share link.
- **Code**: read [`SPEC.md`](SPEC.md) and [`CLAUDE.md`](CLAUDE.md) (project rules, in Italian), then run the commands above. Every user-facing string must be translated in `it` and `en`, and every board change goes through a command in `packages/core`.
- **Translations**: files live in `apps/web/src/locales/<language>/`. To add a language, copy the `en` folder, translate it and open a pull request.
