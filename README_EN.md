[![License](https://img.shields.io/github/license/huanweide/novel-forge)](LICENSE)
[![CI](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/huanweide/novel-forge)](https://github.com/huanweide/novel-forge/stargazers)
[![UI Preview](https://img.shields.io/badge/UI%20Preview-novel--forge--nu.vercel.app-6366f1)](https://novel-forge-nu.vercel.app)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/huanweide/novel-forge/pulls)

![Novel Forge](docs/banner.svg)

# Novel Forge — AI Novel Workshop

> A **local-first** AI writing workshop for long-form web novels — characters, lore, outlines, and chapters, all in one place.

[🖼 UI Preview](https://novel-forge-nu.vercel.app) · [📦 Quick Start](#quick-start) · [中文 README](README.md) · [⭐ Star on GitHub](https://github.com/huanweide/novel-forge/stargazers)

**Current Version: v3.1.57** · Local SQLite, zero-config · 17 built-in presets · MIT License

> **About the UI Preview**: the link above only shows **what the interface looks like** — it cannot actually be used. It runs in a read-only cloud environment, while Novel Forge needs to write into a local SQLite file. **Run it on your own machine via "Quick Start" below** — it takes about two minutes.

---

## The Problem

Writing a long web novel is easy at Chapter 1, painful at Chapter 50:

- Characters multiply, and you forget who did what.
- Foreshadowing gets dropped; settings contradict each other.
- The AI "forgets" the story after 30 chapters and starts writing filler.
- You stare at a blank page, unsure where the plot goes next.
- Exporting to Word for your editor turns into a formatting nightmare.

Novel Forge automates the grunt work — so you can focus on the creative work.

---

## Screenshots

| Home — Projects & Presets | Explore — Chat-Based World Building |
|---|---|
| ![](docs/screenshots/home.png) | ![](docs/screenshots/explore.png) |

---

## Why Novel Forge

| Pain Point | Traditional Tools | Novel Forge |
|---|---|---|
| Forgetting lore after 50 chapters | Manual spreadsheets | **Auto-fill tables**: extracts people, places, factions per chapter and auto-creates character cards & lorebook entries |
| Tangled character relationships | Draw graphs by hand | **Relationship graph**: draggable nodes, persisted layout, double-click to open cards |
| AI degrades over long stories | Dump full text into context | **Tiered memory engine**: full recent chapters + summaries + long-range compression |
| Writer's block | Stare at blank page | **Explore mode (11 steps)** + **stitch-monster plot continuation**: auto-spawns new main arcs when old ones end |
| Messy exports | Manual formatting | **One-click export** to TXT, Markdown, HTML, EPUB, DOCX |
| Cloud privacy concerns | Third-party SaaS | **Local SQLite**: your API keys and manuscripts never leave your machine |

---

## Core Highlights

- **Lore pipeline (auto-fill, optional)** — After each chapter, extract structured facts and sync them to character cards, lorebook entries, and storyline beats.
- **Long-form memory** — Sliding window + long-range chapter compression + S/A/B event tiers keep the AI coherent across 100+ chapters.
- **Batch writing two-stage flow** — Generate 1–10 chapters: outlines first, edit them, then generate bodies in the background.
- **Stitch-monster continuation** — When the main arc ends, the system proposes the next arc; never run out of plot.
- **Character cards & relationship graph** — Full cards, AI fill/expand, auto-deduplication, and a draggable graph view.
- **Local-first** — Everything runs on `localhost` with a single SQLite file (`./data/novelforge.db`). No Docker, no cloud, no account.
- **15-category lorebook system** — Destiny, physics, public systems, etc., automatically routed by a deterministic classifier.
- **Book dissection** — 15-dimension analysis of other novels + style mimic engine.

---

## Quick Start

```bash
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
cp .env.example .env
npm install
npm run dev:db   # creates DB, starts server at http://localhost:3001
```

> Data lives in `./data/novelforge.db`. Back it up by copying the file.  
> `.env` is gitignored; your API keys stay local.

### Configure an LLM Provider

1. Open **Settings** (top-right).
2. Pick a provider (recommended: **SiliconFlow** for cheap DeepSeek models).
3. Paste your API key and click **Test Connection**.
4. Save.

---

## Tech Stack

- Next.js 16 (App Router) + React 19
- Tailwind CSS v4 (Void Glass design system)
- SQLite + better-sqlite3 + Prisma 7
- Next.js API Routes + SSE + background job table
- OpenAI-compatible multi-provider LLM client
- TypeScript strict mode (zero-error gate)

---

## Local Development

```bash
npm run dev         # localhost:3001, Turbopack HMR
npx tsc --noEmit    # type-check gate
npx prisma studio   # DB admin UI at localhost:5555
npx prisma db push  # sync schema
```

---

## Production Deploy Notes

```bash
npm run build
npm start
```

Novel Forge has **no built-in authentication**. If you deploy to the public internet, put it behind a reverse proxy with Basic Auth, Tailscale, or an IP whitelist.

---

## Contributing

- ⭐ **Star** the repo if it saves you time.
- 🐛 **Open an Issue** for bugs or ideas.
- 🔧 **Send a PR** for fixes or features.
- 💬 **Share** presets exported as `.preset.json` — the best ones may become built-in examples.

---

## Sponsor

If Novel Forge helped you finish a story, you can buy the author a coffee — entirely optional, and it changes nothing about the features.

- **WeChat QR**: Settings → scroll to the bottom "赞助支持" section, scan with WeChat
- **GitHub Sponsor**: the Sponsor button on this repo — the same QR code
- Want your own QR? Drop `wechat-qr.png` into `public/sponsor/` (see `public/sponsor/README.md`)

> The QR image is just a payment entry point — no keys, no credentials, a plain static file that is safe to commit. The project collects no donation amounts or messages on any backend.

---

## License

MIT License — see [LICENSE](LICENSE)

---

> Novel Forge · AI Novel Workshop · Local-first · Your data stays yours
