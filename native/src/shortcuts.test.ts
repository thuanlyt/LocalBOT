import assert from "node:assert/strict";
import test from "node:test";
import { resolveNativeShortcut } from "./shortcuts";

const input = (key: string, code = "", playbackAvailable = true) => ({ key, code, playbackAvailable });

test("shortcut help is available without a playable track", () => {
  assert.equal(resolveNativeShortcut(input("?", "", false)), "help");
});

test("transport and playback shortcuts resolve to their product actions", () => {
  assert.equal(resolveNativeShortcut(input(" ", "Space")), "toggle-playback");
  assert.equal(resolveNativeShortcut(input("k")), "toggle-playback");
  assert.equal(resolveNativeShortcut(input("n")), "next");
  assert.equal(resolveNativeShortcut(input("p")), "previous");
  assert.equal(resolveNativeShortcut(input("s")), "shuffle");
  assert.equal(resolveNativeShortcut(input("r")), "repeat");
  assert.equal(resolveNativeShortcut(input("m")), "mute");
});

test("local seek and volume shortcuts resolve independently", () => {
  assert.equal(resolveNativeShortcut(input("ArrowLeft")), "seek-backward");
  assert.equal(resolveNativeShortcut(input("ArrowRight")), "seek-forward");
  assert.equal(resolveNativeShortcut(input("[")), "volume-down");
  assert.equal(resolveNativeShortcut(input("]")), "volume-up");
});

test("modified shortcuts and playback actions without a track are ignored", () => {
  assert.equal(resolveNativeShortcut({ ...input("n"), ctrlKey: true }), null);
  assert.equal(resolveNativeShortcut({ ...input(" ", "Space"), altKey: true }), null);
  assert.equal(resolveNativeShortcut(input("n", "", false)), null);
  assert.equal(resolveNativeShortcut(input("?", "", true)), "help");
  assert.equal(resolveNativeShortcut(input("x")), null);
});
