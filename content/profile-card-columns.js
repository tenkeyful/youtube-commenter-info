// These columns appear a little later than columns 1 to 4, because the profile card is requested
// slowly, one commenter at a time. attach() takes care of adding them when the card arrives.
const ProfileCardColumns = (() => {
	const {
		PADDING,
		BORDER_RADIUS,
		BORDER_STYLE,
		GAP,
		SMALL_FONT_SIZE,
		ICON_SIZE,
		createInfoBox,
		styleInfoBox,
		createColumn,
		createPopup,
		togglePopup,
	} = Ui;

	// Subscriptions popup: a grid of round avatars with the channel name under each
	const SUBSCRIPTION_COLUMNS = 4; // avatars per row
	const SUBSCRIPTION_AVATAR_PX = 40; // same as commenter's profile picture, hardcoded for now im too lazy af
	const SUBSCRIPTION_CELL_WIDTH = "88px"; // long names wrap inside this width
	// Recent comments popup: video title | comment
	const RECENT_TITLE_WIDTH = "110px";
	const RECENT_COMMENT_WIDTH = "260px";
	const RECENT_COMMENT_MAX_LINES = 6; // longer comments fade out; an arrow expands them
	const POPUP_MAX_HEIGHT = "400px"; // popups scroll beyond this

	const symbol = (settingKey) => Settings.symbol(settingKey);

	// ---------------------------------------------------------------------------------------------
	// Building the columns
	// ---------------------------------------------------------------------------------------------

	// Returns the non-empty columns among columns 5, 6 and 7 for this card
	function build(card) {
		const settings = Settings.current;
		const column5 = createColumn();
		const column6 = createColumn();
		const column7 = createColumn();

		// column 5
		if (settings.profileComments)
			appendIfPresent(
				column5,
				createInfoBox(symbol("profileComments"), card.commentsCount),
			);
		if (settings.heartsReceived)
			appendIfPresent(
				column5,
				createInfoBox(symbol("heartsReceived"), card.heartsReceived),
			);
		if (settings.pronouns)
			appendIfPresent(
				column5,
				createInfoBox(symbol("pronouns"), card.pronouns),
			);

		// column 6
		if (settings.badges) {
			card.badges.forEach((badge) =>
				column6.appendChild(createBadgeBox(badge)),
			);
		}

		// column 7
		if (
			settings.recentComments &&
			card.recentCommentsLabel &&
			card.recentComments.length > 0
		) {
			column7.appendChild(
				createButtonBox(
					symbol("recentComments"),
					card.recentCommentsLabel,
					(anchor) => displayPopupRecentComments(card.recentComments, anchor),
				),
			);
		}
		if (
			settings.subscriptions &&
			card.subscriptionsLabel &&
			card.subscriptions.length > 0
		) {
			column7.appendChild(
				createButtonBox(
					symbol("subscriptions"),
					card.subscriptionsLabel,
					(anchor) => displayPopupSubscriptions(card.subscriptions, anchor),
				),
			);
		}

		return [column5, column6, column7].filter(
			(column) => column.children.length > 0,
		);
	}

	function appendIfPresent(column, box) {
		if (box) column.appendChild(box);
	}

	// A box that opens a popup when clicked
	function createButtonBox(boxSymbol, label, openPopup) {
		const box = document.createElement("div");
		box.className = "yt-enhanced-info-item";
		box.textContent = boxSymbol + " " + label;
		styleInfoBox(box);
		box.style.cursor = "pointer";
		togglePopup(box, openPopup);
		return box;
	}

	// A badge: its icon, the name in bold and a description under it
	function createBadgeBox(badge) {
		const box = document.createElement("div");
		box.className = "yt-enhanced-badge-item";

		const row = document.createElement("div");
		row.style.display = "flex";
		row.style.alignItems = "center";

		if (badge.iconUrl) {
			const iconWrapper = document.createElement("div");
			iconWrapper.style.display = "flex";
			iconWrapper.style.alignItems = "center";
			iconWrapper.style.marginRight = "8px";
			const icon = document.createElement("img");
			icon.src = badge.iconUrl;
			icon.style.height = ICON_SIZE;
			icon.style.width = ICON_SIZE;
			iconWrapper.appendChild(icon);
			row.appendChild(iconWrapper);
		}

		const texts = document.createElement("div");
		texts.style.display = "flex";
		texts.style.flexDirection = "column";
		const title = document.createElement("div");
		title.textContent = badge.title;
		title.style.fontWeight = "bold";
		texts.appendChild(title);
		if (badge.subtitle) {
			const subtitle = document.createElement("div");
			subtitle.textContent = badge.subtitle;
			subtitle.style.fontSize = SMALL_FONT_SIZE;
			subtitle.style.marginTop = "2px";
			texts.appendChild(subtitle);
		}
		row.appendChild(texts);
		box.appendChild(row);

		styleInfoBox(box);
		box.style.minWidth = "180px";
		return box;
	}

	function displayPopupRecentComments(comments, anchorEl) {
		const clampedHeight =
			Math.round(RECENT_COMMENT_MAX_LINES * 130) / 100 + "em"; // line-height is 1.3
		const commentTexts = [];

		const popup = createPopup(
			anchorEl,
			(popupElement) => {
				const grid = document.createElement("div");
				grid.style.display = "grid";
				grid.style.gridTemplateColumns =
					RECENT_TITLE_WIDTH + " " + RECENT_COMMENT_WIDTH;
				grid.style.gap = GAP;
				grid.style.maxHeight = POPUP_MAX_HEIGHT;
				grid.style.overflowY = "auto";

				comments.forEach((entry) => {
					const titleCell = createBorderedCell();
					titleCell.style.display = "flex";
					titleCell.style.alignItems = "center";
					titleCell.style.fontWeight = "bold";
					titleCell.style.overflowWrap = "anywhere";
					titleCell.textContent = entry.videoTitle || "";

					const commentCell = createBorderedCell();
					commentCell.style.display = "flex";
					commentCell.style.flexDirection = "column";
					commentCell.style.justifyContent = "center";

					const text = document.createElement("div");
					text.style.lineHeight = "1.3";
					text.style.overflow = "hidden";
					text.style.overflowWrap = "anywhere";
					text.style.maxHeight = clampedHeight;
					text.textContent = entry.commentContent || "";
					commentCell.appendChild(text);

					grid.appendChild(titleCell);
					grid.appendChild(commentCell);
					commentTexts.push({ text, commentCell });
				});
				popupElement.appendChild(grid);
			},
			{ keepInWindow: true },
		);

		// Only now that the popup is in the page can we measure which comments are cut off
		commentTexts.forEach(({ text, commentCell }) => {
			if (text.scrollHeight <= text.clientHeight + 1) return; // fits: nothing to do
			addExpandArrow(text, commentCell, clampedHeight);
		});

		return popup;
	}

	// Fades the bottom of `text` out and adds an arrow that expands / collapses it
	function addExpandArrow(text, commentCell, clampedHeight) {
		const FADE =
			"linear-gradient(to bottom, #000 calc(100% - 2em), transparent)";
		const setFade = (on) => {
			text.style.webkitMaskImage = on ? FADE : "none";
			text.style.maskImage = on ? FADE : "none";
		};
		setFade(true);

		const arrow = document.createElement("div");
		arrow.className = "yt-enhanced-info-center";
		arrow.textContent = "▾";
		arrow.setAttribute("role", "button");
		arrow.setAttribute("aria-expanded", "false");
		arrow.style.cursor = "pointer";
		arrow.style.lineHeight = "1";
		arrow.style.padding = "4px 0 2px";
		arrow.style.opacity = "0.7";
		arrow.addEventListener("click", () => {
			const wasExpanded = arrow.getAttribute("aria-expanded") === "true";
			text.style.maxHeight = wasExpanded ? clampedHeight : "none";
			setFade(wasExpanded);
			arrow.textContent = wasExpanded ? "▾" : "▴";
			arrow.setAttribute("aria-expanded", String(!wasExpanded));
		});
		commentCell.appendChild(arrow);
	}

	// Round avatars in a grid with the channel name centered under each. Names wrap onto more lines;
	// they are never cut off with "...".
	function displayPopupSubscriptions(subscriptions, anchorEl) {
		return createPopup(
			anchorEl,
			(popupElement) => {
				const grid = document.createElement("div");
				grid.style.display = "grid";
				grid.style.gridTemplateColumns =
					"repeat(" +
					Math.min(SUBSCRIPTION_COLUMNS, subscriptions.length) +
					", " +
					SUBSCRIPTION_CELL_WIDTH +
					")";
				grid.style.gap = "12px 8px";
				grid.style.alignItems = "start";
				grid.style.maxHeight = POPUP_MAX_HEIGHT;
				grid.style.overflowY = "auto";

				subscriptions.forEach((subscription) => {
					const cell = document.createElement("div");
					cell.style.display = "flex";
					cell.style.flexDirection = "column";
					cell.style.alignItems = "center";
					cell.style.gap = "6px";
					cell.style.minWidth = "0";

					const avatarUrl = pickImage(
						subscription.avatarSources,
						SUBSCRIPTION_AVATAR_PX * 2,
					); // 2x for sharp screens
					let avatar;
					if (avatarUrl) {
						avatar = document.createElement("img");
						avatar.src = avatarUrl;
						avatar.alt = subscription.channelName || "";
						avatar.style.objectFit = "cover";
					} else {
						avatar = document.createElement("div");
						avatar.style.background = "rgba(128,128,128,0.2)";
					}
					avatar.style.width = SUBSCRIPTION_AVATAR_PX + "px";
					avatar.style.height = SUBSCRIPTION_AVATAR_PX + "px";
					avatar.style.borderRadius = "50%";
					avatar.style.flex = "none";
					cell.appendChild(avatar);

					if (subscription.channelName) {
						const name = document.createElement("div");
						name.className = "yt-enhanced-info-center";
						name.textContent = subscription.channelName;
						name.style.fontSize = SMALL_FONT_SIZE;
						name.style.lineHeight = "1.25";
						name.style.maxWidth = "100%";
						name.style.whiteSpace = "normal";
						name.style.overflowWrap = "anywhere";
						name.style.wordBreak = "break-word";
						cell.appendChild(name);
					}
					grid.appendChild(cell);
				});
				popupElement.appendChild(grid);
			},
			{ keepInWindow: true },
		);
	}

	// A bordered, padded cell (the same look as the cells of the foundation's popups)
	function createBorderedCell() {
		const cell = document.createElement("div");
		cell.style.minWidth = "0";
		cell.style.padding = PADDING;
		cell.style.border = BORDER_STYLE;
		cell.style.borderRadius = BORDER_RADIUS;
		cell.style.fontSize = SMALL_FONT_SIZE;
		return cell;
	}

	// The url of the smallest image that is at least `minWidth` wide (sharp on high-DPI screens),
	// otherwise the largest one. null if there are no images.
	function pickImage(sources, minWidth) {
		if (!sources || sources.length === 0) return null;
		const bigEnough = sources
			.filter((source) => (source.width || 0) >= minWidth)
			.sort((a, b) => a.width - b.width)[0];
		return (
			bigEnough ||
			[...sources].sort((a, b) => (b.width || 0) - (a.width || 0))[0]
		).url;
	}

	function attach({
		commentElement,
		infoContainer,
		authorLink,
		placeContainer,
	}) {
		const profileCardSettings = Settings.keysFor("profile-card");
		if (!Settings.anyEnabled(profileCardSettings)) return;

		// Each call to attach() replaces the previous one for this comment, so answers that arrive
		// late for an earlier attach() are ignored.
		const thisAttachment = {};
		commentElement._commenterInfoProfileCards = thisAttachment;
		const isCurrent = () =>
			commentElement._commenterInfoProfileCards === thisAttachment;

		let cancelWaiting = () => {};
		let addedColumns = [];

		function showCardOf(channelUrl) {
			cancelWaiting = ProfileCards.whenAvailable(channelUrl, (card) => {
				if (!isCurrent()) return;
				addedColumns = build(card);
				addedColumns.forEach((column) => infoContainer.appendChild(column));
				if (addedColumns.length > 0 && !infoContainer.isConnected)
					placeContainer();
			});
		}
		showCardOf(authorLink.href);

		new MutationObserver((mutations) => {
			if (!mutations.some((mutation) => mutation.attributeName === "href"))
				return;
			cancelWaiting();
			addedColumns.forEach((column) => column.remove());
			addedColumns = [];
			showCardOf(authorLink.href);
		}).observe(authorLink, { attributes: true });
	}

	return Object.freeze({ attach, build });
})();
