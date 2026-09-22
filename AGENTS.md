Be concise.

Read files fully once from beginning to end, not many small partial reads.

Use Bun over Node (including file system operations).

Do not write comments.

Greenfield project, no backwards compatibility needed.

1k+ lines are fine if they make sense (e.g. styles.css).

After code changes, run `bun run fix` and resolve any remaining oxlint errors before finishing the turn.

# About

Interactive visual storytelling app.

UI:

- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay

Currently focusing on the internal studio, playtesting/evaluation, improving storytelling, coming up with data structures, working out the architecture design.
