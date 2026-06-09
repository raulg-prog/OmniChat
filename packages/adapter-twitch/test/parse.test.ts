import test from "node:test";
import assert from "node:assert/strict";
import { parsePrivmsg, unescapeTagValue, buildTwitchFragments } from "../src/parse.js";

test("parses a tagged PRIVMSG into a normalized message", () => {
  const line =
    "@badges=moderator/1,subscriber/12;color=#1E90FF;display-name=Cool_User;id=abc-123;tmi-sent-ts=1700000000000 " +
    ":cool_user!cool_user@cool_user.tmi.twitch.tv PRIVMSG #somechannel :Hello world!";
  const msg = parsePrivmsg(line);
  assert.ok(msg);
  assert.equal(msg.platform, "twitch");
  assert.equal(msg.channel, "somechannel");
  assert.equal(msg.author.name, "Cool_User");
  assert.equal(msg.author.color, "#1E90FF");
  assert.equal(msg.text, "Hello world!");
  assert.equal(msg.id, "abc-123");
  assert.equal(msg.timestamp, 1700000000000);
  assert.deepEqual(msg.author.badges, [
    { type: "moderator", label: "1" },
    { type: "subscriber", label: "12" },
  ]);
});

test("non-PRIVMSG lines return null", () => {
  assert.equal(parsePrivmsg(":tmi.twitch.tv 001 justinfan123 :Welcome"), null);
  assert.equal(parsePrivmsg("PING :tmi.twitch.tv"), null);
});

test("IRCv3 unescape handles all five sequences (regression for the \\s-only bug)", () => {
  assert.equal(unescapeTagValue("a\\sb"), "a b");   // \s -> space
  assert.equal(unescapeTagValue("a\\:b"), "a;b");   // \: -> semicolon
  assert.equal(unescapeTagValue("a\\\\b"), "a\\b"); // \\ -> backslash
  assert.equal(unescapeTagValue("a\\rb"), "a\rb");  // \r -> CR
  assert.equal(unescapeTagValue("a\\nb"), "a\nb");  // \n -> LF
});

test("display-name with an escaped semicolon decodes correctly", () => {
  const line =
    "@display-name=Weird\\:Name;color= :weird!weird@weird.tmi.twitch.tv PRIVMSG #c :hi";
  const msg = parsePrivmsg(line);
  assert.ok(msg);
  assert.equal(msg.author.name, "Weird;Name");
  assert.equal(msg.text, "hi");
});

test("buildTwitchFragments splits native emotes by codepoint position", () => {
  assert.deepEqual(buildTwitchFragments("Kappa hi", "25:0-4"), [
    { type: "emote", name: "Kappa", url: "https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/2.0" },
    { type: "text", text: " hi" },
  ]);
  assert.deepEqual(buildTwitchFragments("hello", undefined), [{ type: "text", text: "hello" }]);
});
