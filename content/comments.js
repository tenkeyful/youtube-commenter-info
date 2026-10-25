/*
- columns 1-4  from the commenter's channel pages        ChannelData / ChannelColumns
- columns 5-7  from the commenter's YouTube profile card  ProfileCards / ProfileCardColumns

YouTube is a single-page app: comments are added to the page (and comment elements are even
reused for other commenters) without a page load, so we watch the page for changes. This file is loaded
on every youtube.com page, not only on video pages: you can reach a video from the home page without a
page load, and then no new scripts would be injected.
*/
(() => {
	const AUTHOR_LINK_SELECTOR = "div#header-author a"; // the link on the commenter's name

	// Puts the container under the handle (above the comment text) or next to the handle,
	// depending on the "Position" setting
	function placeInfoContainer(commentElement, infoContainer) {
		if (
			Settings.current.infoBoxPosition === Settings.POSITIONS.NEXT_TO_HANDLE
		) {
			const headerAuthor = commentElement.querySelector("#header-author");
			if (headerAuthor) {
				// next to the handle all boxes flow in one line instead of columns (see styles.css)
				infoContainer.classList.add("yt-cmt-info-inline");
				infoContainer.style.marginLeft = "8px";
				infoContainer.style.marginTop = "0px";
				infoContainer.style.marginBottom = "0px";
				headerAuthor.appendChild(infoContainer);
			}
		} else {
			const commentText = commentElement.querySelector("#content-text");
			if (commentText && commentText.parentElement) {
				commentText.parentElement.insertBefore(infoContainer, commentText);
			}
		}
	}

	// The (still empty) container that holds all columns
	function createInfoContainer() {
		const container = document.createElement("div");
		container.className = "yt-enhanced-info";
		container.style.display = "flex";
		container.style.flexWrap = "wrap"; // seven columns can be wider than the container
		container.style.gap = "8px";
		container.style.marginTop = "4px";
		container.style.marginBottom = "8px";
		container.style.width = "100%";
		container.style.maxWidth = "800px";
		return container;
	}

	// Info containers by comment, so one that YouTube throws away can be put back (see restoreRemovedContainers)
	const containers = new Map(); // comment element -> { infoContainer, place }
	const RESTORE_DELAY_MS = 300;

	// The link on the commenter's name as it is right now (YouTube changes it when it reuses the element)
	function currentChannelUrl(commentElement) {
		const link = commentElement.querySelector(AUTHOR_LINK_SELECTOR);
		return link ? link.href : null;
	}

	// null instead of an error when the channel page can't be downloaded: columns 5-7 don't depend on it
	async function fetchChannelInfoOrNull(channelUrl) {
		try {
			return await ChannelData.fetchChannelInfo(channelUrl);
		} catch (error) {
			return null;
		}
	}

	async function addChannelInfo(commentElement) {
		if (!commentElement.querySelector("div#header-author")) return;

		// Only the newest run for a comment may finish; older ones just stop.
		const thisRun = {};
		commentElement._commenterInfoRun = thisRun;
		const isOutdated = () => commentElement._commenterInfoRun !== thisRun;

		containers.delete(commentElement);
		const previousContainer = commentElement.querySelector(".yt-enhanced-info");
		if (previousContainer) previousContainer.remove();

		const authorLink = commentElement.querySelector(AUTHOR_LINK_SELECTOR);
		if (!authorLink) return;

		// columns 1-4
		const channelUrl = authorLink.href;
		const channelInfo = await fetchChannelInfoOrNull(channelUrl);
		const channelColumns = channelInfo
			? await ChannelColumns.build(channelInfo, channelUrl)
			: [];
		if (isOutdated()) return;
		// the comment has a different commenter by now: start over for them
		if (currentChannelUrl(commentElement) !== channelUrl)
			return addChannelInfo(commentElement);

		const infoContainer = createInfoContainer();
		const place = () => placeInfoContainer(commentElement, infoContainer);
		containers.set(commentElement, { infoContainer, place });

		let shownColumns = [];
		function showChannelColumns(columns) {
			shownColumns.forEach((column) => column.remove());
			shownColumns = columns.filter((column) => column.children.length > 0);
			[...shownColumns]
				.reverse()
				.forEach((column) => infoContainer.prepend(column));
			if (infoContainer.children.length > 0 && !infoContainer.isConnected)
				place();
		}
		showChannelColumns(channelColumns);

		let latestRefresh = 0;
		const linkObserver = new MutationObserver(async (mutations) => {
			if (isOutdated()) {
				linkObserver.disconnect();
				return;
			}
			if (
				!mutations.some(
					(mutation) =>
						mutation.type === "attributes" && mutation.attributeName === "href",
				)
			)
				return;

			const thisRefresh = ++latestRefresh;
			infoContainer.style.visibility = "hidden";
			const newChannelUrl = currentChannelUrl(commentElement);
			if (!newChannelUrl) return;

			const newInfo = await fetchChannelInfoOrNull(newChannelUrl);
			const newColumns = newInfo
				? await ChannelColumns.build(newInfo, newChannelUrl)
				: [];
			if (isOutdated() || thisRefresh !== latestRefresh) return; // a newer change replaced this one
			showChannelColumns(newColumns);
			infoContainer.style.visibility = "visible";
		});
		linkObserver.observe(authorLink, { attributes: true });

		// columns 5-7 (they redo themselves when the link changes)
		ProfileCardColumns.attach({
			commentElement,
			infoContainer,
			authorLink,
			placeContainer: place,
		});
	}

	// YouTube sometimes re-renders a comment's header and drops our container with it.
	// Put such containers back; everything needed is still in memory, so this asks the network for nothing.
	function restoreRemovedContainers() {
		for (const [commentElement, { infoContainer, place }] of containers) {
			if (!commentElement.isConnected) {
				containers.delete(commentElement); // the comment itself is gone
			} else if (
				!infoContainer.isConnected &&
				infoContainer.children.length > 0
			) {
				place();
			}
		}
	}

	let restoreScheduled = false;
	function scheduleRestore() {
		if (restoreScheduled) return;
		restoreScheduled = true;
		setTimeout(() => {
			restoreScheduled = false;
			restoreRemovedContainers();
		}, RESTORE_DELAY_MS);
	}

	// Calls addChannelInfo for every comment (and reply) that shows up in the page
	function watchForComments() {
		const app = document.querySelector("ytd-app");
		if (!app) return; // not YouTube's normal page (for example an embedded player): nothing to do

		const commentObserver = new MutationObserver((mutations) => {
			const done = new Set(); // a comment can be reported more than once in one batch

			function process(commentElement) {
				if (done.has(commentElement)) return;
				done.add(commentElement);
				addChannelInfo(commentElement);
			}

			mutations.forEach((mutation) => {
				mutation.addedNodes.forEach((node) => {
					if (node.nodeType !== Node.ELEMENT_NODE) return;

					if (node.matches("ytd-comment-thread-renderer")) {
						// a comment
						const commentElement = node.querySelector("ytd-comment-view-model");
						if (commentElement) process(commentElement);
					}
					if (node.matches("ytd-comment-view-model")) process(node); // a reply
					node.querySelectorAll("ytd-comment-view-model").forEach(process);
				});
			});

			scheduleRestore(); // YouTube changes the page all the time: check that our containers are still there
		});

		commentObserver.observe(app, { childList: true, subtree: true });
	}

	// Wait for the saved settings first, so the very first comments already use them
	Settings.load().then(() => {
		ProfileCards.start();
		watchForComments();
	});
})();
