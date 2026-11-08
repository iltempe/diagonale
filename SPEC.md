# SPEC — Diagonale

**Diagonale** — lavagna tattica animata open source. Tagline: *"La tattica, fase per fase."*

> Brand: il nome richiama la diagonale difensiva e le linee che si tracciano sulla lavagna. Pacchetti npm con scope `@diagonale/*` (`@diagonale/core`, `@diagonale/render`, `@diagonale/ai`, `@diagonale/mcp-server`), repo `diagonale`, estensione file `.diagonale.json`, prefisso URL condivisione `/d/:slug`.
> Identità visiva: verde campo scuro `#0F3D2E`, gesso `#F4F1EA`, accento giallo segnalinee `#F2C230`; font titoli display condensato, testo sans neutro. Logo: una D attraversata da una freccia diagonale tratteggiata.
> Ispirazione funzionale: totalfootballstudio.com.
> Vincolo: si riprendono le *funzionalità*, non nome, grafica, testi o asset dell'originale.
> Questo documento è pensato per essere dato a Claude Code: va messo nella root del repo e richiamato da `CLAUDE.md`.

---

## 1. Obiettivo

Web app (browser, niente installazione) per allenatori che permette di:

1. disegnare una situazione di gioco su un campo (giocatori, palla, frecce, zone);
2. definirla come **sequenza di fasi** (non keyframe): in ogni fase i giocatori hanno una posizione, il software anima il passaggio da una fase all'altra come un filmato;
3. condividerla come link riproducibile da telefono ed esportarla in MP4 / PNG / PDF;
4. usare l'app **in italiano o in inglese** (interfaccia, export, AI), con cambio lingua immediato;
5. pilotare tutto anche tramite **AI**, con un'interfaccia agnostica rispetto al modello (Claude, OpenAI, Gemini, modelli locali via Ollama/LM Studio, OpenRouter…) e tramite **server MCP**.

Fuori scope (per ora): analisi video/immagini (tracking, detection), import salvataggi Football Manager, pagamenti/abbonamenti/affiliazioni, app native.

---

## 2. Principi architetturali

1. **Core puro e headless.** Modello dati, validazione, interpolazione e comandi stanno in un pacchetto TypeScript senza dipendenze da DOM/React. Deve girare in browser, Node (MCP server) e test.
2. **Command bus unico.** Ogni modifica alla board passa da un comando tipizzato (`addPlayer`, `movePlayer`, `addPhase`…). UI, AI agent e MCP usano *gli stessi comandi*. Questo dà gratis undo/redo, log, collaborazione futura e tool AI.
3. **Tool AI = comandi.** Le definizioni dei tool (nome, descrizione, JSON Schema dei parametri) sono generate dagli stessi schema Zod dei comandi. Un'unica fonte di verità.
4. **Local-first.** La board vive in IndexedDB; il backend serve solo per condivisione e sync opzionale.
5. **Board = JSON versionato.** Schema con `schemaVersion` e migrazioni esplicite. Un file `.diagonale.json` è importabile/esportabile.
6. **Coordinate in metri.** Tutto il modello è in metri reali sul campo; il rendering converte in pixel. Così le griglie d'allenamento e le misure sono esatte.

---

## 3. Stack

| Ambito | Scelta |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Linguaggio | TypeScript strict ovunque |
| Web app | Vite + React 19 |
| Rendering campo | Konva + react-konva (canvas: serve per export video e drag fluido) |
| Stato | Zustand + Immer (patch per undo/redo) |
| Validazione | Zod (+ `zod-to-json-schema` per i tool AI) |
| Persistenza locale | Dexie (IndexedDB) |
| Backend (condivisione, auth, storage) | Supabase (Postgres, Auth, Storage, Edge Functions) |
| Export video | `canvas.captureStream()` + MediaRecorder → WebM; conversione a MP4 con ffmpeg.wasm (lazy-loaded) |
| Export PDF | pdf-lib |
| i18n | i18next + react-i18next — italiano e inglese dal giorno 1 (vedi §9-bis) |
| Test | Vitest (core), Playwright (e2e) |
| MCP | `@modelcontextprotocol/sdk` (stdio + Streamable HTTP) |
| Lint/format | ESLint + Prettier |
| Licenza | Apache-2.0 (da confermare) |

