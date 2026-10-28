const DEFAULT_SETTINGS = {
  overlayEnabled: true,
  youtubeEnabled: true,
  opacity: 0.92,
  position: 'top-right',
  youtubeApiKey: '',
};
const MAX_TIMESTAMPED_COMMENTS_PER_VIDEO = 200;
const COMMENTS_PER_PAGE = 100;

function hasTimestamp(text) {
  const match = text.match(/(?:^|\s)(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)(?=$|[\s.,!?])/);
  if (!match) return false;
  return !(match[1] && Number(match[2]) > 59);
}

function getSettings() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(settings);
    });
  });
}

function setSettings(settings) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(settings, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  getSettings()
    .then((settings) => setSettings({ ...DEFAULT_SETTINGS, ...settings }))
    .catch((error) => console.error('Project Freedom could not initialize settings.', error));
});

chrome.action.onClicked.addListener(() => {
  getSettings()
    .then((settings) => setSettings({ overlayEnabled: !settings.overlayEnabled }))
    .catch((error) => console.error('Project Freedom could not toggle the overlay.', error));
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'open-chat-menu') return;

  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error('Project Freedom could not find the active tab.', chrome.runtime.lastError);
      return;
    }

    const activeTab = tabs[0];
    if (!activeTab || activeTab.id === undefined) return;

    chrome.tabs.sendMessage(activeTab.id, { type: 'OPEN_MENU' }, () => {
      if (chrome.runtime.lastError) {
        console.warn('Project Freedom menu is only available on a supported YouTube page.');
      }
    });
  });
});

async function fetchVideoComments(videoId) {
  const settings = await getSettings();
  const apiKey = settings.youtubeApiKey?.trim();
  if (!apiKey) {
    return {
      ok: false,
      message: 'Add a YouTube Data API key in overlay settings to load comments.',
    };
  }

  const comments = [];
  let fetchedThreadCount = 0;
  let pagesRetrieved = 0;
  let totalReplyCount = 0;
  let reportedTotalResults;
  let pageToken = '';
  while (comments.length < MAX_TIMESTAMPED_COMMENTS_PER_VIDEO) {
    const params = new URLSearchParams({
      key: apiKey,
      part: 'snippet',
      videoId,
      maxResults: String(COMMENTS_PER_PAGE),
      order: 'time',
      textFormat: 'plainText',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const response = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`);
    if (!response.ok) {
      const responseText = await response.text();
      let apiError;
      try {
        apiError = JSON.parse(responseText).error;
      } catch {
        apiError = null;
      }
      const reason = apiError?.errors?.[0]?.reason;
      const detail = [reason, apiError?.message]
        .filter(Boolean)
        .join(': ')
        .slice(0, 300);
      const message = response.status === 403
        ? `YouTube denied API page ${pagesRetrieved + 1}. Check the key, API enablement, quota, and comment availability.${detail ? ` ${detail}` : ''}`
        : `YouTube API page ${pagesRetrieved + 1} failed (HTTP ${response.status}).${detail ? ` ${detail}` : ''}`;
      return {
        ok: comments.length > 0,
        comments,
        message,
        diagnostics: {
          topLevelThreadCount: fetchedThreadCount,
          pagesRetrieved,
          hasMorePages: true,
          reportedTotalResults,
          totalReplyCount,
          timestampedCommentCount: comments.length,
          timestampedCommentLimit: MAX_TIMESTAMPED_COMMENTS_PER_VIDEO,
        },
      };
    }

    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    pagesRetrieved += 1;
    if (Number.isInteger(data.pageInfo?.totalResults)) {
      reportedTotalResults = data.pageInfo.totalResults;
    }
    fetchedThreadCount += items.length;
    for (const thread of items) {
      const threadSnippet = thread.snippet;
      totalReplyCount += Number.isInteger(threadSnippet?.totalReplyCount)
        ? threadSnippet.totalReplyCount
        : 0;
      const snippet = threadSnippet?.topLevelComment?.snippet;
      if (!snippet || typeof snippet.textDisplay !== 'string') continue;
      if (!hasTimestamp(snippet.textDisplay)) continue;
      comments.push({
        author: snippet.authorDisplayName || 'YouTube viewer',
        text: snippet.textDisplay,
      });
      if (comments.length >= MAX_TIMESTAMPED_COMMENTS_PER_VIDEO) break;
    }

    pageToken = data.nextPageToken || '';
    if (!pageToken || items.length === 0) break;
  }

  return {
    ok: true,
    comments,
    diagnostics: {
      topLevelThreadCount: fetchedThreadCount,
      pagesRetrieved,
      hasMorePages: Boolean(pageToken),
      reportedTotalResults,
      totalReplyCount,
      timestampedCommentCount: comments.length,
      timestampedCommentLimit: MAX_TIMESTAMPED_COMMENTS_PER_VIDEO,
    },
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'FETCH_VIDEO_COMMENTS' || sender.id !== chrome.runtime.id) return;
  if (typeof message.videoId !== 'string' || !message.videoId) {
    sendResponse({ ok: false, message: 'The video ID is missing.' });
    return;
  }

  fetchVideoComments(message.videoId)
    .then(sendResponse)
    .catch((error) => {
      console.error('Project Freedom could not load YouTube comments.', error);
      sendResponse({ ok: false, message: 'A network error prevented comments from loading.' });
    });
  return true;
});
