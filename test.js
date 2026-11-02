import assert from "node:assert/strict";
import { Container, Text, visibleWidth } from "@earendil-works/pi-tui";
import stickyPromptLineExtension, { formatPromptLine, getPromptAboveViewport, getStickyPrompt, normalizePrompt, scrollToStickyPrompt, shouldShowSticky } from "./index.js";

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

const promptMarker = "\x1b]133;A\x07";
// Match Pi's runtime component shape while exercising real Container measurements.
class UserMessageComponent extends Container {
	constructor(text) {
		super();
		this.text = text;
		this.addChild(new Text(text, 0, 0));
	}
	render(width) {
		const lines = super.render(width);
		lines[0] = promptMarker + lines[0];
		return lines;
	}
}

const document = new Container();
const chat = new Container();
const first = new UserMessageComponent("first prompt wraps at narrow widths");
const tools = new Text("tool call\nresult\nmore output", 0, 0);
const answer = new Text(`${promptMarker}assistant answer`, 0, 0);
const second = new UserMessageComponent("second prompt");
document.addChild(new Text("intro", 0, 0));
document.addChild(chat);
for (const component of [first, tools, answer, second, new Text("tail\n".repeat(30), 0, 0)]) chat.addChild(component);

const scrollView = {
	child: document,
	scrollTop: 0,
	scrollTo(row) { this.scrollTop = row; },
};
const tui = {
	mode: "fullscreen",
	isFollowingOutput: false,
	get viewportTop() { return scrollView.scrollTop; },
	getPrimaryScrollView() { return scrollView; },
	requestRender() {},
};

// No completed render, no guessed position.
assert.equal(getStickyPrompt(tui), undefined);
for (const width of [80, 12, 40]) {
	for (const output of ["tool call\nresult\nmore output", "compact tool", "", "expanded\n".repeat(15)]) {
		tools.setText(output);
		for (const response of [`${promptMarker}assistant answer`, `${promptMarker}long answer\n`.repeat(8), ""]) {
			answer.setText(response);
			const lines = document.render(width);
			const firstRow = lines.findIndex((line) => line.startsWith(promptMarker));
			const secondRow = lines.findIndex((line) => line.includes(`${promptMarker}second`));
			scrollView.scrollTop = firstRow;
			assert.equal(getStickyPrompt(tui), undefined);
			scrollView.scrollTop = secondRow;
			assert.equal(getStickyPrompt(tui), first.text);
			scrollView.scrollTop = secondRow + 1;
			assert.equal(getStickyPrompt(tui), second.text);
			assert.equal(getPromptAboveViewport(tui).row, secondRow);
			scrollToStickyPrompt(tui);
			assert.equal(scrollView.scrollTop, secondRow);
			assert.equal(shouldShowSticky(tui, second.text), false);
		}
	}
}

// Reading positions must not render again or use stale root measurements.
const renderFirst = first.render;
first.render = () => { throw new Error("unexpected render during sticky lookup"); };
scrollView.scrollTop = 100;
assert.equal(getStickyPrompt(tui), second.text);
first.render = renderFirst;
scrollView.contentHeight = -1;
assert.equal(getStickyPrompt(tui), undefined);
delete scrollView.contentHeight;

// Identical user prompts remain separate positions; no session-list deduplication.
second.text = first.text;
second.children[0].setText(first.text);
tools.setText("compact tool");
answer.setText("");
document.render(80);
scrollView.scrollTop = 100;
assert.equal(getStickyPrompt(tui), first.text);
assert.equal(getPromptAboveViewport(tui).row, 3);

// Replacing the branch must not retain the previous branch's prompt text.
chat.clear();
chat.addChild(new UserMessageComponent("new branch"));
document.render(80);
assert.equal(getStickyPrompt(tui), "new branch");
assert.equal(getStickyPrompt({}), undefined);
scrollToStickyPrompt({});

// Lifecycle and overlay callbacks read the current renderer, not startup history.
const handlers = {};
let overlayLine;
let overlayOptions;
let hidden = 0;
let removed = false;
const ctx = {
	mode: "tui",
	ui: {
		setWidget(_name, factory) {
			if (!factory) { removed = true; return; }
			factory({
				...tui,
				showOverlay(component, options) {
					overlayLine = component;
					overlayOptions = options;
					return { hide() { hidden++; } };
				},
			});
		},
	},
};
stickyPromptLineExtension({ on(name, handler) { handlers[name] = handler; } });
handlers.session_start({}, ctx);
assert.ok(overlayLine.render(40)[0].includes("new branch"));
handlers.before_agent_start({ messageType: "user", prompt: "not rendered yet" });
assert.ok(overlayLine.render(40)[0].includes("new branch"));
assert.equal(typeof overlayOptions.visible(), "boolean");
assert.equal(overlayLine.handleMouse({ type: "click", button: "right" }), undefined);
assert.deepEqual(overlayLine.handleMouse({ type: "click", button: "left" }), { handled: true, render: true });
handlers.session_shutdown({}, ctx);
assert.equal(hidden, 1);
assert.equal(removed, true);

console.log("ok");
