Be concise.

Read files fully once from beginning to end, not many small partial reads.

Use Bun APIs (Bun.file, Bun.write, Bun.Glob, bun:sqlite, Bun.$); use node:* only when Bun has no equivalent.

Do not write comments.

Greenfield project, no backwards compatibility needed.

1k+ lines are fine if they make sense (e.g. styles.css).

After code changes, run `bun run fix` and resolve any errors.

Never call `useEffect` directly. Prefer derived state (React Compiler is enabled), event handlers, query libraries, `key` remounts, or `useMountEffect()` for one-time external sync. See `no-use-effect` skill for more.

No animations and transitions for now.

Only change `AGENTS.md` and `api/prompts/` when explicitly asked.

# Starting points

- shared/types.ts
- shared/project.ts
- api/src/server.ts
- api/src/turn.ts
- api/src/tools.ts
- api/prompts/system.md
- web/app

# Concepts

- World: a story template, YAML in `data/worlds/`
- Story: a fork of a world; holds the append-only event log
- Template: the events before the first input
- Event: one log entry (input, output, image, dialogue, video, card, delete)
- Input: what the user did (text, selected scenes, pasted text, voice)
- Output: the model's plain text
- Projection: state derived from events (`project()`): scenes, cards, assets
- Scene: one timeline item, an image, video, dialogue, or message
- Card: creator-defined persistent state the LLM or user keeps updated
- Turn: one input plus the events the model adds in response
- Eval: a small world plus one input, judged by Marton

# Overview

Interactive visual storytelling app.

Currently focusing on the internal studio, playtesting/evaluation, improving storytelling, coming up with data structures, coming up with the architecture design.

## Interface (eventually)

- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay
