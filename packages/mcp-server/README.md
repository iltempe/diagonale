# @diagonale/mcp-server

Server [MCP](https://modelcontextprotocol.io) per **Diagonale**. Espone come tool MCP gli stessi comandi che usano la web app e l'AI Coach (`applyFormation`, `addPhase`, `moveEntities`, `addAnnotation`, …), con gli stessi JSON Schema.

## Modalità

| Modalità | Avvio | Cosa fa |
|---|---|---|
| **file** (default) | `diagonale-mcp --dir ./boards` | Legge e scrive i file `.diagonale.json` nella cartella indicata |
| **live** | `diagonale-mcp --live` | Apre `ws://127.0.0.1:7457`. Nella web app attiva *Impostazioni → Attiva il bridge MCP live*: le modifiche compaiono in tempo reale e sono disponibili `export_png` ed `export_mp4` |
| HTTP | aggiungi `--http 3333` | Streamable HTTP su `http://127.0.0.1:3333/mcp` al posto di stdio |

Tool extra: `listBoards`, `openBoard` (solo modalità file), `export_png`, `export_mp4`, `open_in_browser` (apre la lavagna nel player web tramite link di condivisione).
Risorse: `board://<id>` e `formation://<id>`.

## Build

```bash
pnpm install
pnpm --filter @diagonale/mcp-server build   # → packages/mcp-server/dist/index.js
```

## Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "diagonale": {
      "command": "node",
      "args": ["/percorso/assoluto/diagonale/packages/mcp-server/dist/index.js", "--dir", "/Users/tu/Diagonale/boards"]
    }
  }
}
```

Per la modalità live sostituisci `"--dir", "…"` con `"--live"` e attiva il bridge nell'app.

## Claude Code

```bash
claude mcp add diagonale -- node /percorso/assoluto/diagonale/packages/mcp-server/dist/index.js --dir ./boards
# oppure, in diretta sull'app aperta:
claude mcp add diagonale-live -- node /percorso/assoluto/diagonale/packages/mcp-server/dist/index.js --live
```

Esempio di prompt: *"Crea una lavagna: 4-3-3 contro 4-4-2, costruzione dal basso in 4 fasi, poi aprila nel browser."*