---

## 4. Struttura del repo

```
/
├─ CLAUDE.md                 # istruzioni per Claude Code, rimanda a SPEC.md
├─ SPEC.md
├─ packages/
│  ├─ core/                  # modello, schema, comandi, interpolazione, formazioni (puro TS)
│  ├─ render/                # funzioni di disegno campo/entità su Konva (no React)
│  ├─ ai/                    # astrazione provider + agent loop + adapter
│  └─ mcp-server/            # server MCP che espone i comandi come tool
├─ apps/
│  └─ web/                   # app React
├─ supabase/
│  ├─ migrations/
│  └─ functions/ai-proxy/    # proxy opzionale verso i provider AI
└─ data/
   ├─ formations/*.json
   └─ routines/*.json        # calci piazzati predefiniti
```

---

## 5. Modello dati (`packages/core`)

Tutte le entità hanno `id: string` (nanoid). Coordinate `x` lungo la lunghezza del campo, `y` lungo la larghezza, origine nell'angolo in alto a sinistra della vista "campo intero", unità metri.

```ts
type Board = {
  schemaVersion: 1;
  id: string;
  title: string;
  kind: 'tactic' | 'set_piece' | 'training' | 'match_plan';
  pitch: PitchConfig;
  teams: [Team, Team?];            // casa obbligatoria, avversario opzionale
  ball: { id: 'ball' };
  phases: Phase[];                 // almeno 1
  sequencesUsed?: string[];        // id delle Sequence applicate
  createdAt: string; updatedAt: string;
};

type PitchConfig = {
  length: number;                  // default 105
  width: number;                   // default 68
  view: PitchView;
  surface: 'grass_stripes' | 'grass_plain' | 'artificial' | 'chalkboard';
  orientation: 'horizontal' | 'vertical';
  perspective: 'flat' | 'broadcast'; // broadcast = vista inclinata
  grid?: { cellMeters: number; visible: boolean }; // per allenamento
};

type PitchView =
  | 'full' | 'half_attack' | 'half_defence'
  | 'third_defensive' | 'third_middle' | 'third_final'
  | 'box' | 'wide_left' | 'wide_right'
  | { custom: { x: number; y: number; w: number; h: number } };

type Team = {
  id: string; name: string;
  kit: { primary: string; secondary: string; number: string; gkPrimary: string };
  players: Player[];
};

type Player = {
  id: string; teamId: string;
  number?: number; name?: string; shortName?: string;
  role?: Role;                     // GK, CB, FB, DM, CM, AM, W, ST…
  photoUrl?: string; flag?: string;  // ISO 3166
};

type Phase = {
  id: string;
  label?: string;
  durationMs: number;              // durata della transizione VERSO questa fase
  holdMs: number;                  // pausa a fine fase
  easing: 'linear' | 'easeInOut' | 'easeOut';
  positions: Record<EntityId, Position>;  // giocatori + 'ball'
  paths?: Record<EntityId, PathHint>;      // traiettoria dalla fase precedente
  annotations: Annotation[];
  camera?: CameraSpec;
  ballCarrierId?: string;
};

type Position = { x: number; y: number; facing?: number /* gradi */ };

type PathHint =
  | { type: 'straight' }
  | { type: 'curve'; control: { x: number; y: number } } // bezier quadratica
  | { type: 'lofted'; peakHeight: number };              // solo palla: ombra + scala

type Annotation =
  | { id: string; type: 'arrow'; style: ArrowStyle; from: Anchor; to: Anchor; control?: {x:number;y:number}; label?: string }
  | { id: string; type: 'zone'; shape: 'rect' | 'ellipse' | 'polygon'; points: {x:number;y:number}[]; color: string; opacity: number }
  | { id: string; type: 'line'; points: {x:number;y:number}[]; dashed?: boolean; color: string }
  | { id: string; type: 'text'; at: {x:number;y:number}; text: string; size: number }
  | { id: string; type: 'equipment'; item: EquipmentItem; at: {x:number;y:number}; rotation?: number };

type ArrowStyle = 'pass' | 'run' | 'carry' | 'press' | 'lofted' | 'block' | 'shot';
type Anchor = { entityId: string } | { x: number; y: number };   // un'ancora su entità segue l'entità
type CameraSpec = { mode: 'fixed' } | { mode: 'follow_ball'; zoom: number } | { mode: 'rect'; x:number;y:number;w:number;h:number };
type EquipmentItem = 'cone' | 'disc' | 'pole' | 'mini_goal' | 'goal' | 'hurdle' | 'ladder' | 'mannequin' | 'ring' | 'bib' | 'ball_pile' | 'rebounder' | 'flag' | 'marker_line' | 'tall_cone' | 'arc' | 'wall';
```

