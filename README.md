Shows information as boxes about a commenter under (or next to) their name on YouTube, in up to seven columns:

| Column | Shows                                         | Comes from                    |
| ------ | --------------------------------------------- | ----------------------------- |
| 1      | subscribers, location, join date              | the commenter's channel pages |
| 2      | videos, views, playlists                      | the commenter's channel pages |
| 3      | latest video, latest short, latest livestream | the commenter's channel pages |
| 4      | description, external links, business email   | the commenter's channel pages |
| 5      | comments, hearts received, pronouns           | YouTube's profile card        |
| 6      | badges                                        | YouTube's profile card        |
| 7      | recent comments, subscriptions                | YouTube's profile card        |

Every box has a checkbox in `about:addons`. **Columns 5 to 7 only work while you are signed in to YouTube.**

## How the code is organized

```
manifest.json               which files run where, and in which order
settings.js                 every setting, defined once (the options page is generated from it)
messages.js                 the words the two halves of the add-on use to talk to each other
youtubei.js                 runs inside YouTube's own page; makes the profile card requests
content/
  ui.js                     boxes, columns, popups, tooltips (no knowledge of channels or cards)
  channel-data.js           downloads a channel's pages and reads them with regular expressions
  channel-columns.js        columns 1-4: turns that data into boxes
  profile-card-data.js      asks youtubei.js for profile cards, one at a time, and parses them
  profile-card-columns.js   columns 5-7: turns a profile card into boxes
  comments.js               the entry point: watches the comment section, builds each container
options/                    the options page
styles.css                  the few styles that cannot be inline
```

### Two JavaScript worlds

Add-on runs in two separate worlds:

- **Content scripts** (everything in `content/`) draw the boxes. They can see the page's HTML, but not YouTube's JavaScript.
- **`youtubei.js`** (`"world": "MAIN"` in the manifest) runs inside YouTube's own page. Only there can we read the comment data YouTube downloads and make requests with the page's own cookies.

They talk through `window.postMessage`, using the names in `messages.js` (it is loaded in both worlds, so they can't disagree):

```
content/profile-card-data.js                         youtubei.js
        |                                                  |
        |  <---- CARDS_AVAILABLE  (commenters it has seen) |  reads YouTube's comment responses
        |  ----> ASK_FOR_CARD {channelId} ---------------> |
        |  <---- CARD_RESULT {channelId, ok, card} ------- |  POST /youtubei/v1/account/get_profile_card
```

### What happens for one comment

1. `comments.js` sees a comment appear (YouTube is a single-page app, so it watches the page for changes).
2. `ChannelData` downloads the commenter's channel pages and `ChannelColumns.build()` builds columns 1-4 (off-screen, then they are swapped in).
3. `ProfileCardColumns.attach()` waits for the commenter's profile card. `ProfileCards` requests cards slowly (one every 2.5-4 seconds) and stops after 3 failures in a row. When the card arrives, columns 5-7 are added.

If every profile card checkbox is off, no profile card request is ever made.

### Coping with YouTube's single-page app

YouTube never reloads the page when you click around, and it reuses and re-renders elements. Everything in `comments.js` is written with that in mind:

- **Injected on every `www.youtube.com` page**, not just video pages (see `manifest.json`). Otherwise a video opened from the home page would get no scripts until you reload.
- **Only the newest run for a comment may finish.** Loading a commenter takes seconds, so after every `await` a run checks that it is still the newest one _and_ that the comment still belongs to the same commenter; if not, it stops (or starts over for the new commenter). This prevents containers that mix two commenters, and duplicate containers.
- **Columns are built off-screen and swapped in**, so a slow, outdated result can never end up half-mixed into a newer one.
- **A container YouTube removes is put back** (`restoreRemovedContainers`), from memory, with no new requests.
- A page without `<ytd-app>` (for example an embedded player) is ignored, and a channel page that can't be downloaded doesn't stop columns 5-7.
