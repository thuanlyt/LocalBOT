import assert from "node:assert/strict";
import test from "node:test";
import { nextFocusIndex } from "./dialog-focus";

test("focus index wraps forward and backward", () => {
  assert.equal(nextFocusIndex(0, 3, false), 1);
  assert.equal(nextFocusIndex(2, 3, false), 0);
  assert.equal(nextFocusIndex(0, 3, true), 2);
  assert.equal(nextFocusIndex(2, 3, true), 1);
});

test("focus index chooses a boundary when focus is outside the dialog", () => {
  assert.equal(nextFocusIndex(-1, 3, false), 0);
  assert.equal(nextFocusIndex(-1, 3, true), 2);
  assert.equal(nextFocusIndex(0, 0, false), -1);
});
