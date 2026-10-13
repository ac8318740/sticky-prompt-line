import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR = "\x1b[48;5;240m\x1b[38;5;252m";
const RESET = "\x1b[0m";
const OSC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

let prompts = [];
let latestPrompt = "";
let requestRender;
let overlay;
let hideAtViewportTop;

export default function stickyPromptLineExtension(pi) {
	pi.on("before_agent_start", (event) => {
		if (event.messageType !== "user") return;
		latestPrompt = normalizePrompt(event.prompt);
		if (latestPrompt && prompts[prompts.length - 1] !== latestPrompt) prompts.push(latestPrompt);
		hideAtViewportTop = undefined;
		requestRender?.();
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		prompts = getSessionPrompts(ctx.sessionManager);
		latestPrompt = prompts[prompts.length - 1] ?? latestPrompt;

		ctx.ui.setWidget("sticky-prompt-line-bootstrap", (tui) => {
			requestRender = () => tui.requestRender();

			const line = {
				invalidate() {},
				handleMouse(event) {
					if (event.type !== "click" || event.button !== "left") return;
					scrollToStickyPrompt(tui);
					return { handled: true, render: true };
				},
				render(width) {
					return [formatPromptLine(getStickyPrompt(tui, prompts) ?? "", width)];
				},
			};

			overlay = tui.showOverlay(line, {
				anchor: "top",
				row: 0,
				col: 0,
				width: "100%",
				maxHeight: 1,
				nonCapturing: true,
				visible: () => shouldShowSticky(tui, getStickyPrompt(tui, prompts)),
			});

			return {
				dispose() {
					overlay?.hide();
					overlay = undefined;
					requestRender = undefined;
				},
				invalidate() {},
				render() {
					return [];
				},
			};
		});
	});

	pi.on("session_shutdown", (_event, ctx) => {
		overlay?.hide();
		overlay = undefined;
		requestRender = undefined;
		ctx.ui.setWidget("sticky-prompt-line-bootstrap", undefined);
	});
}

export function shouldShowSticky(tui, prompt) {
	// shortcut: transcript scroll state is not exposed on ExtensionUIContext; use TuiAltScreen's runtime layout until Pi adds a public API.
	const viewportTop = tui?.viewportTop ?? 0;
	return (
		tui?.mode === "fullscreen" &&
		normalizePrompt(prompt).length > 0 &&
		viewportTop > 0 &&
		viewportTop !== hideAtViewportTop &&
		!tui.isFollowingOutput
	);
}

export function getStickyPrompt(tui, promptList = prompts) {
	const marker = getPromptAboveViewport(tui);
	if (!marker) return undefined;
	return promptList[marker.index] ?? latestPrompt ?? undefined;
}

export function getPromptAboveViewport(tui) {
	const box = getPrimaryScrollBox(tui);
	const lines = box?.scrollContentLines;
	const viewportTop = box?.scrollView?.scrollTop ?? tui?.viewportTop ?? 0;
	if (!Array.isArray(lines) || viewportTop <= 0) return undefined;

	let index = -1;
	let row = -1;
	for (let i = 0; i < lines.length; i++) {
		if (!isPromptStart(lines[i] ?? "")) continue;
		if (i >= viewportTop) break;
		index += 1;
		row = i;
	}
	return row < 0 ? undefined : { index, row };
}

function getPrimaryScrollBox(tui) {
	const scrollView = tui?.getPrimaryScrollView?.();
	const root = tui?.currentLayout?.root;
	if (!root) return undefined;
	return findScrollBox(root, scrollView);
}

function isPromptStart(line) {
	return line.startsWith(`${OSC}]133;A${BEL}`) || line.startsWith(`${OSC}]133;A${OSC}\\`);
}

function findScrollBox(box, scrollView) {
	if (box.scrollContentLines && (!scrollView || box.scrollView === scrollView)) return box;
	for (const child of box.children ?? []) {
		const match = findScrollBox(child, scrollView);
		if (match) return match;
	}
	return undefined;
}

export function normalizePrompt(prompt) {
	return String(prompt ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

export function scrollToStickyPrompt(tui) {
	if (typeof tui?.scrollToPrompt === "function") {
		tui.scrollToPrompt(-1);
		// Pi's prompt marker lands below opencode-style user blocks; nudge up so the prompt starts at row 0.
		tui.scrollBy?.(-3);
		hideAtViewportTop = tui.viewportTop;
		tui.requestRender?.();
		return;
	}
}

export function formatPromptLine(prompt, width) {
	const prefix = "↑ ";
	const clean = normalizePrompt(prompt);
	const maxTextWidth = Math.max(0, width - visibleWidth(prefix));
	const text = truncateToWidth(clean, maxTextWidth, "...");
	const plain = padToWidth(truncateToWidth(prefix + text, width), width);
	return BAR + plain + RESET;
}

function padToWidth(text, width) {
	return text + " ".repeat(Math.max(0, width - visibleWidth(text)));
}

function getSessionPrompts(sessionManager) {
	return (sessionManager?.getBranch?.() ?? [])
		.map((entry) => (entry?.type === "message" && entry.message?.role === "user" ? normalizePrompt(messageText(entry.message)) : ""))
		.filter(Boolean);
}

function messageText(message) {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content.map((part) => (part?.type === "text" ? part.text : "")).join(" ");
}