### Sequenze riutilizzabili

```ts
// Movimento astratto, senza nomi/foto: si applica a qualunque board mappando ruoli o slot.
type Sequence = {
  id: string; name: string; description?: string;
  slots: { slotId: string; role?: Role; team: 'home' | 'away' }[];
  phases: { durationMs: number; positions: Record<SlotId | 'ball', Position>; paths?: ...; annotations: ... }[];
  coordinateFrame: 'absolute' | 'relative_to_ball';
};
```

L'applicazione di una Sequence fa il binding slot→giocatore (automatico per ruolo, poi correggibile a mano) e accoda o sostituisce le fasi.

### Formazioni

File `data/formations/<id>.json`, posizioni normalizzate 0..1 su metà campo difensiva, specchiate per l'avversario. Il set iniziale: 4-4-2, 4-4-2 rombo, 4-3-3, 4-2-3-1, 4-1-4-1, 4-3-1-2, 4-3-2-1, 4-5-1, 3-5-2, 3-4-3, 3-4-2-1, 5-3-2, 5-4-1, 4-2-2-2 + formazioni a 5, 7 e 9 per i settori giovanili. L'obiettivo è arrivare a ~25.

---

## 6. Comandi (`packages/core/commands`)

Ogni comando: `{ name, description, schema: ZodSchema, apply(board, args) => Board }` puro. Il dispatcher valida, applica, registra le patch Immer per undo/redo ed emette eventi.

Set minimo:

| Comando | Effetto |
|---|---|
| `createBoard` | nuova board con pitch/kind/team |
| `setPitch` | vista, superficie, orientamento, prospettiva, griglia |
| `setTeam` / `setKit` | nome e colori squadra |
| `addPlayer` / `updatePlayer` / `removePlayer` | rosa |
| `applyFormation` | posiziona i giocatori di una squadra nella fase corrente |
| `addPhase` | duplica la fase corrente (o inserisce dopo un indice) |
| `removePhase` / `reorderPhase` / `updatePhase` | durata, hold, easing, label, camera |
| `moveEntity` | posizione di giocatore/palla in una fase |
| `moveEntities` | batch (necessario per AI) |
| `setPath` | traiettoria di un'entità verso una fase |
| `addAnnotation` / `updateAnnotation` / `removeAnnotation` | frecce, zone, linee, testi, attrezzi |
| `copyPhaseContent` / `pastePhaseContent` | copia/incolla tra fasi |
| `saveSequence` / `applySequence` | sequenze riutilizzabili |
| `applySetPieceRoutine` | carica una routine di corner/punizione |
| `describeBoard` | (query, non muta) restituisce un riassunto testuale + JSON compatto: serve all'AI |

Le query (`getBoard`, `describeBoard`, `listFormations`, `listSequences`) sono separate dai comandi che mutano.

---

## 7. Motore di animazione

