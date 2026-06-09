import test from "node:test";
import assert from "node:assert/strict";
import { parseStreamUrl } from "../src/url.js";

test("twitch URLs and casing", () => {
  assert.deepEqual(parseStreamUrl("https://twitch.tv/xQc"), { platform: "twitch", channel: "xqc" });
  assert.deepEqual(parseStreamUrl("twitch.tv/xqc"), { platform: "twitch", channel: "xqc" });
  assert.deepEqual(parseStreamUrl("https://www.twitch.tv/Foo/clips"), { platform: "twitch", channel: "foo" });
});

test("kick URLs", () => {
  assert.deepEqual(parseStreamUrl("https://kick.com/Trainwreckstv"), { platform: "kick", channel: "trainwreckstv" });
});

test("youtube URL forms", () => {
  assert.deepEqual(parseStreamUrl("https://youtu.be/abc123"), { platform: "youtube", channel: "abc123" });
  assert.deepEqual(parseStreamUrl("https://www.youtube.com/watch?v=abc123"), { platform: "youtube", channel: "abc123" });
  assert.deepEqual(parseStreamUrl("https://youtube.com/live/XYZ"), { platform: "youtube", channel: "XYZ" });
  assert.deepEqual(parseStreamUrl("https://youtube.com/shorts/SHORTID"), { platform: "youtube", channel: "SHORTID" });
  assert.deepEqual(parseStreamUrl("https://youtube.com/channel/UC123"), { platform: "youtube", channel: "UC123" });
  assert.deepEqual(parseStreamUrl("https://youtube.com/@SomeHandle"), { platform: "youtube", channel: "@SomeHandle" });
});

test("shorthands", () => {
  assert.deepEqual(parseStreamUrl("twitch:xqc"), { platform: "twitch", channel: "xqc" });
  assert.deepEqual(parseStreamUrl("yt:VIDEOID"), { platform: "youtube", channel: "VIDEOID" });
  assert.deepEqual(parseStreamUrl("kick:foo"), { platform: "kick", channel: "foo" });
});

test("x is parsed (rejected downstream, not here)", () => {
  assert.deepEqual(parseStreamUrl("https://x.com/someone"), { platform: "x", channel: "someone" });
  assert.deepEqual(parseStreamUrl("https://twitter.com/someone"), { platform: "x", channel: "someone" });
});

test("unrecognized input returns null", () => {
  assert.equal(parseStreamUrl("hello world"), null);
  assert.equal(parseStreamUrl("https://example.com/foo"), null);
  assert.equal(parseStreamUrl("https://youtube.com/"), null);
});
