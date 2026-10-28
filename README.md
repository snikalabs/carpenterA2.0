                                                                                                                                               # Project Freedom beta

An early Chrome Manifest V3 extension prototype for showing timestamped YouTube comments during playback.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this folder.
4. Create a Google Cloud project, [enable YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com), and create an API key.
5. Open overlay settings and enter the API key. Open a YouTube video; comments are requested as soon as the video ID is available, without scrolling the page.
6. Use the extension toolbar button to turn the overlay on or off.
7. Open overlay settings with the gear button, right-click in the comments area, or press **Alt+Shift+M**. Chrome lets users change the suggested shortcut at `chrome://extensions/shortcuts`.
8. Resize the overlay by dragging the corner opposite its selected position. Its size is saved locally.
9. Choose **Top right**, **Bottom right**, or **Bottom left** in overlay settings. New installs open at the top right by default.

## Beta scope and limitations

- Comment requests go directly from the extension service worker to the official YouTube Data API [`commentThreads.list`](https://developers.google.com/youtube/v3/docs/commentThreads/list) endpoint. The extension does not scrape YouTube's rendered comments or force-scroll the page.
- The API key is stored in `chrome.storage.local` and used for read-only requests for up to 200 timestamped top-level comments per video. It paginates through top-level threads until it reaches that timestamped-comment limit or the API has no more pages. Restrict the key to YouTube Data API v3 in Google Cloud. A key shipped in or entered into a browser extension is not secret; use a backend proxy before distributing a product.
- API results are subject to YouTube API availability and quota. The overlay reports how many top-level threads/pages the API returned and how many replies are available but not loaded. Comments may be disabled, unavailable, or omitted; this beta only syncs comments containing a recognizable video timestamp (for example, `2:14`).
- Review the [YouTube API Services Developer Policies](https://developers.google.com/youtube/terms/developer-policies) before distributing a product.
- It does not yet infer a timestamp from a comment's meaning, fetch captions/transcripts for alignment, call an AI model, or provide creator tools.
- Settings, including the API key, are stored locally with `chrome.storage.local`.

## Next beta milestones

1. Test comment parsing and playback behavior across several public videos.
2. Move API requests behind a backend before product distribution, and decide on a compliant transcript source before adding semantic matching.
3. Build and evaluate contextual alignment against a small, manually reviewed sample.
4. Add automated tests and package/store readiness checks before a public release.