- `evaluate(board, tMs) => FrameState` funzione pura: dato un tempo globale restituisce posizione di ogni entità, annotazioni visibili, camera.
- Timeline: per ogni fase `i>0`, intervallo di transizione `durationMs` seguito da `holdMs`. La fase 0 ha solo hold.
- Interpolazione posizione: lineare o lungo bezier secondo `PathHint`, con easing della fase.
- Palla `lofted`: posizione 2D interpolata + altezza parabolica → ombra separata e scala dello sprite.
- Se nella fase di arrivo esiste una freccia `pass` con `from: ballCarrier` e `to: giocatore`, la palla segue quella traiettoria (regola di default sovrascrivibile da `paths.ball`).
- Annotazioni: visibili nella loro fase; durante la transizione fanno fade-out/in (configurabile).
- Camera `follow_ball`: centro = palla smorzata (filtro critically damped), zoom costante, clamp ai bordi del campo.
- Playback: play/pausa, scrub, velocità 0.5x/1x/2x, loop, step fase avanti/indietro.
- Test obbligatori: `evaluate` deterministica, valori agli estremi delle transizioni = posizioni delle fasi.

---

## 8. Rendering (`packages/render` + `apps/web`)

- Layer Konva: campo → zone → linee/frecce → giocatori → palla → testi → overlay UI.
- Campo disegnato proceduralmente in base a `PitchConfig` (linee regolamentari in metri, strisce erba, superficie).
- Vista **broadcast**: trasformazione prospettica applicata alle coordinate (omografia fissa campo→schermo), con sprite giocatori che restano dritti e scalano con la profondità.
- Giocatore: dischetto con colori kit + numero; opzionale "card" con foto/nome; indicatore direzione se `facing` presente.
- Frecce con stili distinti: pass = continua, run = tratteggiata, carry = ondulata, press = continua spessa con punta doppia, lofted = arco tratteggiato, block = segmento con barra terminale, shot = continua con punta piena.
- Lo stesso renderer serve per editor, player del link condiviso ed export: nessuna divergenza visiva.

---

## 9. Editor (UI)

- Layout: toolbar strumenti a sinistra, campo al centro, pannello proprietà a destra, **timeline fasi** in basso (striscia di miniature, durata trascinabile).
- Strumenti: selezione, aggiungi giocatore (casa/ospite), palla, ognuno degli `ArrowStyle`, zona, linea, testo, attrezzo.
- Tap-to-place: selezioni un giocatore e tocchi il punto di destinazione (indispensabile su mobile).
- Multi-selezione con riquadro, spostamento di gruppo.
- Scorciatoie: `N` nuova fase, `Del`, `Ctrl/Cmd+Z/Y`, `Ctrl/Cmd+C/V` (contenuto fase), `Space` play, `←/→` fase precedente/successiva, `1–7` strumenti frecce.
- Responsive: utilizzabile su tablet in orizzontale; su telefono almeno visualizzazione + modifiche semplici.
- Pannello **AI** laterale (vedi §11) attivabile.

---

## 9-bis. Lingue (italiano / inglese)

L'app è bilingue dal primo giorno: **italiano** e **inglese**, con architettura pronta ad aggiungerne altre senza toccare il codice.

