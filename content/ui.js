const Ui = (() => {
	const PADDING = "4px 8px";
	const BORDER_RADIUS = "4px";
	const GAP = "4px";
	const FONT_SIZE = "1rem";
	const SMALL_FONT_SIZE = "0.9rem";
	const ICON_SIZE = "16px";
	const POPUP_ZINDEX = "1000000";
	const BORDER_STYLE = "1px solid rgba(128,128,128,0.2)";
	const GENERAL_BACKGROUND = "var(--yt-sys-color-baseline--base-background)";
	const TEXT_COLOR = "var(--yt-sys-color-baseline--text-primary)";
	const BOX_SHADOW = "0 2px 8px rgba(0,0,0,0.15)";

	const POPUP_SELECTOR = ".yt-cmt-info-popup";
	const ANIMATION_MS = 300;

	function createInfoBox(icon, text) {
		if (!text) return null;
		const box = document.createElement("div");
		box.className = "yt-cmt-info-box";
		box.textContent = icon + " " + text;
		styleInfoBox(box);
		return box;
	}

	function createLinkBox(iconText, url) {
		const link = document.createElement("a");
		link.className = "yt-cmt-info-box";
		link.textContent = iconText;
		if (url) {
			link.href = url;
			link.target = "_blank";
			link.rel = "noopener noreferrer";
		}
		styleInfoBox(link);
		return link;
	}

	function styleInfoBox(element) {
		element.style.background = GENERAL_BACKGROUND;
		element.style.color = TEXT_COLOR;
		element.style.padding = PADDING;
		element.style.borderRadius = BORDER_RADIUS;
		element.style.border = BORDER_STYLE;
		element.style.fontSize = FONT_SIZE;
		element.style.width = "fit-content";
		element.style.position = "relative";
	}

	function createColumn() {
		const column = document.createElement("div");
		column.style.display = "flex";
		column.style.flexDirection = "column";
		column.style.gap = "4px";
		return column;
	}

	function applyAnimationStyles(element) {
		element.style.transition = "transform 0.3s ease, opacity 0.3s ease";
		element.style.transform = "translateY(-10px)";
		element.style.opacity = "0";
	}

	function fadeIn(element) {
		requestAnimationFrame(() => {
			element.style.transform = "translateY(0)";
			element.style.opacity = "1";
		});
	}

	function fadeOut(element, afterwards) {
		element.style.transform = "translateY(-10px)";
		element.style.opacity = "0";
		if (afterwards) setTimeout(afterwards, ANIMATION_MS);
	}

	function createPopup(anchorEl, buildRows, options = {}) {
		const popup = document.createElement("div");
		popup.className = "yt-cmt-info-popup";
		popup.style.position = "absolute";
		popup.style.background = GENERAL_BACKGROUND;
		popup.style.color = TEXT_COLOR;
		popup.style.padding = "8px";
		popup.style.border = BORDER_STYLE;
		popup.style.borderRadius = BORDER_RADIUS;
		popup.style.boxShadow = BOX_SHADOW;
		popup.style.zIndex = POPUP_ZINDEX;
		popup.style.display = "table";
		popup.style.borderSpacing = GAP;
		applyAnimationStyles(popup);

		buildRows(popup);
		equalizeColumnWidths(popup);

		const alreadyOpen = document.querySelector(POPUP_SELECTOR);
		if (alreadyOpen) alreadyOpen.remove();

		document.body.appendChild(popup);
		fadeIn(popup);

		const rect = anchorEl.getBoundingClientRect();
		popup.style.top = rect.bottom + window.scrollY + 4 + "px";
		popup.style.left = rect.left + window.scrollX + "px";
		if (options.keepInWindow) keepInWindow(popup);

		// click anywhere to close it
		function closeOnOutsideClick(event) {
			if (!popup.contains(event.target) && event.target !== anchorEl) {
				fadeOut(popup, () => {
					popup.remove();
					document.removeEventListener("click", closeOnOutsideClick);
				});
			}
		}
		document.addEventListener("click", closeOnOutsideClick);

		return popup;
	}

	function equalizeColumnWidths(popup) {
		const leftColumns = popup.querySelectorAll(
			'div[style*="text-align: left"]',
		);
		const middleColumns = popup.querySelectorAll(
			'div[style*="text-align: center"]',
		);
		const rightColumns = popup.querySelectorAll(
			'div[style*="vertical-align: middle"]',
		);

		const widest = (cells) =>
			cells.length === 0
				? 0
				: Math.max(...Array.from(cells, (cell) => cell.offsetWidth));
		const maxLeftWidth = widest(leftColumns);
		const maxMiddleWidth = widest(middleColumns);
		const maxRightWidth = widest(rightColumns);

		leftColumns.forEach((cell) => {
			cell.style.width = maxLeftWidth + "px";
		});
		middleColumns.forEach((cell) => {
			cell.style.width = maxMiddleWidth + "px";
		});
		rightColumns.forEach((cell) => {
			cell.style.width = maxRightWidth + "px";
		});
	}

	function keepInWindow(popup) {
		const maxLeft =
			document.documentElement.clientWidth -
			popup.offsetWidth -
			8 +
			window.scrollX;
		const left = parseFloat(popup.style.left) || 0;
		popup.style.left =
			Math.max(8 + window.scrollX, Math.min(left, maxLeft)) + "px";
	}

	let nextPopupOwnerId = 0;
	function togglePopup(element, openFn) {
		const ownerId = String(++nextPopupOwnerId);
		element.addEventListener("click", (event) => {
			event.preventDefault();
			const openPopup = document.querySelector(POPUP_SELECTOR);
			if (openPopup && openPopup.dataset.owner === ownerId) {
				fadeOut(openPopup, () => openPopup.remove());
				return;
			}
			openFn(element);
			const created = document.querySelector(POPUP_SELECTOR);
			if (created) created.dataset.owner = ownerId;
		});
	}

	function createPopupCell(text, align) {
		const cell = document.createElement("div");
		cell.style.display = "table-cell";
		cell.style.padding = PADDING;
		cell.style.border = BORDER_STYLE;
		cell.style.borderRadius = BORDER_RADIUS;
		cell.style.fontSize = FONT_SIZE;
		cell.style.textAlign = align;
		cell.style.verticalAlign = "middle";
		cell.textContent = text;
		return cell;
	}

	function positionTooltip(event, tooltip) {
		tooltip.style.left = event.pageX + 10 + "px";
		tooltip.style.top = event.pageY + 10 + "px";
	}

	function attachTooltip(element, text) {
		if (!text) return;

		const tooltip = document.createElement("div");
		tooltip.style.background = GENERAL_BACKGROUND;
		tooltip.style.color = TEXT_COLOR;
		tooltip.style.padding = "8px";
		tooltip.style.borderRadius = BORDER_RADIUS;
		tooltip.style.border = BORDER_STYLE;
		tooltip.style.fontSize = FONT_SIZE;
		tooltip.style.position = "absolute";
		tooltip.style.whiteSpace = "pre-wrap";
		tooltip.style.zIndex = POPUP_ZINDEX + 1;
		tooltip.style.display = "none";
		tooltip.style.boxShadow = BOX_SHADOW;
		applyAnimationStyles(tooltip);
		tooltip.textContent = text.replace(/\\"/g, '"');
		document.body.appendChild(tooltip);

		element.addEventListener("mouseover", (event) => {
			tooltip.style.display = "block";
			positionTooltip(event, tooltip);
			fadeIn(tooltip);
		});
		element.addEventListener("mousemove", (event) =>
			positionTooltip(event, tooltip),
		);
		element.addEventListener("mouseout", () => {
			fadeOut(tooltip, () => {
				tooltip.style.display = "none";
			});
		});
	}

	function attachHoverCard(box, className, fillCard) {
		let card = null;

		box.addEventListener("mouseover", () => {
			if (card) return;
			card = document.createElement("div");
			card.className = className;
			card.style.position = "absolute";
			card.style.background = GENERAL_BACKGROUND;
			card.style.color = TEXT_COLOR;
			card.style.padding = "4px";
			card.style.border = BORDER_STYLE;
			card.style.borderRadius = BORDER_RADIUS;
			card.style.boxShadow = BOX_SHADOW;
			card.style.zIndex = POPUP_ZINDEX;
			card.style.display = "block";
			card.style.flexDirection = "column";
			card.style.gap = GAP;
			applyAnimationStyles(card);

			fillCard(card);
			document.body.appendChild(card);

			const rect = box.getBoundingClientRect();
			card.style.top = rect.bottom + window.scrollY + 4 + "px";
			card.style.left = rect.left + window.scrollX + "px";
			fadeIn(card);
		});

		box.addEventListener("mousemove", (event) => {
			if (card) positionTooltip(event, card);
		});

		box.addEventListener("mouseout", () => {
			if (!card) return;
			fadeOut(card, () => {
				if (card) {
					card.remove();
					card = null;
				}
			});
		});
	}

	function createCardCell(text) {
		const cell = document.createElement("div");
		cell.style.flex = "1";
		cell.style.display = "flex";
		cell.style.alignItems = "center";
		cell.style.justifyContent = "center";
		cell.style.padding = PADDING;
		cell.style.border = BORDER_STYLE;
		cell.style.borderRadius = BORDER_RADIUS;
		cell.style.fontSize = FONT_SIZE;
		cell.textContent = text;
		return cell;
	}

	function fillMediaCard(card, { stats, thumbnail, title }) {
		if (stats) {
			const statsRow = document.createElement("div");
			statsRow.style.display = "flex";
			statsRow.style.gap = GAP;
			statsRow.style.marginBottom = "4px";
			stats.forEach((text) => statsRow.appendChild(createCardCell(text)));
			card.appendChild(statsRow);
		}

		const thumbnailRow = document.createElement("div");
		thumbnailRow.style.display = "flex";
		thumbnailRow.style.justifyContent = "center";
		thumbnailRow.style.alignItems = "center";
		thumbnailRow.style.marginBottom = "4px";
		if (thumbnail) {
			const image = document.createElement("img");
			image.src = thumbnail;
			image.style.borderRadius = BORDER_RADIUS;
			image.style.border = BORDER_STYLE;
			image.style.maxWidth = "150px";
			image.style.height = "auto";
			image.addEventListener("load", () => {
				card.style.width = image.offsetWidth + "px";
			});
			thumbnailRow.appendChild(image);
		}
		card.appendChild(thumbnailRow);

		const titleRow = document.createElement("div");
		titleRow.style.padding = PADDING;
		titleRow.style.border = BORDER_STYLE;
		titleRow.style.borderRadius = BORDER_RADIUS;
		titleRow.style.fontSize = FONT_SIZE;
		titleRow.style.whiteSpace = "normal";
		titleRow.style.wordBreak = "break-word";
		titleRow.textContent = title;
		card.appendChild(titleRow);
	}

	function createMediaBox({
		icon,
		text,
		url,
		cardClassName,
		stats,
		thumbnail,
		title,
	}) {
		const box = document.createElement("a");
		box.href = url;
		box.target = "_blank";
		box.rel = "noopener noreferrer";
		box.style.textDecoration = "none";
		box.className = "yt-cmt-info-box";
		box.textContent = icon + " " + text;
		styleInfoBox(box);
		attachHoverCard(box, cardClassName, (card) =>
			fillMediaCard(card, { stats, thumbnail, title }),
		);
		return box;
	}

	return Object.freeze({
		PADDING,
		BORDER_RADIUS,
		GAP,
		FONT_SIZE,
		SMALL_FONT_SIZE,
		ICON_SIZE,
		BORDER_STYLE,
		createInfoBox,
		createLinkBox,
		styleInfoBox,
		createColumn,
		createPopup,
		togglePopup,
		createPopupCell,
		attachTooltip,
		createMediaBox,
	});
})();
