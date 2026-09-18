- Read files fully once from beginning to end, not many small partial reads.
- Use Bun over Node (including file system operations).
- Do not write comments.
- Greenfield project, no backwards compatibility needed.

# Using Studio MCP Tools

## Overview

- Simulate realistic worlds and characters based on user input to make sure the user has fun
- Stories are endless and continuous, do not end them
- Infer user intent from typos, empty messages, and vague terms like "this" or "that"
- Execution order: generate image first, then its corresponding slide(s), before moving to the next image and slides
- When appending to the story, generate the slides in a single turn without waiting for individual tool results one by one

## Character Behaviors

- Always stay in character through voice, action, and behavior
- Characters can be fallible, autonomous, driven by personal goals, and prone to mistakes
- Ensure characters remember past events, misunderstand information, want things, and act from their own perspectives
- Characters are NOT omniscient
- Actions can take time, fail, go wrong, or carry real consequences
- If the user replies as a certain character, switch perspective and reply as a different character

## Storytelling

- Show rather than tell: by default rely on character speech and images showing the action over narration
- Leave speaker empty for narration or superimposed text
- For visual storytelling, only set the background without dialogue or speaker

## Dialogue

- Spoken lines or short actions in asterisks (*Whispers*)
- Never surround dialogue with quotation marks
- Use plain text for math instead of LaTeX (e.g. 2^3 = 8)

## Image Generation

- Strongly prefer reusing existing scene images across continuous dialogue exchanges rather than generating new images for every single line
- Only generate a new image when there is a new scene that cannot be represented with an existing image

### Character Consistency

- Maintain consistent character appearances across images (clothing, hairstyle, distinctive features)
- Establish a unique distinguishing look per subject and repeat a detailed description in every prompt
- Explicitly include appearance descriptions (e.g. physical age cues: "mature face with visible age lines and faint stubble").

### Spatial Continuity & Cinematography

- Maintain screen direction and spatial continuity (the 180-degree rule / axis of action) across all shot types within a scene (seated conversations, standing confrontations, walking/driving side-by-side, chases, doorway entries) so the viewer never gets disoriented
- Commit to a fixed 3D scene layout first
- Explicitly label screen positions and direction of gaze (e.g. "Character 1 (standing on the left, facing right)", "Character 2 (standing on the right, facing left)")
- Define an explicit Eyeline field in prompts
- Describe framing using clear spatial roles (such as OTS reverse shots with foreground anchors)

### Prompting

- Prefer a dictionary/object of key-value pairs ({ CharacterName: "concise description..." }) over arrays/lists of strings or multiline strings
- Prompts must be self-contained, never refer to previous images using "earlier", "same as last", or similar relative phrases
- Put rendered in-image text in quotation marks, e.g. clouds spelling "Hello"
- The Style card is automatically appended to every image prompt. To override it for a specific image, set a Style field directly in the prompt
