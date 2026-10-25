/*
Gets the data for columns 5 to 7 from YouTube's Profile Card

The work is split between two JavaScript worlds (see messages.js):
- youtubei.js (YouTube's page) -> sees the comment data, makes the requests
- this file (content script) -> decides when to ask, one card at a time, and keeps the answers

Flow:
1. youtubei.js announces commenters it has seen (CARDS_AVAILABLE)
2. queue them and ask for one card every few seconds (ASK_FOR_CARD)
3. a card comes back (CARD_RESULT), is parsed and stored
4. whoever called whenAvailable(channelUrl, ...) for that commenter gets it

Requests are slow and capped (see the limits below),
and stop completely when they keep failing (for example when you are signed out)
If every profile card setting is switched off, no request is made at all
*/

const ProfileCards = (() => {
	const MESSAGES = CommenterInfoMessages;

	const REQUEST_DELAY_MS = 2500; // pause between two requests ...
	const REQUEST_JITTER_MS = 1500; // ... plus up to this much extra, at random
	const REQUEST_TIMEOUT_MS = 15000; // give up on one request after this long
	const MAX_FAILURES_IN_A_ROW = 3; // then stop for this page (signed out? YouTube changed something?)
	const MAX_REQUESTS_PER_PAGE = 300; // safety limit for one page load

	function readText(value) {
		if (typeof value === "string") return value.trim() || null;
		if (value && typeof value.content === "string")
			return value.content.trim() || null;
		return null;
	}

	function httpsUrl(url) {
		return typeof url === "string" && url.startsWith("https://") ? url : null;
	}

	/*
Turns YouTube's get_profile_card answer into an object, or null if it isn't a profile card
- handle, commentsCount, heartsReceived, pronouns       strings or null
- badges                [{ title, subtitle, iconUrl }]
- recentCommentsLabel   heading of the recent comments section (translated by YouTube)
- recentComments        [{ videoTitle, commentContent }]
- subscriptionsLabel    heading of the subscriptions section
- subscriptions         [{ channelName, avatarSources: [{ url, width }] }]

Where things are in the answer:
- profileCard.profileCardViewModel.profileIdentityInfo.profileIdentityInfoViewModel   handle, pronouns
- profileCard.profileCardViewModel.profileInfo.profileInfoViewModel                   everything else
*/
	function parse(json) {
		const card =
			json && json.profileCard && json.profileCard.profileCardViewModel;
		const identity =
			card &&
			card.profileIdentityInfo &&
			card.profileIdentityInfo.profileIdentityInfoViewModel;
		if (!identity) return null;

		const body =
			(card.profileInfo && card.profileInfo.profileInfoViewModel) || {};
		const badgeSection = body.profileBadgeInfoChannelWide || {};
		const commentBadge = badgeSection.commentBadge || {};

		return {
			handle: readText(identity.channelHandle),
			commentsCount: readText(commentBadge.commentDesc),
			heartsReceived: readText(commentBadge.blackHeartDesc), // only present for commenters with hearts
			pronouns: readText(identity.channelPronouns), // only present when the commenter set pronouns

			badges: (badgeSection.badges || [])
				.map((badge) => ({
					title: readText(badge && badge.badgeDesc),
					subtitle: readText(badge && badge.badgeSubtitle),
					iconUrl: httpsUrl(badge && badge.badgeIconUrl),
				}))
				.filter((badge) => badge.title),

			recentCommentsLabel: readText(body.commentsInteractionTitle),
			recentComments: (body.comments || [])
				.map((entry) => {
					const comment = entry && entry.commentInteractionViewModel;
					return {
						videoTitle: readText(comment && comment.videoTitle),
						commentContent: readText(comment && comment.commentContent),
					};
				})
				.filter((comment) => comment.videoTitle || comment.commentContent),

			subscriptionsLabel: readText(body.sharedSubscriptionsTitle),
			subscriptions: (body.sharedSubscriptions || [])
				.map((entry) => {
					const subscription = entry && entry.sharedSubscriptionViewModel;
					const sources =
						subscription &&
						subscription.avatar &&
						subscription.avatar.avatarViewModel &&
						subscription.avatar.avatarViewModel.image &&
						subscription.avatar.avatarViewModel.image.sources;
					return {
						channelName: readText(subscription && subscription.channelName),
						avatarSources: (sources || []).filter((source) =>
							httpsUrl(source && source.url),
						),
					};
				})
				.filter(
					(subscription) =>
						subscription.channelName || subscription.avatarSources.length > 0,
				),
		};
	}

	const cardsByKey = new Map(); // '@handle' (lower case) or 'UC...' -> parsed card
	const waitingForCard = new Map(); // key -> Set of callbacks
	const alreadyQueued = new Set(); // channel ids requested or waiting
	const requestsInFlight = new Map(); // channel id -> function that receives the answer
	let queue = []; // channel ids still to request
	let working = false; // is the loop below running?
	let stopped = false; // too many failures in a row
	let failuresInARow = 0;
	let requestCount = 0;
	let pageGeneration = 0; // bumped on every page navigation, so late answers can be ignored

	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

	function sendToPageScript(type, data) {
		window.postMessage(
			{ namespace: MESSAGES.NAMESPACE, type, ...data },
			location.origin,
		);
	}

	function requestCard(channelId) {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				requestsInFlight.delete(channelId);
				resolve({ ok: false, status: 0, reason: "timeout" });
			}, REQUEST_TIMEOUT_MS);

			requestsInFlight.set(channelId, (answer) => {
				clearTimeout(timer);
				requestsInFlight.delete(channelId);
				resolve(answer);
			});
			sendToPageScript(MESSAGES.ASK_FOR_CARD, { channelId });
		});
	}

	// takes commenters off the queue one by one
	async function processQueue() {
		if (working) return;
		working = true;
		try {
			while (
				queue.length > 0 &&
				!stopped &&
				requestCount < MAX_REQUESTS_PER_PAGE
			) {
				const generationAtStart = pageGeneration;
				const channelId = queue.shift();
				requestCount++;

				const answer = await requestCard(channelId);

				if (generationAtStart === pageGeneration) {
					// not a leftover from the previous page
					const card = answer.ok ? parse(answer.card) : null;
					if (card) {
						failuresInARow = 0;
						card.channelId = channelId;
						storeCard(card);
					} else if (++failuresInARow >= MAX_FAILURES_IN_A_ROW) {
						stopped = true;
						console.warn(
							"[YouTube Commenter Info] profile card requests paused after repeated failures",
							answer.status,
							answer.reason || "",
						);
					}
				}
				await sleep(REQUEST_DELAY_MS + Math.random() * REQUEST_JITTER_MS);
			}
		} finally {
			working = false;
		}
	}

	function queueChannels(channelIds) {
		for (const id of channelIds) {
			if (
				typeof id === "string" &&
				!alreadyQueued.has(id) &&
				!cardsByKey.has(id)
			) {
				alreadyQueued.add(id);
				queue.push(id);
			}
		}
		processQueue();
	}

	function keyFromChannelUrl(channelUrl) {
		try {
			const lastSegment = decodeURIComponent(new URL(channelUrl).pathname)
				.split("/")
				.filter(Boolean)
				.pop();
			if (!lastSegment) return null;
			return lastSegment.startsWith("@")
				? lastSegment.toLowerCase()
				: lastSegment;
		} catch (error) {
			return null;
		}
	}

	function storeCard(card) {
		const keys = [card.channelId, card.handle && card.handle.toLowerCase()];
		for (const key of keys) {
			if (!key) continue;
			cardsByKey.set(key, card);
			const callbacks = waitingForCard.get(key);
			if (callbacks) {
				waitingForCard.delete(key);
				callbacks.forEach((callback) => callback(card));
			}
		}
	}

	function whenAvailable(channelUrl, callback) {
		const key = keyFromChannelUrl(channelUrl);
		if (!key) return () => {};

		const known = cardsByKey.get(key);
		if (known) {
			callback(known);
			return () => {};
		}

		const callbacks = waitingForCard.get(key) || new Set();
		callbacks.add(callback);
		waitingForCard.set(key, callbacks);
		return () => callbacks.delete(callback);
	}

	function start() {
		const profileCardSettings = Settings.keysFor("profile-card");

		window.addEventListener("message", (event) => {
			if (event.source !== window || event.origin !== location.origin) return;
			const message = event.data;
			if (!message || message.namespace !== MESSAGES.NAMESPACE) return;

			if (
				message.type === MESSAGES.CARDS_AVAILABLE &&
				Array.isArray(message.channelIds)
			) {
				// every profile card setting is off, never ask YouTube for anything
				if (Settings.anyEnabled(profileCardSettings))
					queueChannels(message.channelIds);
			} else if (message.type === MESSAGES.CARD_RESULT) {
				const receive = requestsInFlight.get(message.channelId);
				if (receive) receive(message);
			}
		});

		document.addEventListener("yt-navigate-start", () => {
			pageGeneration++;
			queue = [];
			alreadyQueued.clear();
			cardsByKey.clear();
			waitingForCard.clear();
		});

		sendToPageScript(MESSAGES.ASK_FOR_KNOWN_CARDS, {});
	}

	return Object.freeze({ start, whenAvailable, parse });
})();
