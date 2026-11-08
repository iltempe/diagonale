<p align="center"><img src="apps/web/public/icon-192.png" width="96" alt="Diagonale"></p>

<h1 align="center">Diagonale</h1>
<p align="center"><b>Tactics, phase by phase.</b> A free, open-source animated tactics board for football (soccer) coaches.</p>
<p align="center"><a href="README.md">🇮🇹 Italiano</a> · <b>🇬🇧 English</b></p>
<p align="center">
  <a href="https://github.com/iltempe/diagonale/releases/latest"><img src="https://img.shields.io/github/v/release/iltempe/diagonale?label=release&color=F2C230" alt="Latest release"></a>
  <a href="https://github.com/iltempe/diagonale/actions/workflows/ci.yml"><img src="https://github.com/iltempe/diagonale/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-0F3D2E" alt="License Apache-2.0"></a>
  <a href="https://diagonalecalcio.it/"><img src="https://img.shields.io/badge/web-diagonalecalcio.it-0F3D2E" alt="Website"></a>
</p>
<p align="center"><a href="https://diagonalecalcio.it/app/"><b>▶ Open the app</b></a> · <a href="https://diagonalecalcio.it/">Website</a> · <a href="https://github.com/iltempe/diagonale/releases/latest"><b>⬇ Mac · Windows · Linux</b></a> · <a href="SPEC.md">Specification (IT)</a> · <a href="docs/decisions.md">Design decisions (IT)</a></p>

<p align="center"><a href="https://diagonalecalcio.it/app/"><img src="docs/screenshots/demo.gif" width="800" alt="Diagonale: a build-up from the back animated phase by phase"></a></p>

---

You draw a game situation on a pitch measured in real meters, split it into **phases**, and Diagonale animates the transition from one phase to the next like a video. Then you share it with a link that also opens on phones, export it to MP4, PNG or PDF, or let the **AI Coach** build it with the model of your choice.

