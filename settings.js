const SETTINGS_COLUMNS = Object.freeze([
	{
		title: "Column 1",
		source: "channel-page",
		items: [
			{ key: "subscriberCount", label: "Subscriber Count", symbol: "🕭" },
			{ key: "location", label: "Location", symbol: "🗺" },
			{ key: "joinedDate", label: "Joined Date", symbol: "🗓" },
		],
	},
	{
		title: "Column 2",
		source: "channel-page",
		items: [
			{ key: "totalVideos", label: "Total Videos", symbol: "📽" },
			{ key: "totalViewCount", label: "Total View Count", symbol: "👁" },
			{ key: "playlists", label: "Playlists", symbol: "𝄞" },
		],
	},
	{
		title: "Column 3",
		source: "channel-page",
		items: [
			{ key: "latestVideo", label: "Latest Video", symbol: "▷" },
			{ key: "latestShorts", label: "Latest Shorts", symbol: "🎞" },
			{ key: "latestLivestream", label: "Latest Livestream", symbol: "◉" },
		],
	},
	{
		title: "Column 4",
		source: "channel-page",
		items: [
			{ key: "description", label: "Description", symbol: "🖍" },
			{ key: "externalLinks", label: "External Links", symbol: "🖇" },
			{ key: "businessEmail", label: "Business Email", symbol: "✉︎" },
		],
	},
	{
		title: "Column 5",
		source: "profile-card",
		items: [
			{ key: "profileComments", label: "Comments", symbol: "🗩" },
			{ key: "heartsReceived", label: "Hearts Received", symbol: "❤︎" },
			{ key: "pronouns", label: "Pronouns", symbol: "👤︎" },
		],
	},
	{
		title: "Column 6",
		source: "profile-card",
		items: [{ key: "badges", label: "Badges", symbol: "✪" }],
	},
	{
		title: "Column 7",
		source: "profile-card",
		stackWithPrevious: true,
		items: [
			{ key: "recentComments", label: "Recent Comments", symbol: "🗪" },
			{ key: "subscriptions", label: "Subscriptions", symbol: "🔔︎" },
		],
	},
]);

const Settings = (() => {
	const POSITIONS = Object.freeze({
		BELOW: "below",
		NEXT_TO_HANDLE: "adjacent",
	});

	// every checkbox defaults to on; the position defaults to below the handle
	const defaults = { infoBoxPosition: POSITIONS.BELOW };
	const symbols = {};
	for (const column of SETTINGS_COLUMNS) {
		for (const item of column.items) {
			defaults[item.key] = true;
			symbols[item.key] = item.symbol;
		}
	}

	let current = { ...defaults };

	return Object.freeze({
		POSITIONS,
		columns: SETTINGS_COLUMNS,
		defaults,

		// the values the user has saved (the defaults until load() has finished)
		get current() {
			return current;
		},

		// the symbol of a setting
		symbol(key) {
			return symbols[key];
		},

		// keys of every setting whose data comes from source
		keysFor(source) {
			return SETTINGS_COLUMNS.filter(
				(column) => column.source === source,
			).flatMap((column) => column.items.map((item) => item.key));
		},

		// true if at least one of keys is switched on
		anyEnabled(keys) {
			return keys.some((key) => current[key]);
		},

		async load() {
			current = await browser.storage.sync.get(defaults);
			return current;
		},

		save(values) {
			return browser.storage.sync.set(values);
		},
	});
})();
