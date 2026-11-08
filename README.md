<p align="center"><img src="apps/web/public/icon-192.png" width="96" alt="Diagonale"></p>

<h1 align="center">Diagonale</h1>
<p align="center"><b>La tattica, fase per fase.</b> — Lavagna tattica animata open source per allenatori di calcio.</p>
<p align="center"><a href="https://iltempe.github.io/diagonale/app/"><b>▶ Apri l'app</b></a> · <a href="https://iltempe.github.io/diagonale/">Sito</a> · <a href="https://github.com/iltempe/diagonale/releases/latest"><b>⬇ Mac · Windows · Linux</b></a> · <a href="SPEC.md">Specifica</a> · <a href="docs/decisions.md">Decisioni</a> · <a href="#english">English</a></p>

---

Disegni una situazione di gioco su un campo in metri reali, la scomponi in **fasi** e Diagonale anima il passaggio da una fase all'altra come un filmato. Poi la condividi con un link che si apre anche dal telefono, la esporti in MP4, PNG o PDF, oppure la fai costruire all'**AI Coach** con il modello che preferisci.

Funziona nel browser, senza installazione e senza account: le lavagne restano nel tuo dispositivo e l'app funziona anche offline (PWA). C'è anche l'**app desktop** per macOS, Windows e Linux, scaricabile dalle [release](https://github.com/iltempe/diagonale/releases/latest).

## Funzionalità

- **Editor**: giocatori di casa e avversari, palla, frecce in 7 stili (passaggio, smarcamento, conduzione, pressione, palla alta, blocco, tiro), zone, linee, testi e 17 attrezzi d'allenamento. Multi-selezione, tocca-per-spostare su mobile, curve trascinabili e scorciatoie da tastiera.
- **Fasi e animazione**: timeline con miniature, durata trascinabile, andamento, palla alta con ombra, camera che segue la palla, riproduzione a 0.5×/1×/2× con loop.
- **Campo**: 9 viste (intero, metà, terzi, area, fasce), 4 superfici, orientamento orizzontale o verticale, **vista televisiva** in prospettiva e griglia in metri per gli esercizi.
- **25 moduli**, compresi quelli giovanili a 5, 7 e 9, e **5 routine di calci piazzati**. Puoi salvare le tue sequenze e riapplicarle su altre lavagne.
- **Condivisione**: un link `#/d/…` che contiene la lavagna compressa (circa 2–6 KB, nessun server). Si apre a schermo intero e su telefono passa in verticale.
- **Export**: PNG della fase corrente o di tutte le fasi (zip), PDF con una pagina per fase e le note, video **MP4 H.264** a 720p o 1080p, in 16:9 o 9:16, generato fotogramma per fotogramma. Import ed export dei file `.diagonale.json`.
- **Italiano e inglese**: il cambio di lingua è immediato; la stessa scelta vale per le etichette negli export e per l'AI.
- **AI Coach**: funziona con Claude, OpenAI, Gemini, OpenRouter, Mistral, Groq, DeepSeek e con modelli locali via Ollama o LM Studio. Usi la tua chiave, che resta nel browser. Le modifiche dell'AI appaiono in anteprima e si annullano con un solo undo.
- **Server MCP**: Claude Desktop e Claude Code possono creare e modificare le lavagne su file, oppure *in diretta* nell'app aperta.
- **Team Talk**: registri la voce mentre l'animazione scorre; resta sincronizzata in modalità presentazione e finisce nel video MP4.
- **Planner**: sedute di allenamento (esercizi, durata, obiettivi) in PDF A4 e piani gara per momento di gioco in un unico PDF.
- **Team Centre**: rosa, calendario con import/export ICS, convocazioni, risultati, minuti, gol, cartellini, statistiche e report per i genitori con privacy dei nomi (iniziali di default).
- **Foto e bandiere** dei giocatori sul campo.
- **Cloud opzionale (Supabase)**: login, sincronizzazione tra dispositivi e link brevi con audio. Vedi più sotto come attivarlo.

## Struttura

