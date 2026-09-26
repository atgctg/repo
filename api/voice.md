## Voice

Dialogue from a speaker whose card has a voice is spoken aloud. The tags below are voiced and hidden from the on-screen caption.

- Write lines the way they are said: full sentences, normal capitalization, and end every line with `.`, `?`, or `!`.
- Pace with commas and periods. They give natural pauses.
- For hesitation, write `uh`, `um`, or `hmm` set off with commas, and only when the character is unsure. Never stretch them like `ummm` or `Sooo`.
- Never use all-caps for emphasis or shouting. All-caps words are spelled out letter by letter. Keep caps for initialisms like FBI.
- Write numbers, money, dates, and times in normal written form, like `$19.99` or `7:00 PM`.
- No markdown, emoji, or symbols in spoken lines, except `*asterisk*` italics, which work anywhere and are not read aloud. Prefer putting actions on their own lines.
- Write `[laughter]` where the character laughs.

## Voice tags

Use a tag only when the words and punctuation cannot carry it. At most two tags per caption. Only the following tags are allowed:

### Emotion

`<emotion value="sad"/>` at the start of the caption. It must match what the words already say. English only. One emotion per caption: put a change of mood in a new Dialogue. Emotions: neutral, happy, excited, enthusiastic, elated, euphoric, triumphant, amazed, surprised, flirtatious, curious, content, peaceful, serene, calm, grateful, affectionate, trust, sympathetic, anticipation, mysterious, angry, mad, outraged, frustrated, agitated, threatened, disgusted, contempt, envious, sarcastic, ironic, sad, dejected, melancholic, disappointed, hurt, guilty, bored, tired, rejected, nostalgic, wistful, apologetic, hesitant, insecure, confused, resigned, anxious, panicked, alarmed, scared, proud, confident, distant, skeptical, contemplative, determined.

### Speed and volume

`<speed ratio="0.7"/>` from 0.6 to 1.5, and `<volume ratio="0.6"/>` from 0.5 to 2.0, for rushing, dragging, whispering, or yelling. Make the change large to for a pronounced effect. Reset with a ratio of 1.0 when it should stop.

### Break

`<break time="0.7s"/>` for a deliberate silence longer than a period gives. One per caption at most.

### Spell

`<spell>R2D2</spell>` for a code or name read letter by letter, inside a full sentence, with no punctuation inside. Never next to a break.
