import { test } from "node:test";
import assert from "node:assert/strict";
import {
  active,
  clock,
  mergeEntry,
  normalizeUrl,
  ownedFile,
  placeholders,
  storedFilename,restorePath,
  Entry,
} from "../src/domain";
test('history survives an iOS document-container change and rejects unsafe filenames',()=>{const old='file:///old-container/aivoice/123-abc-original.m4a';assert.equal(storedFilename(old),'123-abc-original.m4a');assert.equal(restorePath(old,'file:///new/aivoice/'),'file:///new/aivoice/123-abc-original.m4a');assert.throws(()=>restorePath('%2e%2e%2fprivate.wav','file:///new/'));assert.throws(()=>restorePath('library.json','file:///new/'));});
test("production rejects insecure URLs and embedded credentials", () => {
  assert.equal(
    normalizeUrl(" https://example.com/api/ "),
    "https://example.com",
  );
  for (const url of [
    "http://example.com",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com?key=secret",
  ])
    assert.throws(() => normalizeUrl(url));
  assert.equal(
    normalizeUrl("http://192.168.1.2:8089", true),
    "http://192.168.1.2:8089",
  );
  assert.throws(() => normalizeUrl("http://192.168.1.2:8089", false));
});
test("unlicensed category placeholders cannot be selected as available voices", () => {
  assert.equal(placeholders.length, 7);
  assert.ok(placeholders.every((v) => !v.available && !v.previewUrl));
});
test("history update keeps one stable identity and does not discard other recordings", () => {
  const a = {
      id: "a",
      created: "2026-11-08T01:00:00Z",
      status: "RECORDED",
    } as Entry,
    b = {
      id: "b",
      created: "2026-11-08T02:00:00Z",
      status: "RECORDED",
    } as Entry;
  const entries = mergeEntry([a, b], { ...a, status: "SUCCEEDED" });
  assert.deepEqual(
    entries.map((e) => e.id),
    ["b", "a"],
  );
  assert.equal(entries[1].status, "SUCCEEDED");
  assert.equal(entries.length, 2);
});
test("cleanup accepts only direct owned files, never sibling or nested paths", () => {
  const root = "file:///Documents/aivoice/";
  assert.equal(ownedFile(root + "x.m4a", root), true);
  for (const path of [
    "file:///Documents/private.wav",
    root + "../private.wav",
    root + "other/a.wav",
  ])
    assert.equal(ownedFile(path, root), false);
});
test("status and playback duration are derived from actual values", () => {
  assert.equal(active("QUEUED"), true);
  assert.equal(active("FAILED"), false);
  assert.equal(clock(60), "01:00");
  assert.equal(clock(-1), "00:00");
});
