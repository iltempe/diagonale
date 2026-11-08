# Changelog

## 1.2.0 — 2026-11-08

- Nuovo dominio: sito su **https://diagonalecalcio.it/** e app su **https://diagonalecalcio.it/app/**. I vecchi indirizzi `iltempe.github.io/diagonale/…`, compresi i link già condivisi e i badge già installati, vengono reindirizzati automaticamente.
- I link di condivisione generati dall'app desktop e dal server MCP (`open_in_browser`) usano il nuovo dominio.
- **Badge per le società**: generatore sul sito (`#badge`) con nome del club, stile scuro o chiaro, italiano o inglese; codice HTML autonomo oppure immagine SVG.
- **Condivisione** del sito su WhatsApp, Telegram, Facebook, X, LinkedIn, Reddit, email, copia link e condivisione nativa del telefono, nella sezione "Chi c'è dietro".
- **Statistiche anonime** del sito con GoatCounter (senza cookie, script ospitato in locale). L'app resta senza tracciamento.
- **README** con GIF animata e galleria di screenshot (editor, AI Coach, vista televisiva, planner, Team Centre, export, mobile, video social).

## 1.1.0 — 2026-11-08

- **Video social 9:16**: nuovo pulsante nell'export che genera in un clic un MP4 1080×1920 per Reels, TikTok e Shorts. Ha una fascia con il titolo della lavagna e la fase corrente, una barra di avanzamento delle fasi e il campo verticale fuori dalle aree coperte dalle interfacce delle app. Aggiunti anche i formati 4:5 (feed Instagram) e 1:1, disponibili pure per i PNG e dal server MCP (`export_mp4` con `aspect`).
- **Sito**: sezione "Chi c'è dietro" con i link GitHub dell'autore e il pulsante "Offrimi un caffè" (anche nel menu e nel footer); layout verificato e corretto su schermi da 320 px in su (prima comparivano scroll orizzontali sotto i 768 px).
- **App**: sezione Informazioni nelle impostazioni con versione, GitHub e "Offrimi un caffè"; header dell'editor meno affollato sugli schermi medi.
- `FUNDING.yml` per il pulsante Sponsor del repository.

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