```
packages/core        modello, schema Zod, comandi, undo/redo, animazione (TypeScript puro, headless)
packages/render      renderer Konva condiviso da editor, player ed export
packages/ai          provider AI agnostici + agent loop
packages/mcp-server  server MCP (stdio / Streamable HTTP, modalità file e live)
apps/web             web app React 19 (Vite, Zustand, Dexie, i18next)
apps/desktop         app desktop Electron (macOS, Windows, Linux)
apps/site            sito di lancio statico (bilingue)
data/                formazioni e routine in JSON (generate da packages/core)
supabase/            schema e proxy AI predisposti per la fase successiva
```

Ogni modifica alla lavagna passa da un **command bus** tipizzato. Interfaccia, AI e MCP usano gli stessi comandi, e da questi derivano anche undo/redo e le definizioni dei tool AI (generate dagli schema Zod).

## Sviluppo

Servono Node ≥ 20 e pnpm 9.

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # unit test (core, render, ai, mcp-server)
pnpm typecheck && pnpm lint && pnpm check:i18n
pnpm --filter @diagonale/web e2e    # Playwright
```

Il deploy su GitHub Pages parte a ogni push su `main` (`.github/workflows/pages.yml`): sito su `/diagonale/`, app su `/diagonale/app/`.

### App desktop

```bash
pnpm --filter @diagonale/desktop start      # avvia in sviluppo
pnpm --filter @diagonale/desktop dist       # pacchetti per il sistema corrente in apps/desktop/release
```

Su ogni tag `v*` il workflow `release.yml` compila le app per macOS, Windows e Linux insieme a `diagonale-mcp.js`, e le pubblica nella release GitHub.

### Cloud opzionale (Supabase)

1. Crea un progetto Supabase e applica `supabase/migrations/0001_init.sql`.
2. In *Authentication* abilita l'email (magic link) e, se vuoi, Google; aggiungi `https://iltempe.github.io/diagonale/app/` agli URL di redirect.
3. Nel repository GitHub imposta le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (*Settings → Secrets and variables → Actions → Variables*) e rilancia il deploy.

Senza queste variabili l'app resta completamente locale e i link di condivisione contengono la lavagna nell'indirizzo.

### AI con modelli locali

- **Ollama**: avvialo con `OLLAMA_ORIGINS=* ollama serve`, poi nelle impostazioni scegli "Ollama (local)".
- **LM Studio**: abilita CORS nel server locale.

Se un modello non supporta il tool calling, togli la spunta: l'agente passa a un protocollo JSON validato, con al massimo 2 tentativi di correzione.

### Server MCP

Vedi [`packages/mcp-server/README.md`](packages/mcp-server/README.md).

## Novità

Vedi [`CHANGELOG.md`](CHANGELOG.md). Le scelte non coperte dalla specifica sono in [`docs/decisions.md`](docs/decisions.md).

## Licenza

[Apache-2.0](LICENSE). Diagonale è un progetto indipendente: riprende alcune *funzionalità* comuni alle lavagne tattiche, ma non nomi, grafica, testi o asset di altri prodotti.

---

## English

**Diagonale** is an open-source animated tactics board for football coaches. You draw a situation on a pitch measured in real meters and split it into **phases**; Diagonale animates the transitions like a video. You can share it as a link that also plays on phones, export it to MP4, PNG or PDF, or let the **AI Coach** build it with any model you like: Claude, OpenAI, Gemini, OpenRouter, or local models through Ollama and LM Studio. You bring your own key and it stays in your browser.

It runs in the browser with no install and no account, works offline (PWA), and the whole interface is available in English and Italian. Through the MCP server, Claude Desktop and Claude Code can create and edit boards, either as files or live in the open app.

It also includes Team Talk (voice synced to the animation), a session planner and match-plan PDFs, and a Team Centre (squad, fixtures, call-ups, stats, privacy-aware parent reports). Desktop apps for macOS, Windows and Linux are on the [releases page](https://github.com/iltempe/diagonale/releases/latest).

Try it: **https://iltempe.github.io/diagonale/app/** · Website: **https://iltempe.github.io/diagonale/**
