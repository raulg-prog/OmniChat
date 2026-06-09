import test from "node:test";
import assert from "node:assert/strict";
import { tokenize } from "../src/index.js";

const map = new Map([["KEKW", "https://cdn/KEKW"], ["Pog", "https://cdn/Pog"]]);
const look = (n: string) => map.get(n);

test("swaps whole-word emote matches and preserves spacing", () => {
  assert.deepEqual(tokenize("haha KEKW yes", look), [
    { type: "text", text: "haha " },
    { type: "emote", name: "KEKW", url: "https://cdn/KEKW" },
    { type: "text", text: " yes" },
  ]);
});

test("no match yields a single text fragment", () => {
  assert.deepEqual(tokenize("nothing here", look), [{ type: "text", text: "nothing here" }]);
});

test("partial words are not matched", () => {
  assert.deepEqual(tokenize("KEKWait", look), [{ type: "text", text: "KEKWait" }]);
});

test("consecutive emotes keep the separating space", () => {
  assert.deepEqual(tokenize("Pog KEKW", look), [
    { type: "emote", name: "Pog", url: "https://cdn/Pog" },
    { type: "text", text: " " },
    { type: "emote", name: "KEKW", url: "https://cdn/KEKW" },
  ]);
});
