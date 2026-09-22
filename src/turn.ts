import { errorMessage, generateStoryImage, generateStoryVideo, generateStoryVoice, resolveVoiceId } from "./media";
import { eventsToMessages, type ChatMessage, type ToolCall } from "./messages";
import { normalizeRecord } from "./records";
import { finishTools, noteToolDelta, type OpenTool, type ToolDelta } from "./stream";
import { changeStory, persistStory, readSceneLines, refresh } from "./stories";
import { STORY_TOOLS } from "./tools";
import type { CardEvent, DeleteEvent, DialogueEvent, ImageEvent, MessageEvent, Story, StoryEvent, VideoEvent } from "./types";

const MODEL = "accounts/fireworks/models/deepseek-v4p1-flash";
const MAX_LOOPS = 3;

const systemPrompt = await Bun.file(`${import.meta.dir}/../prompts/system.md`).text();

export async function reply(storyId: string, input: { text: string; at?: number }): Promise<Story> {
  return changeStory(storyId, async (story) => {
    const text = input.text.trim();
    if (typeof input.at === "number") {
      const target = story.events[input.at];
      if (target?.type !== "message" || !target.user) throw new Error("Can only rewind a user message");
      target.text = text;
      story.events.splice(input.at + 1);
    } else {
      story.events.push({ type: "message", user: "user", text });
    }
    await run(story);
    return story;
  });
}

function disk(story: Story) {
  let writing = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const enqueue = (project: boolean) => {
    writing = writing.then(async () => {
      if (project) await refresh(story);
      await persistStory(story);
    });
    return writing;
  };
  return {
    soon() {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void enqueue(false);
      }, 150);
    },
    now(project: boolean) {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      return enqueue(project);
    },
  };
}

async function run(story: Story): Promise<void> {
  const save = disk(story);
  await save.now(true);
  const messages: ChatMessage[] = [{ role: "system", content: systemPrompt }, ...eventsToMessages(story.events)];
  for (let loop = 0; loop < MAX_LOOPS; loop++) {
    const calls: ToolCall[] = [];
    const results: { id: string; content: string }[] = [];
    let read = false;
    let chain = Promise.resolve();
    let draft: MessageEvent | undefined;
    const publish = () => save.now(true);
    for await (const part of streamCompletion(messages)) {
      if (part.type === "text") {
        if (!draft) {
          draft = { type: "message", text: part.text };
          story.events.push(draft);
        } else {
          draft.text += part.text;
        }
        save.soon();
        continue;
      }
      calls.push(part.call);
      chain = chain.then(async () => {
        const result = await execute(story, part.call.function.name, parseArgs(part.call.function.arguments), publish);
        if (result.read) read = true;
        results.push({ id: part.call.id, content: result.content });
      });
    }
    await chain;
    const spoken = draft?.text.trim() ?? "";
    if (draft) {
      if (spoken) draft.text = spoken;
      else {
        const at = story.events.indexOf(draft);
        if (at >= 0) story.events.splice(at, 1);
      }
    }
    if (calls.length === 0) break;
    if (!read) break;
    messages.push({
      role: "assistant",
      ...(spoken ? { content: spoken } : {}),
      tool_calls: calls,
    });
    for (const result of results) {
      messages.push({ role: "tool", tool_call_id: result.id, content: result.content });
    }
  }
}

async function execute(
  story: Story,
  name: string,
  args: Record<string, unknown>,
  publish: () => Promise<void>,
): Promise<{ content: string; read?: boolean }> {
  if (name === "Read") return { content: readSceneLines(story, numbers(args)), read: true };
  const event = toolEvent(name, args);
  if (!event) return { content: `Unknown tool ${name}` };
  return apply(story, event, publish);
}

