import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { formatPromptLine, getStickyPrompt, normalizePrompt, scrollToStickyPrompt, shouldShowSticky } from "./index.js";

assert.equal(normalizePrompt(" first\n\tsecond   third "), "first second third");

assert.equal(shouldShowSticky({ mode: "regular", viewportTop: 10, isFollowingOutput: false }, "prompt"), false);
assert.equal(shouldShowSticky({ mode: "fullscreen", viewportTop: 0, isFollowingOutput: false }, "prompt"), false);
assert.equal(shouldShowSticky({ mode: "fullscreen", viewportTop: 10, isFollowingOutput: true }, "prompt"), false);
assert.equal(shouldShowSticky({ mode: "fullscreen", viewportTop: 10, isFollowingOutput: false }, ""), false);
assert.equal(shouldShowSticky({ mode: "fullscreen", viewportTop: 10, isFollowingOutput: false }, "prompt"), true);

const line = formatPromptLine("abcdefghijklmnopqrstuvwxyz", 10);
assert.ok(line.includes("\x1b[48;5;240m"));
assert.ok(line.includes("..."));
assert.equal(visibleWidth(line), 10);
assert.equal(visibleWidth(formatPromptLine("short", 80)), 80);

const scrollView = { scrollTop: 1 };
const promptMarker = "\x1b]133;A\x07";
const promptTui = {
	currentLayout: {
		root: {
			children: [],
			scrollView,
			scrollContentLines: ["intro", `${promptMarker}first`, "body", `${promptMarker}second`],
		},
	},
	getPrimaryScrollView() {
		return scrollView;
	},
};
assert.equal(getStickyPrompt(promptTui, ["first", "second"]), undefined);
scrollView.scrollTop = 2;
assert.equal(getStickyPrompt(promptTui, ["first", "second"]), "first");
scrollView.scrollTop = 4;
assert.equal(getStickyPrompt(promptTui, ["first", "second"]), "second");

let direction;
let nudge;
const tui = {
	mode: "fullscreen",
	viewportTop: 10,
	isFollowingOutput: false,
	scrollToPrompt(value) {
		direction = value;
		this.viewportTop = 7;
	},
	scrollBy(value) {
		nudge = value;
		this.viewportTop += value;
	},
	requestRender() {},
};
scrollToStickyPrompt(tui);
assert.equal(direction, -1);
assert.equal(nudge, -3);
assert.equal(tui.viewportTop, 4);
assert.equal(shouldShowSticky(tui, "prompt"), false);
assert.equal(shouldShowSticky({ ...tui, viewportTop: 8 }, "prompt"), true);

console.log("ok");
