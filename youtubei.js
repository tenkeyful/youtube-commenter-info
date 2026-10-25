/*
Runs inside YouTube's own page. That is the only place where we can:
- see the comment data YouTube downloads, and
- call YouTube's internal endpoint /youtubei/v1/account/get_profile_card with the page's own cookies, Origin and visitor data.

What it does, in order:
1.  Wraps window.fetch and reads every /youtubei/v1/next response (that is where comments come from).
    For every commenter YouTube includes a pair of values we need for the request:
      profileCardCommand: { profileOwnerExternalChannelId, profileCardContext }
2.  Tells the content scripts which commenters it has seen (CARDS_AVAILABLE).
3.  When a content script asks for one card (ASK_FOR_CARD), makes the request and sends the answer back (CARD_RESULT).

The content scripts live in a different JavaScript world, so all talking happens through window.postMessage.
The message names are in messages.js (loaded before this file).
*/
(() => {
	"use strict";

	const MESSAGES = CommenterInfoMessages;
	const YOUTUBE_ORIGIN = "https://www.youtube.com";

	if (window.__commenterInfoPageScript) return; // already running in this page
	window.__commenterInfoPageScript = true;

	// channelId -> profileCardContext (the newest one we have seen for that commenter)
	const profileCardTokens = new Map();

	const originalFetch = window.fetch;

	function sendToContentScript(type, data) {
		window.postMessage(
			{ namespace: MESSAGES.NAMESPACE, type, ...data },
			window.location.origin,
		);
	}

	// ---------------------------------------------------------------------------------------------
	// 1. Collect the tokens from YouTube's comment responses
	// ---------------------------------------------------------------------------------------------

	// Walks any JSON and stores every { profileOwnerExternalChannelId, profileCardContext } pair.
	// (Each commenter appears several times in a response; the Map keeps one entry per commenter.)
	function collectTokens(node, found) {
		if (!node || typeof node !== "object") return;
		if (Array.isArray(node)) {
			for (const child of node) collectTokens(child, found);
			return;
		}
		if (
			typeof node.profileCardContext === "string" &&
			typeof node.profileOwnerExternalChannelId === "string"
		) {
			found.set(node.profileOwnerExternalChannelId, node.profileCardContext);
		}
		for (const key in node) collectTokens(node[key], found);
	}

	function handleCommentResponse(json) {
		const found = new Map();
		collectTokens(json, found);
		if (found.size === 0) return;

		for (const [channelId, token] of found)
			profileCardTokens.set(channelId, token);

		// Announce every commenter in this response, even ones we have seen before: the numbers on a
		// profile card belong to one video, so the same commenter on a new video needs a new request.
		// (The content script ignores ids it has already handled.)
		sendToContentScript(MESSAGES.CARDS_AVAILABLE, {
			channelIds: [...found.keys()],
		});
	}

	window.fetch = function (...args) {
		const responsePromise = originalFetch.apply(this, args);
		try {
			const request = args[0];
			const url =
				typeof request === "string"
					? request
					: (request && request.url) || String(request);
			if (url.includes("/youtubei/v1/next")) {
				responsePromise
					.then((response) => response.clone().json()) // clone: YouTube still gets an unread response
					.then(handleCommentResponse)
					.catch(() => {});
			}
		} catch (error) {
			// never break YouTube's own requests because of us
		}
		return responsePromise;
	};

	// ---------------------------------------------------------------------------------------------
	// 2. Request one profile card
	// ---------------------------------------------------------------------------------------------

	function readCookie(name) {
		const match = document.cookie.match(
			new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"),
		);
		return match ? match[1] : null;
	}

	// YouTube's own pages sign requests like this: SAPISIDHASH <time>_<SHA1(time SAPISID origin)>.
	// It has to be fresh for every request (an old one is rejected). Returns null when signed out.
	async function buildAuthorizationHeader() {
		const sapisid = readCookie("SAPISID") || readCookie("__Secure-3PAPISID");
		if (!sapisid) return null;

		const seconds = Math.floor(Date.now() / 1000);
		const bytes = new TextEncoder().encode(
			`${seconds} ${sapisid} ${YOUTUBE_ORIGIN}`,
		);
		const digest = await crypto.subtle.digest("SHA-1", bytes);
		const hex = Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("");
		return `SAPISIDHASH ${seconds}_${hex}`;
	}

	// YouTube keeps its page configuration in ytcfg
	function readYoutubeConfig(key) {
		try {
			return window.ytcfg && window.ytcfg.get
				? window.ytcfg.get(key)
				: undefined;
		} catch (error) {
			return undefined;
		}
	}

	async function requestProfileCard(channelId) {
		const profileCardContext = profileCardTokens.get(channelId);
		if (!profileCardContext)
			return { ok: false, status: 0, reason: "no-token" };

		const context = readYoutubeConfig("INNERTUBE_CONTEXT") || {
			client: {
				clientName: "WEB",
				clientVersion: readYoutubeConfig("INNERTUBE_CLIENT_VERSION"),
				hl: readYoutubeConfig("HL") || "en",
			},
		};

		const authorization = await buildAuthorizationHeader();
		const headers = {
			"Content-Type": "application/json",
			"X-Origin": YOUTUBE_ORIGIN,
			"X-Goog-AuthUser": String(readYoutubeConfig("SESSION_INDEX") ?? 0),
			"X-Youtube-Client-Name": String(
				readYoutubeConfig("INNERTUBE_CONTEXT_CLIENT_NAME") ?? 1,
			),
			"X-Youtube-Client-Version": String(
				readYoutubeConfig("INNERTUBE_CLIENT_VERSION") ?? "",
			),
			"X-Youtube-Bootstrap-Logged-In": String(Boolean(authorization)),
		};
		const visitorData = readYoutubeConfig("VISITOR_DATA");
		if (visitorData) headers["X-Goog-Visitor-Id"] = visitorData;
		if (authorization) headers.Authorization = authorization;

		// originalFetch: our own wrapper above has no business seeing this request
		const response = await originalFetch.call(
			window,
			"/youtubei/v1/account/get_profile_card?prettyPrint=false",
			{
				method: "POST",
				credentials: "include",
				headers,
				body: JSON.stringify({
					context,
					profileOwnerExternalChannelId: channelId,
					profileCardContext,
				}),
			},
		);

		const card = await response.json().catch(() => null);
		window.__commenterInfoLastProfileCard = card;
		return { ok: response.ok, status: response.status, card };
	}

	// ---------------------------------------------------------------------------------------------
	// 3. Messages from the content scripts
	// ---------------------------------------------------------------------------------------------

	window.addEventListener("message", async (event) => {
		// only accept messages the content scripts posted from this very page
		if (event.source !== window || event.origin !== window.location.origin)
			return;
		const message = event.data;
		if (!message || message.namespace !== MESSAGES.NAMESPACE) return;

		if (message.type === MESSAGES.ASK_FOR_KNOWN_CARDS) {
			// Content scripts start after this file. Tell them what we have already collected.
			if (profileCardTokens.size > 0) {
				sendToContentScript(MESSAGES.CARDS_AVAILABLE, {
					channelIds: [...profileCardTokens.keys()],
				});
			}
		} else if (
			message.type === MESSAGES.ASK_FOR_CARD &&
			typeof message.channelId === "string"
		) {
			let result;
			try {
				result = await requestProfileCard(message.channelId);
			} catch (error) {
				result = { ok: false, status: 0, reason: String(error) };
			}
			sendToContentScript(MESSAGES.CARD_RESULT, {
				channelId: message.channelId,
				...result,
			});
		}
	});
})();
