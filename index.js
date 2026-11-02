import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const BAR = "\x1b[48;5;240m\x1b[38;5;252m";
const RESET = "\x1b[0m";
let requestRender;
let overlay;
let hideAtViewportTop;

export default function stickyPromptLineExtension(pi) {
	pi.on("before_agent_start", (event) => {
		if (event.messageType !== "user") return;
		hideAtViewportTop = undefined;
		requestRender?.();
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;
		hideAtViewportTop = undefined;

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
					return [formatPromptLine(getStickyPrompt(tui) ?? "", width)];
				},
			};

			overlay = tui.showOverlay(line, {
				anchor: "top",
				row: 0,
				col: 0,
				width: "100%",
				maxHeight: 1,
				nonCapturing: true,
				visible: () => shouldShowSticky(tui, getStickyPrompt(tui)),
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

export function getStickyPrompt(tui) {
	return getPromptAboveViewport(tui)?.prompt;
}

export function getPromptAboveViewport(tui) {
	// shortcut: Pi exposes no role-tagged transcript layout API; read its rendered hit-test cache until one exists.
	const scrollView = tui?.getPrimaryScrollView?.();
	const document = scrollView?.child;
	const layout = document?.mouseLayout;
	const viewportTop = scrollView?.scrollTop ?? 0;
	if (!layout || viewportTop <= 0) return undefined;

	let marker;
	const visit = (component, row, height) => {
		if (height <= 0 || row >= viewportTop) return;
		if (component.constructor?.name === "UserMessageComponent") {
			const prompt = normalizePrompt(component.text);
			if (prompt) marker = { row, prompt };
			return;
		}
		const cached = component.mouseLayout;
		if (!cached || cached.width !== layout.width) return;
		// A wrapper's extra rows have no measured child offsets.
		if (cached.children.reduce((sum, child) => sum + child.height, 0) !== height) return;
		for (const child of cached.children) {
			visit(child.component, row, child.height);
			row += child.height;
		}
	};
	const height = layout.children.reduce((sum, child) => sum + child.height, 0);
	if (scrollView.contentHeight !== undefined && scrollView.contentHeight !== height) return undefined;
	visit(document, 0, height);
	return marker;
}

export function normalizePrompt(prompt) {
	return String(prompt ?? "")
		.replace(/\s+/g, " ")
		.trim();
}

export function scrollToStickyPrompt(tui) {
	const marker = getPromptAboveViewport(tui);
	const scrollView = tui?.getPrimaryScrollView?.();
	if (!marker || typeof scrollView?.scrollTo !== "function") return;
	scrollView.scrollTo(marker.row, { disableFollow: true });
	hideAtViewportTop = scrollView.scrollTop;
	tui.requestRender?.();
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
