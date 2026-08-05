import assert from "node:assert/strict";
import test from "node:test";

import {
  extractBlockReferenceUids,
  resolveBlockReferences,
} from "../src/core/block-references.js";

test("extracts unique Roam block references in authored order", () => {
  assert.deepEqual(
    extractBlockReferenceUids("before ((xJuYmHX0v)) after ((abcdefghi)) and ((xJuYmHX0v))"),
    ["xJuYmHX0v", "abcdefghi"]
  );
});

test("resolves nested block references without exposing raw UIDs", () => {
  const blocks = new Map([
    ["xJuYmHX0v", "commit the dashboard changes and ((abcdefghi))"],
    ["abcdefghi", "push the review build"],
  ]);
  assert.equal(
    resolveBlockReferences("easier way: ((xJuYmHX0v))", (uid) => blocks.get(uid)),
    "easier way: commit the dashboard changes and push the review build"
  );
});

test("keeps missing and cyclic references safe", () => {
  const blocks = new Map([
    ["xJuYmHX0v", "loop ((abcdefghi))"],
    ["abcdefghi", "back ((xJuYmHX0v))"],
  ]);
  assert.equal(
    resolveBlockReferences("((missing00))", (uid) => blocks.get(uid)),
    "((missing00))"
  );
  assert.match(
    resolveBlockReferences("((xJuYmHX0v))", (uid) => blocks.get(uid)),
    /\(\(xJuYmHX0v\)\)/
  );
});
