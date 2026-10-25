/*
column 1  subscribers, location, join date
column 2  videos, views, playlists
column 3  latest video, latest short, latest livestream
column 4  description, external links, business email
*/
const ChannelColumns = (() => {
	const {
		PADDING,
		BORDER_RADIUS,
		BORDER_STYLE,
		FONT_SIZE,
		createInfoBox,
		createLinkBox,
		styleInfoBox,
		createColumn,
		createPopup,
		togglePopup,
		createPopupCell,
		attachTooltip,
		createMediaBox,
	} = Ui;

	const PLAYLISTS_LINK_SYMBOL = "☰♪"; // the little "see all playlists" button next to the playlists box
	const MANY_PLAYLISTS = 30; // YouTube shows about this many at most, so we show "30+"

	const symbol = (settingKey) => Settings.symbol(settingKey);

	// Builds the four columns (some may be empty) for one commenter. `info` comes from
	// ChannelData.fetchChannelInfo. The columns are built off-screen, so the caller can throw them away
	// if the comment has been given to another commenter in the meantime.
	async function build(info, channelUrl) {
		const columns = [
			createColumn(),
			createColumn(),
			createColumn(),
			createColumn(),
		];
		await fill(columns, info, channelUrl);
		return columns;
	}

	// Adds the boxes the user has switched on.
	async function fill(columns, info, channelUrl) {
		const [column1, column2, column3, column4] = columns;
		const settings = Settings.current;

		// column 1
		if (settings.subscriberCount)
			appendIfPresent(
				column1,
				createInfoBox(symbol("subscriberCount"), info.subscriberCount),
			);
		if (settings.location)
			appendIfPresent(column1, createInfoBox(symbol("location"), info.country));
		if (settings.joinedDate)
			appendIfPresent(
				column1,
				createInfoBox(symbol("joinedDate"), info.joinedDate),
			);

		// column 2
		if (settings.totalVideos)
			appendIfPresent(
				column2,
				createInfoBox(symbol("totalVideos"), info.videoCount),
			);
		if (settings.totalViewCount)
			appendIfPresent(
				column2,
				createInfoBox(symbol("totalViewCount"), info.viewCount),
			);
		if (settings.playlists) {
			const { playlists, localizedPlaylistWord } =
				await ChannelData.fetchPlaylists(channelUrl);
			if (playlists.length > 0) {
				column2.appendChild(
					createPlaylistsBox(playlists, localizedPlaylistWord, channelUrl),
				);
			}
		}

		// column 3 (the three pages are downloaded at the same time)
		const [latestVideo, latestShort, latestLivestream] = await Promise.all([
			settings.latestVideo ? ChannelData.fetchLatestVideo(channelUrl) : null,
			settings.latestShorts ? ChannelData.fetchLatestShort(channelUrl) : null,
			settings.latestLivestream
				? ChannelData.fetchLatestLivestream(channelUrl)
				: null,
		]);
		if (
			latestVideo &&
			hasAll(latestVideo, [
				"title",
				"publishedTime",
				"length",
				"videoViewCount",
			])
		) {
			column3.appendChild(createLatestVideoBox(latestVideo));
		}
		if (latestShort && hasAll(latestShort, ["title", "views"])) {
			column3.appendChild(createLatestShortBox(latestShort, channelUrl));
		}
		if (latestLivestream && latestLivestream.videoId) {
			column3.appendChild(createLatestLivestreamBox(latestLivestream));
		}

		// column 4
		if (settings.description && info.description) {
			const descriptionBox = createInfoBox(symbol("description"), " ");
			attachTooltip(descriptionBox, info.description);
			column4.appendChild(descriptionBox);
		}
		if (settings.externalLinks && info.links) {
			const linksBox = createLinkBox(symbol("externalLinks"), null);
			linksBox.style.cursor = "pointer";
			togglePopup(linksBox, (box) =>
				displayPopupExternalLinks(info.links, box),
			);
			column4.appendChild(linksBox);
		}
		if (settings.businessEmail && info.businessEmail) {
			const emailBox = createLinkBox(
				symbol("businessEmail"),
				info.businessEmail,
			);
			emailBox.style.cursor = "pointer";
			emailBox.style.textDecoration = "none";
			column4.appendChild(emailBox);
		}
	}

	function appendIfPresent(column, box) {
		if (box) column.appendChild(box);
	}

	// true if none of the named fields is null
	function hasAll(object, fieldNames) {
		return fieldNames.every((name) => object[name] !== null);
	}

	// ---------------------------------------------------------------------------------------------
	// Column 3 boxes: a link to the video, with a hover card (thumbnail, title, ...)
	// ---------------------------------------------------------------------------------------------

	function createLatestVideoBox(video) {
		return createMediaBox({
			icon: symbol("latestVideo"),
			text: video.publishedTime,
			url: "https://www.youtube.com/watch?v=" + video.videoId,
			cardClassName: "yt-enhanced-latest-video-tooltip",
			stats: [video.videoViewCount, video.length],
			thumbnail: video.thumbnail,
			title: video.title,
		});
	}

	function createLatestLivestreamBox(livestream) {
		return createMediaBox({
			icon: symbol("latestLivestream"),
			text: livestream.publishedTime,
			url: "https://www.youtube.com/watch?v=" + livestream.videoId,
			cardClassName: "yt-enhanced-latest-video-tooltip",
			stats: [livestream.videoViewCount, livestream.length],
			thumbnail: livestream.thumbnail,
			title: livestream.title,
		});
	}

	function createLatestShortBox(short, channelUrl) {
		return createMediaBox({
			icon: symbol("latestShorts"),
			text: short.views,
			url: short.videoId
				? "https://www.youtube.com/shorts/" + short.videoId
				: channelUrl + "/shorts",
			cardClassName: "yt-enhanced-latest-short-tooltip",
			stats: null, // a short has no length to show
			thumbnail: short.thumbnail,
			title: short.title,
		});
	}

	// ---------------------------------------------------------------------------------------------
	// Column 2: playlists (a box that opens a popup)
	// ---------------------------------------------------------------------------------------------

	function createPlaylistsBox(playlists, localizedPlaylistWord, channelUrl) {
		const container = document.createElement("div");
		container.style.display = "flex";
		container.style.gap = "4px";
		container.style.alignItems = "center";

		const count =
			playlists.length >= MANY_PLAYLISTS
				? MANY_PLAYLISTS + "+"
				: playlists.length;
		const box = document.createElement("div");
		box.className = "yt-enhanced-info-item";
		box.textContent =
			symbol("playlists") + " " + count + " " + localizedPlaylistWord;
		styleInfoBox(box);
		box.style.cursor = "pointer";
		togglePopup(box, (anchor) => displayPopupPlaylists(playlists, anchor));
		container.appendChild(box);

		// with two or more playlists there is also a button that opens the channel's playlists page
		if (playlists.length >= 2) {
			const seeAllButton = createLinkBox(
				PLAYLISTS_LINK_SYMBOL,
				channelUrl + "/playlists",
			);
			seeAllButton.style.cursor = "pointer";
			seeAllButton.style.textDecoration = "none";
			container.appendChild(seeAllButton);
		}

		return container;
	}

	// Table rows: title | number of videos | thumbnail (a link to the playlist)
	function displayPopupPlaylists(playlists, anchorEl) {
		createPopup(anchorEl, (popup) => {
			playlists.forEach((playlist) => {
				const row = document.createElement("div");
				row.style.display = "table-row";

				const thumbnailCell = createLinkCell(playlist.url);
				if (playlist.thumbnail) {
					const image = document.createElement("img");
					image.src = playlist.thumbnail;
					image.style.width = "60px";
					image.style.height = "45px";
					image.style.borderRadius = "2px";
					thumbnailCell.appendChild(image);
				}

				row.appendChild(createPopupCell(playlist.title, "left"));
				row.appendChild(createPopupCell(playlist.videos, "center"));
				row.appendChild(thumbnailCell);
				popup.appendChild(row);
			});
		});
	}

	// ---------------------------------------------------------------------------------------------
	// Column 4: external links (a box that opens a popup)
	// ---------------------------------------------------------------------------------------------

	// Table rows: title | icon (a link to the page)
	function displayPopupExternalLinks(links, anchorEl) {
		createPopup(anchorEl, (popup) => {
			links.forEach((item) => {
				if (!item.link) return;

				// links on the about page often have no "https://"
				let url = item.link;
				if (!/^https?:\/\//i.test(url)) {
					url = "https://www." + url.replace(/^www\./i, "");
				}

				const iconCell = createLinkCell(url);
				if (item.icon) {
					const image = document.createElement("img");
					image.src = item.icon;
					image.style.width = "16px";
					image.style.height = "16px";
					iconCell.appendChild(image);
				}

				const row = document.createElement("div");
				row.style.display = "table-row";
				row.appendChild(createPopupCell(item.title, "left"));
				row.appendChild(iconCell);
				popup.appendChild(row);
			});
		});
	}

	// A popup table cell that is a link opening in a new tab
	function createLinkCell(url) {
		const cell = document.createElement("a");
		cell.style.display = "table-cell";
		cell.style.padding = PADDING;
		cell.style.border = BORDER_STYLE;
		cell.style.borderRadius = BORDER_RADIUS;
		cell.style.fontSize = FONT_SIZE;
		cell.style.textAlign = "center";
		cell.style.verticalAlign = "middle";
		cell.style.textDecoration = "none";
		cell.href = url;
		cell.target = "_blank";
		cell.rel = "noopener noreferrer";
		return cell;
	}

	return Object.freeze({ build });
})();
