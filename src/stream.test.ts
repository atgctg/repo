import { expect, test } from "bun:test";
import { finishTools, noteToolDelta, type OpenTool } from "./stream";

test("the first tool is ready as soon as its arguments close", () => {
  const calls: OpenTool[] = [];
  expect(noteToolDelta(calls, { index: 0, id: "a", function: { name: "Dialogue", arguments: '{"speaker":' } })).toEqual([]);
  const ready = noteToolDelta(calls, { index: 0, function: { arguments: '"Keiko"}' } });
  expect(ready.map((call) => call.function.name)).toEqual(["Dialogue"]);
  expect(JSON.parse(ready[0].function.arguments)).toEqual({ speaker: "Keiko" });
  expect(noteToolDelta(calls, { index: 1, id: "b", function: { name: "Image", arguments: '{"name":"Cafe"}' } }).map((call) => call.id)).toEqual(["b"]);
});

test("a later tool waits until the earlier one is complete", () => {
  const calls: OpenTool[] = [];
  noteToolDelta(calls, { index: 0, id: "a", function: { name: "Card", arguments: '{"na' } });
  expect(noteToolDelta(calls, { index: 1, id: "b", function: { name: "Dialogue", arguments: "{}" } })).toEqual([]);
  const ready = noteToolDelta(calls, { index: 0, function: { arguments: 'me":"Yuki"}' } });
  expect(ready.map((call) => call.id)).toEqual(["a", "b"]);
});

test("a truncated tool is still returned when the stream ends", () => {
  const calls: OpenTool[] = [];
  noteToolDelta(calls, { index: 0, id: "a", function: { name: "Delete", arguments: '{"indices":' } });
  const ready = finishTools(calls);
  expect(ready).toEqual([{ id: "a", type: "function", function: { name: "Delete", arguments: '{"indices":' } }]);
});
