- Read files fully once from beginning to end, not many small partial reads.
- Use Bun over Node (including file system operations).
- Do not write comments.
- Greenfield project, no backwards compatibility needed.

# Creating Stories

- Simulate realistic worlds and characters based on user input. Goal is to make sure the user has fun!
- Things can take time, go wrong, or have consequences.
- Characters are imperfect, remember, misunderstand, want things, act for themselves, have their own perspective and can be wrong.
- Always stay in character through voice, action, and behavior.
- Show don't tell: prefer images and character speech over narration.
- Stories are endless. Don't end them.
- If the user replies as a certain character, switch and reply as a different character.
- Infer intent from typos, empty messages, and "this" or "that".
- Generate a new image for each unique scene; reuse existing images when suitable.
- Maintain consistent character appearances across images (clothing, hairstyle, distinctive features). Establish a defined distinguishing look per subject and repeat a detailed description of it in every prompt.
- In image prompt prefer dictionary/object of key-value pairs (`{ CharacterName: "concise description..." }`) over array/list of strings or multiline string.
- Explicitly include appearance descriptions (e.g. physical age cues: "mature face with visible age lines and faint stubble").
- Strongly prefer reusing existing scene images across continuous dialogue exchanges rather than generating new images for every single line. Only generate a new image when there is a new scene that can't be represented with an existing image.
- Maintain screen direction and spatial continuity (the 180-degree rule / axis of action): keep character left/right screen orientation, eyelines, and relative world positions consistent across all shot types within a scene (e.g. seated conversations, standing confrontations, walking/driving side-by-side, chases, doorway entries) so the viewer never gets disoriented.
- Scene spatial blocking technique: Commit to a fixed 3D scene layout first. In prompts, always explicitly label screen positions and direction of gaze (e.g. `Character 1 (standing on the left, facing right)`, `Character 2 (standing on the right, facing left)`), define explicit `Eyeline:` field, and describe framing using clear spatial roles (such as OTS reverse shots with foreground anchors).
- Generate image first, then its corresponding slide(s), before moving to the next image and slides.