It runs in the browser with no installation and no account: your boards stay on your device and the app also works offline (PWA). There is also a **desktop app** for macOS, Windows and Linux, available from the [releases](https://github.com/iltempe/diagonale/releases/latest).

## Features

- **Editor**: home and away players, ball, arrows in 7 styles (pass, run, carry, press, lofted ball, block, shot), zones, lines, text and 17 training equipment items. Multi-selection, tap-to-place on mobile, draggable curves and keyboard shortcuts.
- **Phases and animation**: timeline with thumbnails, draggable duration, easing, lofted ball with shadow, camera that follows the ball, playback at 0.5×/1×/2× with loop.
- **Pitch**: 9 views (full, halves, thirds, penalty box, flanks), 4 surfaces, horizontal or vertical orientation, **broadcast perspective view** and metric grid for drills.
- **25 formations**, including youth 5, 7 and 9-a-side ones, and **5 set-piece routines**. You can save your own sequences and reapply them to other boards.
- **Sharing**: a `#/d/…` link that holds the compressed board (about 2–6 KB, no server involved). It opens full screen and switches to portrait on phones.
- **Export**: PNG of the current phase or of all phases (zip), PDF with one page per phase and its notes, **H.264 MP4** video at 720p or 1080p rendered frame by frame. The **Social video 9:16** button produces a 1080×1920 video for Reels, TikTok and Shorts in one click, with title, current phase and progress bar; 16:9, 4:5 and 1:1 formats are available too. Import and export of `.diagonale.json` files.
- **English and Italian**: switching language is instant; the same choice applies to export labels and to the AI.
- **AI Coach**: works with Claude, OpenAI, Gemini, OpenRouter, Mistral, Groq, DeepSeek and with local models through Ollama or LM Studio. You use your own key, which stays in your browser. AI changes are shown as a preview and can be undone in a single step.
- **MCP server**: Claude Desktop and Claude Code can create and edit boards as files, or *live* in the open app.
- **Team Talk**: record your voice while the animation plays; it stays in sync in presentation mode and is included in the MP4 video.
- **Planner**: training sessions (drills, duration, objectives) as A4 PDF, and match plans by game moment in a single PDF.
- **Team Centre**: squad, calendar with ICS import/export, call-ups, results, minutes, goals, cards, stats, and reports for parents with name privacy (initials by default).
- **Player photos and flags** on the pitch.
- **Optional cloud (Supabase)**: sign-in, sync across devices and short links with audio. See below how to enable it.

## Screenshots

| Editor with phase timeline | AI Coach with preview |
|---|---|
| <img src="docs/screenshots/editor.png" alt="Editor"> | <img src="docs/screenshots/ai-coach.png" alt="AI Coach"> |
| **Broadcast view** | **Session planner** |
| <img src="docs/screenshots/broadcast.png" alt="Broadcast view"> | <img src="docs/screenshots/planner.png" alt="Planner"> |
| **Team Centre** | **Export, including 9:16 social** |
| <img src="docs/screenshots/team.png" alt="Team Centre"> | <img src="docs/screenshots/export.png" alt="Export"> |

<p align="center">
  <img src="docs/screenshots/mobile.png" height="420" alt="Shared link on a phone">
  &nbsp;
  <img src="docs/screenshots/social-9x16.png" height="420" alt="9:16 social video">
</p>
<p align="center"><i>Shared link opened on a phone · frame of a 9:16 social video</i></p>

*The screenshots show the Italian interface; switch to English with the IT/EN selector in the app.*

**Try it now:** [diagonalecalcio.it/app](https://diagonalecalcio.it/app/), nothing to install and no account needed.

## Does your club use Diagonale?

Put the badge on your club's website: generate it, with the club name, in the [badge section of the website](https://diagonalecalcio.it/#badge), or copy this code:

```html
<a href="https://diagonalecalcio.it/?ref=badge" target="_blank" rel="noopener" title="We use Diagonale"><img src="https://diagonalecalcio.it/badge/diagonale-en-dark.svg" alt="We use Diagonale" width="220" height="56"></a>
```

<a href="https://diagonalecalcio.it/?ref=badge"><img src="apps/site/badge/diagonale-en-dark.svg" alt="We use Diagonale" width="220" height="56"></a>
<a href="https://diagonalecalcio.it/?ref=badge"><img src="apps/site/badge/diagonale-en-light.svg" alt="We use Diagonale" width="220" height="56"></a>

Light and Italian versions are also available (`diagonale-{it,en}-{dark,light}.svg`), as well as a plain HTML version that loads nothing from external servers.

## Structure

```
packages/core        model, Zod schema, commands, undo/redo, animation (pure, headless TypeScript)
packages/render      Konva renderer shared by editor, player and exports
packages/ai          model-agnostic AI providers + agent loop
packages/mcp-server  MCP server (stdio / Streamable HTTP, file and live modes)
apps/web             React 19 web app (Vite, Zustand, Dexie, i18next)
apps/desktop         Electron desktop app (macOS, Windows, Linux)
apps/site            static launch website (bilingual)
data/                formations and routines as JSON (generated from packages/core)
supabase/            schema and AI proxy for the optional cloud
```

Every board change goes through a typed **command bus**. The interface, the AI and MCP all use the same commands, which also provide undo/redo and the AI tool definitions (generated from the Zod schemas).

## Development

You need Node ≥ 20 and pnpm 9.

```bash
pnpm install
pnpm dev                 # http://localhost:5173
pnpm test                # unit tests (core, render, ai, mcp-server)
pnpm typecheck && pnpm lint && pnpm check:i18n
pnpm --filter @diagonale/web e2e    # Playwright
```

Every push to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`): website at `diagonalecalcio.it`, app at `diagonalecalcio.it/app/`.

### Desktop app

```bash
pnpm --filter @diagonale/desktop start      # run in development
pnpm --filter @diagonale/desktop dist       # packages for the current OS in apps/desktop/release
```

On every `v*` tag the `release.yml` workflow builds the apps for macOS, Windows and Linux together with `diagonale-mcp.js`, and publishes them in the GitHub release.

### Optional cloud (Supabase)

1. Create a Supabase project and apply `supabase/migrations/0001_init.sql`.
2. In *Authentication* enable email (magic link) and, if you like, Google; add `https://diagonalecalcio.it/app/` to the redirect URLs.
3. In the GitHub repository set the variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (*Settings → Secrets and variables → Actions → Variables*) and re-run the deploy.

Without these variables the app stays fully local and share links carry the board in the address.

### AI with local models

- **Ollama**: start it with `OLLAMA_ORIGINS=* ollama serve`, then pick "Ollama (local)" in the settings. In the desktop app no extra configuration is needed.
- **LM Studio**: enable CORS in the local server (not needed in the desktop app).

If a model does not support tool calling, untick the option: the agent switches to a validated JSON protocol, with at most 2 correction attempts.

### MCP server

See [`packages/mcp-server/README.md`](packages/mcp-server/README.md).

## What's new

See [`CHANGELOG.md`](CHANGELOG.md) (Italian). Choices not covered by the specification are in [`docs/decisions.md`](docs/decisions.md); deployment notes in [`docs/deploy.md`](docs/deploy.md).

## Contributing

Bug reports, ideas and pull requests are welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Privacy

The app uses no cookies, analytics or tracking: boards stay on your device (or in your own Supabase, if you enable it). Only the presentation website counts visits anonymously and without cookies with [GoatCounter](https://www.goatcounter.com), whose script is hosted on the site itself. Clicks on downloads, shares and badges are counted too, to see which clubs use Diagonale.

## Author and support

Made by [Iltempe](https://github.com/iltempe). If Diagonale is useful to you, you can [buy me a coffee ☕](https://buymeacoffee.com/iltempe) or star ⭐ the repository.

## License

[Apache-2.0](LICENSE). Diagonale is an independent project: it offers some *features* common to tactics boards, but no names, graphics, text or assets of other products.