- **Libreria:** i18next + react-i18next; file di traduzione in `apps/web/src/locales/{it,en}/*.json`, divisi per namespace (`common`, `editor`, `export`, `ai`, `team`).
- **Lingua iniziale:** rilevata da `navigator.language` (`it*` → italiano, altro → inglese); fallback `en`.
- **Selettore lingua** sempre raggiungibile (header + impostazioni); il cambio è immediato, senza ricaricare la pagina. Preferenza salvata in locale e, se loggato, in `profiles.locale`.
- **Nessuna stringa hardcoded** nei componenti: regola ESLint `i18next/no-literal-string` attiva su `apps/web`.
- **Chiavi coerenti:** script CI che fallisce se una chiave esiste in una lingua e manca nell'altra.
- **Contenuti localizzati:** nomi di formazioni, ruoli (GK/POR, CB/DC, FB/TD-TS, DM/MED, CM/CC, AM/TRQ, W/AL, ST/ATT), stili freccia, attrezzi, viste del campo, routine dei calci piazzati, descrizioni dei tool AI mostrate all'utente.
- **Glossario tattico** in `docs/glossary.md` (it ↔ en: mezzala ↔ wide No.8, mezzi spazi ↔ half-spaces, uscita dal basso ↔ build-up, pressing alto ↔ high press…) usato per tradurre UI e prompt in modo coerente.
- **Formattazione:** date, numeri e unità con `Intl` secondo la lingua attiva (metri in entrambe).
- **Export:** PNG/PDF/MP4 usano la lingua attiva per etichette e intestazioni; selezionabile anche al momento dell'export.
- **Link condiviso:** il player `/d/:slug` si mostra nella lingua di chi lo apre (le etichette scritte dall'autore restano come sono).
- **AI Coach:** il system prompt esiste in `coach.it.md` e `coach.en.md`; l'agente risponde nella lingua dell'interfaccia salvo richiesta diversa dell'utente.
- **Dati utente** (nomi giocatori, testi sulla lavagna, note) non vengono tradotti.
- Codice, nomi di comandi/tool, schema JSON e commenti nel codice restano in inglese.

---

## 10. Condivisione ed export

| Funzione | Implementazione |
|---|---|
| Link condivisibile | board salvata su Supabase (`shared_boards`, slug pubblico); route `/d/:slug` read-only con player a schermo pieno, mobile-first |
| MP4 | render offscreen a risoluzione scelta (720p, 1080p; orizzontale 16:9 o verticale 9:16) a fps fissi, frame-by-frame da `evaluate` (non in tempo reale) → WebM via MediaRecorder o encoder WebCodecs dove disponibile → MP4 con ffmpeg.wasm |
| PNG | snapshot della fase corrente o di tutte le fasi (zip) |
| PDF | una pagina per fase con note; per il session planner un A4 con esercizi, griglia in metri, durata, obiettivi |
| JSON | import/export `.diagonale.json` |
| Team Talk | registrazione voce (MediaRecorder) sincronizzata col playback; audio su Supabase Storage, link condivisibile che riproduce board + voce. Modalità presentazione a schermo intero |

---

## 11. Interfaccia AI agnostica (`packages/ai`)

### 11.1 Astrazione provider

```ts
interface AIProvider {
  id: string;                         // 'anthropic' | 'openai-compatible' | 'gemini' | …
  listModels?(): Promise<ModelInfo[]>;
  chat(req: ChatRequest, signal?: AbortSignal): AsyncIterable<ChatEvent>; // streaming
  capabilities: { tools: boolean; vision: boolean; jsonMode: boolean; maxContext?: number };
}

type ChatRequest = {
  model: string;
  system?: string;
  messages: Message[];                 // formato interno neutro
  tools?: ToolDef[];                   // { name, description, inputSchema (JSON Schema) }
  toolChoice?: 'auto' | 'none' | { name: string };
  temperature?: number; maxTokens?: number;
};

type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'done'; usage?: { inputTokens: number; outputTokens: number } }
  | { type: 'error'; error: string };
```

Adapter da implementare:

1. **`anthropic`** — Messages API.
2. **`openai-compatible`** — Chat Completions con `baseUrl` configurabile: copre OpenAI, Mistral, Groq, OpenRouter, Together, DeepSeek, **Ollama** (`http://localhost:11434/v1`), **LM Studio**, vLLM.
3. **`gemini`** — Gemini API.

Ogni adapter traduce messaggi e tool dal formato interno a quello del provider e viceversa. Test di contratto comuni a tutti gli adapter (con fixture registrate, niente chiamate reali in CI).

**Fallback senza tool calling**: se `capabilities.tools === false`, l'agent chiede al modello un blocco JSON `{ "commands": [ … ] }` validato con Zod; in caso di errore di validazione si rimanda l'errore al modello (max 2 retry).

### 11.2 Configurazione

```ts
type AIConfig = {
  providers: { id: string; kind: 'anthropic' | 'openai-compatible' | 'gemini'; baseUrl?: string; apiKeyRef: string; defaultModel: string }[];
  activeProviderId: string;
  transport: 'direct' | 'proxy';      // direct = dal browser (BYOK), proxy = Supabase Edge Function
};
```

- **BYOK** di default: chiave salvata solo in locale (IndexedDB, mai sincronizzata), chiamate dirette dal browser dove il provider lo consente.
- **Proxy** opzionale (`supabase/functions/ai-proxy`): per provider che non accettano CORS o per istanze self-hosted con chiave server-side. Il proxy è passacarte: non salva prompt né board.
- UI impostazioni: aggiungi provider, test connessione, scelta modello.

### 11.3 Agent "AI Coach"

- Loop: utente scrive → modello riceve system prompt + `describeBoard` della board corrente + tool → esegue tool call tramite il command bus → risultati rimandati al modello → fino a `done` o max 20 step.
- Tool esposti = comandi e query del §6 (generati dagli schema Zod).
- Tutte le modifiche di un turno AI sono raggruppate in **una transazione** annullabile con un solo undo, e mostrate come anteprima (diff fasi) prima di confermare, con opzione "applica automaticamente".
- System prompt in `packages/ai/prompts/coach.it.md` e `coach.en.md`: spiega sistema di coordinate in metri, dimensioni del campo, ruoli, semantica delle fasi e degli stili freccia, buone pratiche (es. distanze realistiche tra reparti).
- Casi d'uso target: "costruisci un'uscita dal basso 4-3-3 contro pressing 4-4-2 in 4 fasi", "spiegami questa board", "trasforma questa azione in un esercizio 6v4 su griglia 40×30", "pianifica una seduta di 90' sul pressing".
- Vision opzionale (se il modello la supporta): l'utente allega uno screenshot di una lavagna o di uno schema disegnato a mano → l'AI lo ricostruisce come board. Nessun tracking video.

---

## 12. Server MCP (`packages/mcp-server`)

- Espone gli stessi comandi/query come tool MCP, più risorse `board://<id>` e `formation://<id>`.
- Due modalità:
  1. **file**: opera su file `.diagonale.json` in una cartella (stdio, per Claude Desktop/Claude Code);
  2. **live**: si collega via WebSocket all'app web aperta (la web app espone un bridge locale opt-in), così le modifiche si vedono in tempo reale.
- Tool extra: `export_png`, `export_mp4` (in modalità live delega all'app), `open_in_browser`.
- README con snippet di configurazione per Claude Desktop e Claude Code.

---

## 13. Moduli funzionali aggiuntivi

### 13.1 Calci piazzati
`kind: 'set_piece'`, vista `box`/`half_attack`; 5 routine iniziali in `data/routines` (corner sul primo palo, corner sul secondo palo, corner corto, punizione laterale a uscire, punizione centrale con blocco). Applicabili come Sequence.

### 13.2 Allenamento e session planner
- `kind: 'training'`: campo di dimensione arbitraria in metri, griglia visibile, attrezzi (`EquipmentItem`).
- Session planner: entità `Session { date, durationMin, objectives[], drills: { boardId, durationMin, notes, players: string }[] }` → export PDF A4.

### 13.3 Piano gara
`kind: 'match_plan'`: board multiple raggruppate (fase di possesso, non possesso, transizioni, palle inattive offensive/difensive, uscite) con export PDF unico.

### 13.4 Team Centre (fase successiva)
- Calendario partite: import da link ICS, feed ICS in uscita (senza dati dei giocatori).
- Convocazioni (disponibili, 11 titolare, panchina, capitano), risultati con minuti, gol, cartellini, statistiche stagionali.
- Report partita per i genitori con opzione privacy nomi: completi / solo nome / iniziali. **Default: iniziali** (minori).
- Gancio previsto: import calendari da fonte esterna configurabile (es. dataset TempeFootball).

---

## 14. Backend Supabase

Tabelle (con RLS: il proprietario legge/scrive, `shared_boards` pubbliche in sola lettura):

```sql
profiles(id uuid pk references auth.users, display_name text, locale text)
boards(id uuid pk, owner uuid, title text, kind text, data jsonb, schema_version int, updated_at timestamptz)
shared_boards(slug text pk, board_id uuid, snapshot jsonb, audio_path text null, created_at timestamptz)
sequences(id uuid pk, owner uuid, name text, data jsonb)
sessions(id uuid pk, owner uuid, data jsonb)
teams(id uuid pk, owner uuid, data jsonb)          -- Team Centre
fixtures(id uuid pk, team_id uuid, data jsonb)     -- Team Centre
```

- Auth: magic link email + OAuth Google.
- Uso anonimo completo in locale; login richiesto solo per condividere/sincronizzare.
- Lo snapshot condiviso è immutabile: modificare la board non cambia il link già inviato (si può "aggiornare link").

---

## 15. Requisiti non funzionali

- Avvio editor < 2 s su laptop medio; animazione a 60 fps con 22 giocatori + 30 annotazioni.
- Export MP4 1080p di 20 s in < 60 s su laptop medio.
- PWA installabile, editor utilizzabile offline.
- Accessibilità: navigazione da tastiera nell'editor, contrasti AA nell'interfaccia (non sul campo).
- Privacy: nessun tracking di terze parti; chiavi AI mai inviate al nostro backend in modalità BYOK.
- Schema board retrocompatibile tramite migrazioni testate.

---

## 16. Milestone e criteri di accettazione

**M0 — Fondamenta**
Monorepo, CI (lint, typecheck, test), `core` con schema Zod, command bus, undo/redo.
✔ Test: creare board, aggiungere 22 giocatori con `applyFormation`, 3 fasi, undo/redo completo.

**M1 — Editor + animazione**
Campo (tutte le viste, 2 superfici), giocatori, palla, frecce (7 stili), zone, testi, timeline fasi, playback, tap-to-place, scorciatoie, salvataggio IndexedDB, import/export JSON, i18n it/en completo (§9-bis).
✔ Un utente crea un'uscita dal basso in 4 fasi in < 5 minuti e la riproduce.
✔ Cambiando lingua tutta l'interfaccia passa da italiano a inglese senza ricaricare; CI verde sul controllo chiavi mancanti.

**M2 — Condivisione ed export**
Supabase, link `/d/:slug` mobile, PNG, MP4 (orizzontale + verticale), PDF.
✔ Link aperto da telefono riproduce l'animazione identica all'editor; MP4 scaricabile.

**M3 — AI + MCP**
`packages/ai` con 3 adapter, impostazioni provider, pannello AI Coach con anteprima e undo unico; `mcp-server` modalità file e live.
✔ Con Claude, un modello OpenAI e un modello locale Ollama, il prompt "4-3-3 contro 4-4-2, costruzione dal basso in 4 fasi" produce una board valida.
✔ Da Claude Desktop via MCP si crea e modifica una board visibile live nell'app.

**M4 — Allenamento e piazzati**
Griglie in metri, attrezzi, session planner PDF, routine calci piazzati, Sequence riutilizzabili, vista broadcast.

**M5 — Team Centre**
Come §13.4.

---

## 17. Istruzioni per Claude Code (da copiare in `CLAUDE.md`)

- Leggi `SPEC.md` prima di ogni task; lavora per milestone nell'ordine indicato, una PR per milestone o sotto-feature.
- `packages/core` non deve mai importare React, DOM o Konva.
- Ogni nuovo comando: schema Zod + `apply` puro + test + descrizione utilizzabile come tool AI.
- Nessuna logica di modifica board dentro i componenti React: solo dispatch di comandi.
- Ogni testo visibile all'utente passa da i18next, con chiave aggiunta sia in `it` sia in `en` nello stesso commit.
- Le coordinate nel modello sono sempre in metri; la conversione in pixel sta solo in `render`.
- Nessuna chiamata reale ai provider AI nei test: usa fixture.
- Non usare nomi, loghi, testi o asset di Total Football Studio.
- Quando una scelta non è coperta dalla spec, scegli l'opzione più semplice, annotala in `docs/decisions.md` e prosegui.
