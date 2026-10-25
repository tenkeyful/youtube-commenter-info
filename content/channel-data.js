const ChannelData = (() => {
	// Turns text copied out of YouTube's page source into normal text: "\u0026" -> "&", "\"" -> '"'
	function decodeEscapedString(text) {
		if (text === null || text === undefined) return text;
		if (typeof text !== "string") return text;

		try {
			const quoted =
				'"' +
				text.replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n") +
				'"';
			return JSON.parse(quoted);
		} catch (error) {
			try {
				return text
					.replace(/\\u([0-9a-fA-F]{4})/g, (match, code) =>
						String.fromCharCode(parseInt(code, 16)),
					)
					.replace(/\\"/g, '"')
					.replace(/\\\\/g, "\\")
					.replace(/\\n/g, "\n")
					.replace(/\\r/g, "\r");
			} catch (error2) {
				return text;
			}
		}
	}

	// The first (...) group of `regex` in `text`, or null
	function firstGroup(text, regex) {
		const match = text.match(regex);
		return match ? match[1] : null;
	}

	// ---------------------------------------------------------------------------------------------
	// /about
	// ---------------------------------------------------------------------------------------------

	// Returns { subscriberCount, country, joinedDate, videoCount, viewCount, description, links,
	//           businessEmail }. A value is null when the page doesn't have it.
	//   links          [{ title, link, icon }] or null
	//   businessEmail  the /about url (the email itself is behind a "reveal" button) or null
	async function fetchChannelInfo(channelUrl) {
		const response = await fetch(channelUrl + "/about");
		const text = await response.text();

		// The three numbers usually sit next to each other. If YouTube changes that, fall back to
		// looking for each one on its own.
		let subscriberCount, viewCount, joinedDate;
		const together = text.match(
			/"subscriberCountText":"([^"]+)","viewCountText":"([^"]+)","joinedDateText":\{"content":"([^"]+)"/,
		);
		if (together) {
			subscriberCount = together[1];
			viewCount = together[2];
			joinedDate = together[3];
		} else {
			subscriberCount = firstGroup(text, /"subscriberCountText":"([^"]+)"/);
			viewCount = firstGroup(text, /"viewCountText":"([^"]+)"/);
			joinedDate = firstGroup(text, /"joinedDateText":\{"content":"([^"]+)"/);
		}

		const country = decodeEscapedString(
			firstGroup(text, /"country":"([^"]+)"/),
		);
		const videoCount = firstGroup(text, /"videoCountText":"([^"]+)"/);

		let description = null;
		const rawDescription = firstGroup(
			text,
			/"description":"((?:\\.|[^"\\])*)"/,
		);
		if (rawDescription && rawDescription.trim() !== "") {
			description = decodeEscapedString(rawDescription);
		}

		// external links: titles and urls come from one pattern, their icons from another; the n-th
		// icon belongs to the n-th link
		const links = [];
		const linkRegex =
			/"channelExternalLinkViewModel":\{"title":\{"content":"((?:\\.|[^"\\])*)"\},"link":\{"content":"((?:\\.|[^"\\])*)"/g;
		let match;
		while ((match = linkRegex.exec(text)) !== null) {
			links.push({
				title: decodeEscapedString(match[1]).trim(),
				link: match[2].trim(),
				icon: null,
			});
		}
		const icons = [];
		const iconRegex = /"url":"([^"]+)","width":256,"height":256/g;
		while ((match = iconRegex.exec(text)) !== null) {
			icons.push(match[1].trim());
		}
		links.forEach((link, index) => {
			link.icon = icons[index] || null;
		});

		const hasBusinessEmail = /"businessEmailRevealButton":/.test(text);

		return {
			subscriberCount,
			country,
			joinedDate,
			videoCount,
			viewCount,
			description,
			links: links.length > 0 ? links : null,
			businessEmail: hasBusinessEmail ? channelUrl + "/about" : null,
		};
	}

	// ---------------------------------------------------------------------------------------------
	// /videos and /streams: both list videos in the same format
	// ---------------------------------------------------------------------------------------------

	const NO_VIDEO = Object.freeze({
		title: null,
		publishedTime: null,
		length: null,
		videoViewCount: null,
		videoId: null,
		thumbnail: null,
	});

	// The first video in a /videos or /streams page
	function parseFirstVideo(text) {
		const title = firstGroup(
			text,
			/"title":\{"runs":\[\{"text":"((?:\\.|[^"\\])*)"/,
		);
		const lengthAndViews = text.match(
			/"lengthText":\{"accessibility":\{"accessibilityData":\{"label":"[^"]+"\}\},"simpleText":"([^"]+)"\},"viewCountText":\{"simpleText":"([^"]+)"/,
		);

		return {
			title: title === null ? null : decodeEscapedString(title),
			publishedTime: firstGroup(
				text,
				/"publishedTimeText":\{"simpleText":"([^"]+)"/,
			),
			length: lengthAndViews ? lengthAndViews[1] : null,
			videoViewCount: lengthAndViews ? lengthAndViews[2] : null,
			videoId: firstGroup(
				text,
				/{"content":{"videoRenderer":{"videoId":"([^"]+)"/,
			),
			thumbnail: firstGroup(
				text,
				/"thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/,
			),
		};
	}

	// Returns { title, publishedTime, length, videoViewCount, videoId, thumbnail }; all null if
	// the channel has no videos or the page can't be read.
	async function fetchLatestVideo(channelUrl) {
		try {
			const response = await fetch(channelUrl + "/videos");
			return parseFirstVideo(await response.text());
		} catch (error) {
			return NO_VIDEO;
		}
	}

	// Same shape as fetchLatestVideo. The /streams page lists past streams too, so the result is only
	// used when the first entry carries the "live" badge; otherwise everything is null.
	async function fetchLatestLivestream(channelUrl) {
		try {
			const response = await fetch(channelUrl + "/streams");
			const text = await response.text();

			const hasLiveBadge =
				/"metadataBadgeRenderer"\s*:\s*\{\s*"icon"\s*:\s*\{\s*"iconType"\s*:\s*"CHECK_CIRCLE_THICK"/.test(
					text,
				);
			if (!hasLiveBadge) return NO_VIDEO;

			return parseFirstVideo(text);
		} catch (error) {
			return NO_VIDEO;
		}
	}

	// ---------------------------------------------------------------------------------------------
	// /shorts
	// ---------------------------------------------------------------------------------------------

	// Returns { title, views, thumbnail, videoId }; all null when there is no short.
	async function fetchLatestShort(channelUrl) {
		try {
			const response = await fetch(channelUrl + "/shorts");
			const text = await response.text();

			const short = text.match(
				/"overlayMetadata":\{"primaryText":\{"content":"((?:\\.|[^"\\])*)"\},"secondaryText":\{"content":"([^"]+)"\}\},"thumbnailViewModel":\{"thumbnailViewModel":\{"image":\{"sources":\[\{"url":"([^"]+)"/,
			);

			return {
				title: short && short[1] ? decodeEscapedString(short[1]) : null,
				views: short && short[2] ? short[2] : null,
				thumbnail: short && short[3] ? short[3] : null,
				videoId: firstGroup(
					text,
					/"reelWatchEndpoint"\s*:\s*\{\s*"videoId"\s*:\s*"([^"]+)"/,
				),
			};
		} catch (error) {
			return { title: null, views: null, thumbnail: null, videoId: null };
		}
	}

	// ---------------------------------------------------------------------------------------------
	// /playlists
	// ---------------------------------------------------------------------------------------------

	// Returns { playlists: [{ title, url, thumbnail, videos }], localizedPlaylistWord }
	//   localizedPlaylistWord  the word for "playlists" in the user's YouTube language, lower case
	async function fetchPlaylists(channelUrl) {
		try {
			const response = await fetch(channelUrl + "/playlists");
			const text = await response.text();

			// Titles, urls, thumbnails and video counts are found by four separate patterns; the n-th
			// match of each belongs to the n-th playlist.
			const titles = [
				...text.matchAll(
					/"metadata":\{"lockupMetadataViewModel":\{"title":\{"content":"((?:\\.|[^"\\])*)"/g,
				),
			];
			const urls = [...text.matchAll(/"url":"\/playlist\?list=([^"]+)"/g)];
			const thumbnails = [
				...text.matchAll(
					/"thumbnailViewModel":{"image":{"sources":\[\{"url":"([^"]+)"/g,
				),
			];
			const videoCounts = [...text.matchAll(/,"text":"([^"]+)"/g)];

			const playlists = [];
			for (let i = 0; i < titles.length; i++) {
				if (titles[i] && urls[i] && thumbnails[i] && videoCounts[i]) {
					playlists.push({
						title: decodeEscapedString(titles[i][1]),
						url: "https://www.youtube.com/playlist?list=" + urls[i][1],
						thumbnail: thumbnails[i][1],
						videos: videoCounts[i][1],
					});
				}
			}

			// The selected tab's name is the word for "Playlists" (e.g. "Playlists" -> "playlists")
			const tabName = firstGroup(text, /"title":"([^"]+)","selected":true/);
			const localizedPlaylistWord = tabName
				? tabName.charAt(0).toLowerCase() + tabName.slice(1)
				: "playlist";

			return { playlists, localizedPlaylistWord };
		} catch (error) {
			return { playlists: [], localizedPlaylistWord: "playlist" };
		}
	}

	return Object.freeze({
		fetchChannelInfo,
		fetchLatestVideo,
		fetchLatestShort,
		fetchLatestLivestream,
		fetchPlaylists,
	});
})();
