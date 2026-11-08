# Changelog

## 1.0.1 — 2026-11-08

- Corretta la build Linux dell'app desktop (nome dell'eseguibile).
- Le release non includono più l'installer Windows "universale" duplicato (restano x64, ARM64 e portabile).

## 1.0.0 — 2026-11-08

Prima versione completa della specifica (M0–M5).

- **Desktop**: app per macOS (Apple Silicon e Intel), Windows (x64, ARM64, portabile) e Linux (AppImage x64/ARM64, .deb). Apertura dei file `.diagonale.json` dal menu, modelli AI locali (Ollama, LM Studio) senza configurare CORS, dati locali persistenti.
- **Sito di lancio** su https://iltempe.github.io/diagonale/; l'app si sposta su `/app/` (i vecchi link `#/d/…` vengono reindirizzati).
- **Team Talk**: registrazione vocale sincronizzata con l'animazione, modalità presentazione a schermo intero, voce inclusa nel video MP4 (Opus).
- **Planner**: sedute di allenamento con esercizi, obiettivi e durata, esportate in PDF A4; piani gara per momento di gioco esportati in un unico PDF.
- **Team Centre**: rosa, calendario (import/export ICS, sorgente esterna configurabile), convocazioni con capitano, risultati con minuti, gol e cartellini, statistiche stagionali, report per i genitori con privacy dei nomi (default: iniziali), lavagna generata dai titolari.
- **Cloud opzionale (Supabase)**: login con magic link o Google, sincronizzazione delle lavagne, link brevi `#/d/<slug>` con audio del Team Talk, lingua salvata nel profilo. Si attiva configurando `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- **Giocatori**: foto (caricata in locale) e bandiera della nazione sul campo; camera "riquadro" con coordinate.
- **Release automatiche** su tag `v*` con app desktop e bundle del server MCP.

## 0.1.0 — 2026-11-08

Prima pubblicazione: editor, animazione per fasi, i18n it/en, condivisione tramite link, export PNG/PDF/MP4/JSON, AI Coach multi-provider, server MCP, deploy su GitHub Pages.
