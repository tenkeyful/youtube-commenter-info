/*
content scripts (isolated world) <--window.postMessage--> youtubei.js (YouTube's own page world)

Why two? Only code running in YouTube's page world can see YouTube's data (the comment responses and ytcfg)
and make profile card requests with the page's own cookies. Content scripts can't, but they are the ones that draw the boxes

content script asks:           page script answers:
ASK_FOR_KNOWN_CARDS       -->  CARDS_AVAILABLE (every commenter it has seen)
ASK_FOR_CARD {channelId}  -->  CARD_RESULT {channelId, ok, status, card}

The page script also sends CARDS_AVAILABLE on its own whenever YouTube loads more comments
*/

const CommenterInfoMessages = Object.freeze({
	// every message is { namespace: NAMESPACE, type, ...data }
	// messages without this namespace are ignored
	NAMESPACE: "yt-commenter-info",

	// content script -> page script
	ASK_FOR_KNOWN_CARDS: "ask-for-known-profile-cards",
	ASK_FOR_CARD: "ask-for-profile-card",

	// page script -> content script
	CARDS_AVAILABLE: "profile-cards-available",
	CARD_RESULT: "profile-card-result",
});