function toolEvent(name: string, args: Record<string, unknown>): StoryEvent | undefined {
  switch (name) {
    case "Image":
      return imageEvent(args);
    case "Dialogue":
      return dialogueEvent(args);
    case "Video":
      return videoEvent(args);
    case "Card":
      return cardEvent(args);
    case "Delete":
      return deleteEvent(args);
    default:
      return undefined;
  }
}

async function apply(story: Story, event: StoryEvent, publish: () => Promise<void>): Promise<{ content: string }> {
  switch (event.type) {
    case "image":
      return applyImage(story, event, publish);
    case "dialogue":
      return applyDialogue(story, event, publish);
    case "video":
      return applyVideo(story, event, publish);
    case "card":
      story.events.push(event);
      await publish();
      return { content: event.error ?? "ok" };
    case "delete":
      if (!resolves(story, event)) event.error = "no scenes at those indices";
      story.events.push(event);
      await publish();
      return { content: event.error ?? "ok" };
    case "message":
      return { content: event.text };
    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

async function applyImage(story: Story, event: ImageEvent, publish: () => Promise<void>): Promise<{ content: string }> {
  story.events.push(event);
  await publish();
  if (!event.error && event.prompt) {
    try {
      await generateStoryImage(story, event.name, event.prompt, event.references ?? []);
    } catch (error) {
      event.error = errorMessage(error);
      console.error("img gen error", { storyId: story.id, name: event.name, error: event.error });
    }
    await publish();
  }
  return { content: event.error ?? "ok" };
}

async function applyDialogue(story: Story, event: DialogueEvent, publish: () => Promise<void>): Promise<{ content: string }> {
  story.events.push(event);
  await publish();
  const voice = event.speaker
    ? story.cards.find((card) => card.name.toLowerCase() === event.speaker?.toLowerCase())?.voice
    : undefined;
  if (event.speaker && event.caption && voice && resolveVoiceId(voice)) {
    try {
      await generateStoryVoice(story.id, voice, event.caption);
    } catch (error) {
      console.error("voice skip", { storyId: story.id, error: errorMessage(error) });
    }
    await publish();
  }
  return { content: "ok" };
}

async function applyVideo(story: Story, event: VideoEvent, publish: () => Promise<void>): Promise<{ content: string }> {
  story.events.push(event);
  if (!event.error && (event.prompt || event.firstFrame)) {
    const storyId = story.id;
    const name = event.name;
    void generateStoryVideo(story, name, event.prompt ?? {}, {
      firstFrame: event.firstFrame,
      lastFrame: event.lastFrame,
      duration: event.duration,
    }).catch((error) => {
      const message = errorMessage(error);
      console.error("video gen error", { storyId, name, error: message });
      event.error = message;
      void changeStory(storyId, (current) => {
        for (let index = current.events.length - 1; index >= 0; index--) {
          const target = current.events[index];
          if (target?.type !== "video" || target.name !== name) continue;
          if (!target.error) target.error = message;
          return;
        }
      });
    });
  }
  await publish();
  return { content: event.error ?? "ok" };
}

function imageEvent(args: Record<string, unknown>): ImageEvent {
  const name = string(args.name);
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt);
  const references = names(args.references);
  const event: ImageEvent = {
    type: "image",
    name: name || "Image",
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(references.length > 0 ? { references } : {}),
    ...placement(args),
  };
  if (!name) event.error = "name is required";
  else if (!event.prompt) event.error = `No prompt for image "${name}"`;
  return event;
}

function dialogueEvent(args: Record<string, unknown>): DialogueEvent {
  const speaker = string(args.speaker);
  const caption = string(args.caption);
  return {
    type: "dialogue",
    background: string(args.background),
    ...(speaker ? { speaker } : {}),
    ...(caption ? { caption } : {}),
    ...placement(args),
  };
}

function videoEvent(args: Record<string, unknown>): VideoEvent {
  const name = string(args.name);
  const prompt = args.prompt === undefined ? undefined : normalizeRecord(args.prompt);
  const firstFrame = string(args.firstFrame);
  const lastFrame = string(args.lastFrame);
  const duration = number(args.duration);
  const event: VideoEvent = {
    type: "video",
    name: name || "Video",
    ...(prompt && Object.keys(prompt).length > 0 ? { prompt } : {}),
    ...(firstFrame ? { firstFrame } : {}),
    ...(lastFrame ? { lastFrame } : {}),
    ...(duration ? { duration } : {}),
    ...placement(args),
  };
  if (!name) event.error = "name is required";
  else if (!event.prompt && !event.firstFrame) event.error = `No prompt for video "${name}"`;
  return event;
}

function cardEvent(args: Record<string, unknown>): CardEvent {
  const name = string(args.name);
  const attributes = args.attributes === undefined ? undefined : normalizeRecord(args.attributes);
  const event: CardEvent = {
    type: "card",
    name: name || "Card",
    ...(args.cover === null || typeof args.cover === "string" ? { cover: args.cover } : {}),
    ...(args.voice === null || typeof args.voice === "string" ? { voice: args.voice } : {}),
    ...(attributes ? { attributes } : {}),
  };
  if (!name) event.error = "name is required";
  return event;
}

function deleteEvent(args: Record<string, unknown>): DeleteEvent {
  const indices = Array.isArray(args.indices)
    ? args.indices.filter((index): index is number => typeof index === "number")
    : typeof args.indices === "number"
      ? [args.indices]
      : typeof args.index === "number"
        ? [args.index]
        : [];
  return { type: "delete", indices };
}

function resolves(story: Story, event: DeleteEvent): boolean {
  const length = story.scenes.length;
  return event.indices.some((index) => {
    const at = index < 0 ? length + index : index;
    return at >= 0 && at < length;
  });
}

type StreamPart = { type: "text"; text: string } | { type: "tool"; call: ToolCall };

async function* streamCompletion(messages: ChatMessage[]): AsyncGenerator<StreamPart> {
  const apiKey = Bun.env.FIREWORKS_API_KEY?.trim();
  if (!apiKey) throw new Error("FIREWORKS_API_KEY is required");
  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, tools: STORY_TOOLS, tool_choice: "auto", stream: true }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Fireworks error: ${body.slice(0, 500)}`);
  }
  if (!response.body) throw new Error("Fireworks returned no stream");

  const calls: OpenTool[] = [];
  for await (const data of sseData(response.body)) {
    if (data === "[DONE]") break;
    let parsed: { choices?: Array<{ delta?: { content?: string | null; tool_calls?: ToolDelta[] | null } }> };
    try {
      parsed = JSON.parse(data) as typeof parsed;
    } catch {
      continue;
    }
    const delta = parsed.choices?.[0]?.delta;
    if (!delta) continue;
    if (typeof delta.content === "string" && delta.content) yield { type: "text", text: delta.content };
    for (const tool of delta.tool_calls ?? []) {
      for (const call of noteToolDelta(calls, tool)) yield { type: "tool", call };
    }
  }
  for (const call of finishTools(calls)) yield { type: "tool", call };
}

async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    buf += decoder.decode(value, { stream: !done });
    const parts = buf.split("\n\n");
    buf = done ? "" : (parts.pop() ?? "");
    for (const part of parts) {
      const data = part
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (data) yield data;
    }
    if (done) break;
  }
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw !== null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function placement(args: Record<string, unknown>): { index?: number; replace?: boolean } {
  const index = number(args.index);
  return {
    ...(index !== undefined ? { index } : {}),
    ...(args.replace === true ? { replace: true } : {}),
  };
}

function numbers(args: Record<string, unknown>): { offset?: number; limit?: number; last?: number } {
  return { offset: number(args.offset), limit: number(args.limit), last: number(args.last) };
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function names(value: unknown): string[] {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value.map((item) => String(item)) : [];
  return list.map((item) => item.trim()).filter(Boolean).slice(0, 5);
}
