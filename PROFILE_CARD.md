## Technical details
> `POST: https://www.youtube.com/youtubei/v1/account/get_profile_card`
>
> Open a YouTube video, scroll down to the comment section, open DevTools, open the Network tab, click on a profile picture of any commenter, right click on the `get_profile_card` request, Copy Value, Copy Response.

[Example of Response](https://www.youtube.com/watch?v=vBhaFvwvRac&lc=UgzFjS3TkLJ3QZ51Vup4AaABAg):
```
...
"profileBadgeInfoChannelWide": {
                        "badges": [
                            {
                                "badgeIconUrl": "https://www.gstatic.com/youtube/img/identity/top_commenter_v1.png",
                                "badgeDesc": "Top commenter",
                                "badgeSubtitle": "Received one of the highest number of hearts from CodeSource"
                            }
                        ],
                        "profileSectionTitle": "On this channel",
                        "commentBadge": {
                            "commentBadgeIconUrl": "https://www.gstatic.com/images/icons/material/system/1x/comment_grey600_36dp.png",
                            "blackHeartIconUrl": "https://www.gstatic.com/images/icons/material/system/1x/favorite_grey600_36dp.png",
                            "commentDesc": "22 comments",
                            "blackHeartDesc": "7 received",
                            "commentBadgeA11yLabel": "Comment Badge",
                            "blackHeartA11yLabel": "Heart Badge"
                        }
                    },
...
commentInteractionViewModel": {
                                                                "headerPrefix": "Commented on",
                                                                "videoTitle": "The Untold Story of NoSQL Databases",
                                                                "commentContent": "Schema didn't disappear, it moved.\" This line stuck with me",
                                                                "chevronUrl": "https://www.gstatic.com/images/icons/material/system/1x/keyboard_arrow_right_grey600_36dp.png",
                                                                "index": 0,
                                                                "onTapA11yLabel": "View comment",
                                                                "rendererContext": {
                                                                    "commandContext": {
                                                                        "onTap": {
                                                                            "innertubeCommand": {
                                                                                "clickTrackingParams": "CAUQppQJGAEiEwjA6rnwwvSSAxVKLtYAHScRCqjKAQSxn_dk",
                                                                                "commandMetadata": {
                                                                                    "webCommandMetadata": {
                                                                                        "sendPost": true,
                                                                                        "apiUrl": "/youtubei/v1/notification/get_notification_menu"
                                                                                    }
                                                                                },
                                                                                "getCommentsFromInboxCommand": {
                                                                                    "videoId": "jnKy3yYHVsQ",
                                                                                    "linkedCommentId": "UgwrVpA2j0sxSYIRo4F4AaABAg",
                                                                                    "commentsFromInboxType": "COMMENTS_FROM_INBOX_TYPE_PROFILE_CARDS"
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                },
                                                                "loggingDirectives": {
                                                                    "trackingParams": "CAUQppQJGAEiEwjA6rnwwvSSAxVKLtYAHScRCqg=",
                                                                    "visibility": {
                                                                        "types": "12"
                                                                    }
                                                                }
                                                            }
```
## How `get_profile_card` works

`POST https://www.youtube.com/youtubei/v1/account/get_profile_card?prettyPrint=false`

Everything below was found by capturing the request YouTube's own page sends (Playwright `postDataBuffer()`, attached to a normal Chrome started with `--remote-debugging-port`), then replaying it.

### Request body is JSON

```
{
    "context": {
        "client": {
            "hl": "en",
            "clientName": "WEB",
            "clientVersion": "...",
            "visitorData": "..."
        }
    },
    "profileOwnerExternalChannelId": "UC...",
    "profileCardContext": "<opaque string>"
}
```

- `context` is the usual Innertube client context. In the page it is available as `ytcfg.get("INNERTUBE_CONTEXT")`.
- `profileOwnerExternalChannelId` is the commenter's channel ID.
- `profileCardContext` is an opaque token that YouTube generates **server-side** and sends along with the comment. It is not built by YouTube's JS.

> [!NOTE]
> A real captured request has exactly these three top-level keys. The add-on builds `context` from `ytcfg.get("INNERTUBE_CONTEXT")`, which should match what YouTube's page sends.

### Headers

Sent from inside the page (same origin), so cookies and `Origin` are the real ones:

| Header                                               | Value                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Authorization`                                      | `SAPISIDHASH <ts>_<sha1>` where `sha1 = SHA1(ts + " " + SAPISID + " " + "https://www.youtube.com")`. Generate it **per request**; a stale one gives `400 unsafe for trusted domain`. |
| `X-Origin`                                           | `https://www.youtube.com`                                                                                                                                                            |
| `X-Goog-AuthUser`                                    | `0` (account index)                                                                                                                                                                  |
| `X-Goog-Visitor-Id`                                  | `ytcfg.get("VISITOR_DATA")`                                                                                                                                                          |
| `X-Youtube-Bootstrap-Logged-In`                      | `true`                                                                                                                                                                               |
| `X-Youtube-Client-Name` / `X-Youtube-Client-Version` | `1` / `ytcfg.get("INNERTUBE_CLIENT_VERSION")`                                                                                                                                        |

### Where the two per-commenter values come from

You do not need to click anything to get `profileCardContext`. YouTube already sends it with every comment. In the `/youtubei/v1/next` responses that load the comments, every commenter has an object like this (it appears at a few places per comment: the author's channel command, the author's profile endpoint, and the avatar):

```
frameworkUpdates.entityBatchUpdate.mutations[].payload.commentEntityPayload.author
    .channelCommand.innertubeCommand.profileCardCommand = {
        profileOwnerExternalChannelId, profileCardContext, shouldUseProfileBottomSheet
    }
```

De-duplicate by channel ID. Treat each token as belonging to the comment/video it came with; profile card statistics are for the video's channel ("On this channel").

### Response

Checked against real responses from two different videos (paths relative to `profileCard.profileCardViewModel`):

| Data            | Path                                                                                                                           | Notes                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Display name    | `profileIdentityInfo.profileIdentityInfoViewModel.channelDisplayName`                                                          |                                                                                                                     |
| Handle          | `...profileIdentityInfoViewModel.channelHandle`                                                                                | e.g. `@name`                                                                                                        |
| Join date       | `...profileIdentityInfoViewModel.leftOfBulletInfo`                                                                             | `Joined 9 years ago`                                                                                                |
| Subscribers     | `...profileIdentityInfoViewModel.rightOfBulletInfo`                                                                            | `28 subscribers`, `No subscribers`                                                                                  |
| Avatar          | `...profileIdentityInfoViewModel.avatar.avatarViewModel.image.sources[]`                                                       | 48/88/176 px                                                                                                        |
| Comment count   | `profileInfo.profileInfoViewModel.profileBadgeInfoChannelWide.commentBadge.commentDesc`                                        | always present                                                                                                      |
| Hearts received | `...commentBadge.blackHeartDesc`                                                                                               | e.g. `16 received`. Only present for commenters who have hearts; it was absent in the first 25 responses I checked. |
| Badges          | `...profileBadgeInfoChannelWide.badges[]` (`badgeDesc`, `badgeSubtitle`, `badgeIconUrl`)                                       | only some commenters                                                                                                |
| Recent comments | `profileInfo.profileInfoViewModel.comments[].commentInteractionViewModel` (`videoTitle`, `commentContent`)                     | label in `commentsInteractionTitle`                                                                                 |
| Subscriptions   | `profileInfo.profileInfoViewModel.sharedSubscriptions[].sharedSubscriptionViewModel` (`channelName`, `avatar...sources[].url`) | label in `sharedSubscriptionsTitle`                                                                                 |
| Pronouns        | `profileIdentityInfo.profileIdentityInfoViewModel.channelPronouns`                                                             | e.g. `he/him`. Optional: only present when the commenter has set pronouns.                                          |

The whole card also appears a second time under `popupCommand.commandExecutorCommand...`; read only the `profileCard` branch.

---

## What is this [add-on](https://addons.mozilla.org/firefox/addon/wip-yt-profile-card-info)?
This is a browser extension designed to make [Profile Cards](https://support.google.com/youtube/answer/9409333) useful by extracting data from it and displaying that data below YouTube comments' handles as info boxes.

## What does this add-on do?
It reads the profile card tokens YouTube already sends with the comments, requests each commenter's Profile Card from Innertube, and displays the result as info boxes beneath the commenter's handle.

The displayed information is six data types:
- `total comments` the commenter has posted in all videos of a content creator's YouTube channel
- number of `hearts received` from said content creator
- `pronouns` next to handle
- any special `badges` associated with the commenter
- `recent comments` on a channel
- `subscriptions`

## What is the technical implementation of this add-on?
Two scripts, one in each JavaScript world:
- **`page-bridge.js`** runs in YouTube's own page context (`"world": "MAIN"`, `run_at: document_start`). It wraps `window.fetch` to read `/youtubei/v1/next` responses and collect the `profileOwnerExternalChannelId` / `profileCardContext` pairs. On request it calls `get_profile_card` with a fresh `SAPISIDHASH`, so the real cookies, origin and visitor data are used.
- **`content.js`** runs in the extension's isolated world. It asks the bridge for cards through `window.postMessage`, one request at a time with a 2.5 to 4 second delay, turns each response into the info boxes, and places them under the matching comment. A comment is matched by the `/@handle` or `/channel/UC...` link of its author name, not by its displayed text. Mutation observers and a periodic sweep cover comments that load while scrolling, sorting, or opening replies.

No extra permissions are needed: all requests are same-origin from the page. Nothing is sent anywhere else, and the add-on stores no data.

If three requests in a row fail, the add-on stops requesting for that page load (`MAX_FAILURES`), and it never makes more than `MAX_REQUESTS` requests per page load. Both are constants at the top of `content.js`, as is `DEBUG` (set it to `true` to log what the add-on is doing to the console).

## What are the known limitations of this add-on?
- Innertube can change at any time, though in practice it rarely happens, if not ever. It's a nothing burger really.
- Cards are fetched in the order comments load, not only for comments you are looking at. The more comments YouTube loads, the more requests are made (slowly, one at a time).
- **Does not work when you're logged out!**
- Content scripts are only injected on page load. If you reach a video by clicking from the YouTube home page, you may need to reload it once. (Widening `matches` in `manifest.json` to `https://www.youtube.com/*` avoids that.) **THIS FEATURE IS INTENTIONAL BECAUSE THIS ADD-ON'S NAME IS WIP**

## Reproducing the research
1. Start a normal Chrome with `--remote-debugging-port=9222 --user-data-dir=<new folder>` and sign in to YouTube manually. (Google blocks sign-in in browsers launched by Playwright.)
2. Attach with `chromium.connectOverCDP("http://localhost:9222")`.
3. Listen for requests to `/youtubei/v1/account/get_profile_card` and save `req.postDataBuffer()`. Use the buffer, not `postData()`.
4. Click a commenter's avatar. The body is JSON.
5. Search the `/youtubei/v1/next` comment responses for the `profileCardContext` value to find where the tokens come from.

## What is this add-on's purpose?
If you think about it, on most social media platforms, you click on other people's profile pictures. Duh! It's literally the "social" in "social media". Even though YouTube is technically one, it's primarily a video-sharing platform. Since when's the last time you click on a commenter's profile picture? That's why I created this add-on.
