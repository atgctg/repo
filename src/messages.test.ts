import { expect, test } from "bun:test";
import { eventsToMessages, type ChatMessage } from "./messages";
import { loadStory } from "./stories";
import type { StoryEvent } from "./types";

const events = (await loadStory("muse")).events;

const museMessages: ChatMessage[] = [
  {
    role: "assistant",
    tool_calls: [
      {
        id: "0",
        type: "function",
        function: {
          name: "Card",
          arguments:
            '{"attributes":{"Fact":"I keep 40 tabs open and call it memory training","Hair":"Short silver-violet bob with cyan tips","Style":"Cream knit sweater, pleated skirt, holographic scarf"},"cover":"Muse","name":"Muse","voice":"Aiko"}',
        },
      },
      {
        id: "1",
        type: "function",
        function: {
          name: "Video",
          arguments:
            '{"firstFrame":"Muse","name":"Muse Wave","prompt":{"Action":"Second 0 to 1: Muse smiles and waves at camera, holographic scarf flutters. Second 1 to 3: she says \\"Hi, I am Muse!\\" with bright happy voice, spark particles drift. Second 3 to 5: she laughs and says \\"I keep 40 tabs open and call it memory training!\\", playful mood, circular camera push, enable cheerful non-diagetic music."}}',
        },
      },
      {
        id: "2",
        type: "function",
        function: {
          name: "Image",
          arguments:
            '{"name":"Muse","prompt":{"Character":"Muse (screen-center, front view, face visible to camera): young adult anime woman, pale skin, short silver-violet bob with cyan tips, amber eyes, oversized cream knit sweater with small spark pins, dark pleated skirt, thigh-high socks, translucent holographic scarf floating","Composition":"Vertical portrait, upper body, screen-center, front view","Environment":"Soft studio glow, pale gradient background with faint spark particles","Style":"Clean anime key art, flat color shapes, crisp line work"}}',
        },
      },
      {
        id: "3",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"*Waves*\\nHi. I am Muse.","speaker":"Muse"}',
        },
      },
      {
        id: "4",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"*Whispers*\\nSometimes a cloud is just a cloud. Not today.","speaker":"Muse"}',
        },
      },
      {
        id: "5",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"*Laughs*\\nI named a star after a sandwich once. It stuck.","speaker":"Muse"}',
        },
      },
      {
        id: "6",
        type: "function",
        function: {
          name: "Dialogue",
          arguments:
            '{"background":"Muse","caption":"My sandwich star? Uh, I logged it on 04/20/2025.\\nAround 7:00 PM. The sky was being dramatic.","speaker":"Muse"}',
        },
      },
      {
        id: "7",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"It cost $19.99. Receipt went to muse@orbit.mail.","speaker":"Muse"}',
        },
      },
      {
        id: "8",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"Call (415) 555-1212 if a cloud steals it.\\nI crash at 123 Main St. Sometimes.","speaker":"Muse"}',
        },
      },
      {
        id: "9",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"Muse is spelled <spell>Muse</spell>. Not mews. Important.","speaker":"Muse"}',
        },
      },
      {
        id: "10",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"I had a thought.<break time=\\"1s\\"/>Nope. Completely gone.","speaker":"Muse"}',
        },
      },
      {
        id: "11",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"<speed ratio=\\"1.5\\"/> I talk fast when clouds do tricks!","speaker":"Muse"}',
        },
      },
      {
        id: "12",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"*Leans in*\\n<volume ratio=\\"0.5\\"/> Do not tell the sandwich star.","speaker":"Muse"}',
        },
      },
      {
        id: "13",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"<emotion value=\\"curious\\"/> Did you hear that? A hiccup in the dark.","speaker":"Muse"}',
        },
      },
      {
        id: "14",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"[laughter] Stars do not hiccup. I checked twice.","speaker":"Muse"}',
        },
      },
      {
        id: "15",
        type: "function",
        function: {
          name: "Dialogue",
          arguments: '{"background":"Muse","caption":"NASA noticed. The USA did not. Typical.","speaker":"Muse"}',
        },
      },
    ],
  },
  ...Array.from({ length: 16 }, (_, index) => ({ role: "tool" as const, tool_call_id: String(index), content: "ok" })),
];

test("muse converts to one model turn", () => {
  expect(eventsToMessages(events)).toEqual(museMessages);
});

test("a finished turn is a stable prefix", () => {
  const full = eventsToMessages(events);
  const cuts = [0];
  for (let index = 0; index < events.length; index++) {
    const next = events[index + 1];
    const model = !events[index].user;
    const nextModel = next ? !next.user : false;
    if (!next || !model || !nextModel) cuts.push(index + 1);
  }
  for (const count of cuts) {
    const prefix = eventsToMessages(events.slice(0, count));
    expect(full.slice(0, prefix.length)).toEqual(prefix);
  }
});

test("summary is a frozen prefix", () => {
  const summary = "Summary of earlier events.";
  const withSummary = eventsToMessages(events, summary);
  expect(withSummary[0]).toEqual({ role: "system", content: summary });
  expect(withSummary.slice(1)).toEqual(eventsToMessages(events));
});

test("a failed tool returns the error and keeps the prompt", () => {
  const failed: StoryEvent[] = [
    { type: "image", name: "Night", prompt: { Subject: "Night" }, references: ["Cafe"], width: 720, error: "safety filter" },
  ];
  const messages = eventsToMessages(failed);
  const turn = messages.find((message) => message.role === "assistant" && message.tool_calls);
  const call = turn?.role === "assistant" ? turn.tool_calls?.[0] : undefined;
  expect(call?.function.arguments).toBe('{"name":"Night","prompt":{"Subject":"Night"},"references":["Cafe"]}');
  expect(messages.find((message) => message.role === "tool")).toEqual({
    role: "tool",
    tool_call_id: "0",
    content: "safety filter",
  });
});

test("human edits are user messages, not model tool calls", () => {
  const edited: StoryEvent[] = [
    { type: "dialogue", user: "user", replace: true, index: 1, background: "Cafe", speaker: "Mimi", caption: "Edited line" },
  ];
  expect(eventsToMessages(edited)).toEqual([
    {
      role: "user",
      name: "user",
      content: '{"background":"Cafe","caption":"Edited line","index":1,"replace":true,"speaker":"Mimi","type":"dialogue"}',
    },
  ]);
});
