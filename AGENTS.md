# Verse (by Omni Interactive Inc.)

Interactive visual storytelling app.

Currently focusing on playtesting & evaluations to increase the quality of the generations, improving storytelling, and figuring out the right architecture.

## UI (eventually)

- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay

# Instructions

Be concise.

Do not write comments.

Use Bun as the package manager and script runner. In scripts use `Bun.$` APIs instead of Node.js.

Look up the latest docs & best practices when integrating an API.

Greenfield project, no backwards compatibility needed.

After code changes, run `bun run fix` and resolve any errors.

Never call `useEffect` directly. Prefer derived state (React Compiler is enabled), event handlers, query libraries, `key` remounts, or `useMountEffect()` for one-time external sync. See `no-use-effect` skill for more.

No animations and transitions for now.

Only change `AGENTS.md` and prompt files with human permission.

A question with '??' means you should just answer quickly without doing any work.

# Workflow

- Work on short-lived branches off `main`.
- Never `wrangler deploy` from a branch. Use the preview URL that CI posts on the PR.
- The coordinator merges into `main` when CI is green.
- Production deploys only from `main`.
- A batched thermo-nuclear review runs on `main` after a chunk of work.
- Schema migrations run only on `main`.
- Previews share the prod DB for now.
- PR description should be short decision log, focus only on what the diff doesn't show.

# Starting points

```
shared/types.ts
shared/project.ts
api/src/worker.ts
api/src/turn.ts
api/src/tools.ts
api/src/schema.ts
api/prompt.md
api/wrangler.jsonc
api/package.json
web/wrangler.jsonc
web/package.json
web/app/*
```

# Concepts

- Verse: the app. `verse-web` (global) and `verse-api` (pinned to aws:us-east-2)
- World: a story template, stored in Postgres
- Story: a fork of a world; holds the append-only event log
- Template: the events before the first input
- Event: one log entry (input, output, image, dialogue, video, card, delete)
- Input: what the user did (text, selected scenes, pasted text, voice)
- Output: the model's markdown text
- Projection: state derived from events (`project()`): scenes, cards, assets
- Scene: one timeline item, an image, video, dialogue, or message
- Storyboard: the grid view of a story's scenes
- Card: used for defining and keeping track of characters, lore, rules, instructions, etc. A bit like Skill + Memory files in one.
- Turn: one input plus the events the model adds in response

# Database

Planetscale Postgres `verse` db is hosted on AWS in us-east-2.

The database schema lives in `api/src/schema.ts`. Change it only through `drizzle-kit` migrations.

Generated UUID primary keys default to Postgres `uuidv7()`.

Bulk data changes are committed scripts in `api/scripts/` (Drizzle, batched, in one transaction), never hand-run SQL.
