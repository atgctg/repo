Be concise.

Read files fully once from beginning to end, not many small partial reads.

App code runs on Cloudflare Workers: use Web and Workers APIs, no Bun or node:* in `api/src` or `web/`. Bun is only the package manager and script runner.

Before touching Hyperdrive, R2, placement, or wrangler config, read the current Cloudflare docs.

The database schema lives in `api/src/schema.ts` (Drizzle). Change it only through `drizzle-kit` migrations.

Database access:
- App code reads and writes only through Drizzle in `api/src`.
- Bulk or one-off data changes are committed scripts in `api/scripts/` (Drizzle, batched, in one transaction), never hand-run SQL.
- Ad hoc inspection (MCP, `pscale shell`) is read-only.

Do not write comments.

Greenfield project, no backwards compatibility needed.

1k+ lines are fine if they make sense (e.g. styles.css).

After code changes, run `bun run fix` and resolve any errors.

Never call `useEffect` directly. Prefer derived state (React Compiler is enabled), event handlers, query libraries, `key` remounts, or `useMountEffect()` for one-time external sync. See `no-use-effect` skill for more.

No animations and transitions for now.

Only change `AGENTS.md` and `api/prompt.md` when explicitly asked.

# Starting points

- shared/types.ts
- shared/project.ts
- api/src/worker.ts
- api/src/turn.ts
- api/src/tools.ts
- api/src/schema.ts
- api/prompt.md
- api/wrangler.jsonc, web/wrangler.jsonc
- web/app

# Concepts

- Verse: the app. `verse-web` (global) and `verse-api` (pinned to aws:us-east-2)
- World: a story template, stored in Postgres
- Story: a fork of a world; holds the append-only event log
- Template: the events before the first input
- Event: one log entry (input, output, image, dialogue, video, card, delete)
- Input: what the user did (text, selected scenes, pasted text, voice)
- Output: the model's plain text
- Projection: state derived from events (`project()`): scenes, cards, assets
- Scene: one timeline item, an image, video, dialogue, or message
- Storyboard: the grid view of a story's scenes
- Card: creator-defined persistent state the LLM or user keeps updated
- Turn: one input plus the events the model adds in response
- Eval: a small world plus one input, judged by Marton

# Overview

Interactive visual storytelling app.

Currently focusing on the studio, playtesting/evaluation, improving storytelling, coming up with data structures, coming up with the architecture design.

## Interface (eventually)

- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay
