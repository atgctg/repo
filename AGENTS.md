Be concise.

Read files fully once from beginning to end, not many small partial reads.

Use Bun APIs (Bun.file, Bun.write, Bun.Glob, bun:sqlite, Bun.$); use node:* only when Bun has no equivalent.

Do not write comments.

Greenfield project, no backwards compatibility needed.

1k+ lines are fine if they make sense (e.g. styles.css).

After code changes, run `bun run fix` and resolve any errors.

Never call `useEffect` directly. Prefer derived state (React Compiler is enabled), event handlers, query libraries, `key` remounts, or `useMountEffect()` for one-time external sync. See `no-use-effect` skill for more.

No animations and transitions for now.

# Starting points

- src/server.ts
- src/types.ts
- src/tools.ts
- prompts/system.md

# Overview

Interactive visual storytelling app.

Currently focusing on the internal studio, playtesting/evaluation, improving storytelling, coming up with data structures, coming up with the architecture design.

## Interface (eventually)

- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay
