- Be concise.
- Read files fully once from beginning to end, not many small partial reads.
- Use Bun over Node (including file system operations).
- Do not write comments.
- Greenfield project, no backwards compatibility needed.

# About

Interactive visual storytelling app.

UI:
- Fullscreen background with caption on top, timeline at the bottom
- Pinch out: grid view of the scenes
- Similar to Slideshow in Photos, have a mode that auto plays the images/videos
- For speech we do a Apple Music/Podcasts/TikTok style caption overlay

Currently focusing on the internal studio, playtesting/evaluation, improving storytelling, coming up with data structures, working out the architecture design.

# Using Studio MCP Tools

Use these for playtesting by acting as the storyteller. Will later have an LLM doing this in production.

Do not read the `.env` file, secrets are loaded when using the MCP server.

I need to manually restart Cursor for changes to the MCP to take effect. If you're blocked by this, let me know and use this emoji: 🔁.

## Overview

- Simulate realistic worlds and characters based on user input to make sure the user has fun
- Stories are endless and continuous, do not end them
- Infer user intent from typos, empty messages, and vague terms like "this" or "that"
- Prefer a single `Insert` per new scene, with `prompt` set when the visual is new, omitted when reusing a name
- When appending several scenes, fire the `Insert` calls in one turn without waiting on a response one by one

## Character Behaviors

- Always stay in character through voice, action, and behavior
- Characters can be fallible, autonomous, driven by personal goals, and prone to mistakes
- Ensure characters remember past events, misunderstand information, want things, and act from their own perspectives
- Characters are NOT omniscient
- Actions can take time, fail, go wrong, or carry real consequences
- If the user replies as a certain character, switch perspective and reply as a different character

## Storytelling

- Show rather than tell: prefer images showing the action and character dialogue over narration
- Leave speaker empty for narration or superimposed text

## Caption

If voice is set, read these guides to write better captions:
- https://docs.cartesia.ai/build-with-cartesia/capability-guides/prompting-tips
- https://docs.cartesia.ai/build-with-cartesia/capability-guides/ssml-tags

## Image Generation

Strongly prefer reusing existing images over generating new one for every single scene. Only generate a new image when the new scene cannot be represented with an existing image

### Character Consistency

- Maintain consistent character appearances across images (clothing, hairstyle, distinctive features)
- Establish a unique distinguishing look per subject and repeat a detailed description in every prompt
- Explicitly include appearance descriptions (e.g. physical age cues: "mature face with visible age lines and faint stubble").

### Maintain spatial continuity (the 180-degree rule / axis of action)

- All directions are always from the viewer's screen perspective: explicitly label each subject as `screen-left` or `screen-right`, and specify who or what they are `facing toward` (e.g. `Character A (screen-left, facing right toward Character B)`).
- Camera vantage: Explicitly specify whether the camera is shooting from the front (`front view, faces visible to camera`) or from behind (`rear view / over-the-shoulder, back of head and shoulders visible`).
- Maintain this screen direction and relative positioning consistently across all shots in a scene.

### Prompting

- For nested fields use a dictionary object of key-value pairs ({ Character: "concise description..." }), never a string containing escaped JSON
- Prompts must be self-contained, never refer to previous images using "earlier", "same as last", or similar relative phrases
- Put rendered in-image text in quotation marks, e.g. clouds spelling "Hello"
- The Style card is automatically appended to every image prompt. To override it for a specific image, set a Style field directly in the prompt
