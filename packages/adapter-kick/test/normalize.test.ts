import test from "node:test";
import assert from "node:assert/strict";
import { normalizeKick, cleanKickText, buildKickFragments } from "../src/index.js";

test("normalizes a Kick ChatMessageEvent payload", () => {
  const payload = {
    id: "msg-1",
    content: "hello kick",
    created_at: "2024-01-01T00:00:00Z",
    sender: {
      username: "KickUser",
      identity: { color: "#FF0000", badges: [{ type: "moderator", text: "Moderator" }] },
    },
  };
  const m = normalizeKick(payload, "somechannel");
  assert.equal(m.platform, "kick");
  assert.equal(m.channel, "somechannel");
  assert.equal(m.author.name, "KickUser");
  assert.equal(m.author.color, "#FF0000");
  assert.equal(m.text, "hello kick");
  assert.equal(m.id, "msg-1");
  assert.equal(m.timestamp, Date.parse("2024-01-01T00:00:00Z"));
  assert.deepEqual(m.author.badges, [{ type: "moderator", label: "Moderator" }]);
});

test("tolerates missing/garbage fields without throwing", () => {
  const m = normalizeKick({}, "c");
  assert.equal(m.author.name, "unknown");
  assert.equal(m.text, "");
  assert.equal(m.author.color, undefined);
  assert.deepEqual(m.author.badges, []);
});

test("strips Kick emote tags to their readable name", () => {
  assert.equal(cleanKickText("hello [emote:37227:LULW] world"), "hello LULW world");
  assert.equal(cleanKickText("[emote:1:a][emote:2:b]"), "ab");
  assert.equal(cleanKickText("no emotes here"), "no emotes here");
  // and through the full normalize path
  assert.equal(normalizeKick({ content: "gg [emote:5:KEKW]" }, "c").text, "gg KEKW");
});

test("buildKickFragments turns [emote:ID:name] into image fragments", () => {
  assert.deepEqual(buildKickFragments("gg [emote:5:KEKW] wp"), [
    { type: "text", text: "gg " },
    { type: "emote", name: "KEKW", url: "https://files.kick.com/emotes/5/fullsize" },
    { type: "text", text: " wp" },
  ]);
  assert.deepEqual(buildKickFragments("plain"), [{ type: "text", text: "plain" }]);
});
