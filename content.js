(() => {
  const HOST_ID = 'project-freedom-host';
  const DEFAULT_SETTINGS = {
    overlayEnabled: true,
    youtubeEnabled: true,
    opacity: 0.92,
    position: 'top-right',
    youtubeApiKey: '',
    width: 330,
    height: 440,
    posX: null,
    posY: null,
  };
  const settings = { ...DEFAULT_SETTINGS };
  const rendered = new Map();
  let host;
  let root;
  let panel;
  let feed;
  let menu;
  let menuTrigger;
  let videoId = '';
  let comments = [];
  let lastStatus = '';
  let dragging = false;

  if (window.top !== window) return;

  function readSettings() {
    chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
      if (chrome.runtime.lastError) {
        console.error('Project Freedom could not read settings.', chrome.runtime.lastError);
        return;
      }
      Object.assign(settings, stored);
      applySettings();
    });
  }

  function saveSettings(changes) {
    Object.assign(settings, changes);
    chrome.storage.local.set(changes, () => {
      if (chrome.runtime.lastError) {
        console.error('Project Freedom could not save settings.', chrome.runtime.lastError);
        return;
      }
      applySettings();
    });
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function buildOverlay() {
    if (document.getElementById(HOST_ID)) return;

    host = createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });

    const style = createElement('style');
    style.textContent = `
      :host {
        all: initial;
        /* dark palette (default): slate blue accent + umber warm accent */
        --c-panel: #1e2230;
        --c-header: #171a24;
        --c-surface: #272c3c;
        --c-border: #3a4056;
        --c-text: #e8eaf2;
        --c-text-muted: #aab0c4;
        --c-accent: #8e9bd4;       /* slate blue */
        --c-accent-warm: #cf9a6d;  /* umber */
        --c-grip: #7b84a0;
        --c-hover: #ffffff1a;
        --c-shadow: rgba(0, 0, 0, 0.5);
      }
      @media (prefers-color-scheme: light) {
        :host {
          /* light palette: warm umber-tinted paper + deep slate blue */
          --c-panel: #f6f3ee;
          --c-header: #ece5db;
          --c-surface: #efe8de;
          --c-border: #d7cec0;
          --c-text: #2a2c38;
          --c-text-muted: #6d6456;
          --c-accent: #4c5a93;       /* deep slate blue */
          --c-accent-warm: #8a5a30;  /* burnt umber */
          --c-grip: #9b9284;
          --c-hover: #0000000f;
          --c-shadow: rgba(60, 50, 40, 0.20);
        }
      }
      * { box-sizing: border-box; }
      .panel {
        position: fixed; z-index: 2147483646; top: 20px; right: 20px;
        display: flex; flex-direction: column; min-width: 260px; min-height: 220px;
        max-width: calc(100vw - 24px); max-height: 90vh; overflow: hidden;
        color: var(--c-text); background: var(--c-panel); border: 1px solid var(--c-border);
        border-radius: 12px; box-shadow: 0 8px 28px var(--c-shadow);
        font: 14px/1.4 system-ui, sans-serif;
      }
      .panel[hidden] { display: none; }
      .panel.bottom-right { top: auto; bottom: 20px; }
      .panel.bottom-left { top: auto; right: auto; bottom: 20px; left: 20px; }
      .resize-grip { position: absolute; z-index: 1; width: 18px; height: 18px;
        background: linear-gradient(135deg, transparent 45%, var(--c-grip) 46%, var(--c-grip) 53%,
          transparent 54%, transparent 67%, var(--c-grip) 68%, var(--c-grip) 75%, transparent 76%);
        touch-action: none; }
      .resize-grip:hover { background-color: var(--c-hover); }
      .resize-grip.top-left { top: 0; left: 0; cursor: nwse-resize; transform: rotate(180deg); }
      .resize-grip.top-right { top: 0; right: 0; cursor: nesw-resize; transform: rotate(90deg); }
      .resize-grip.bottom-left { bottom: 0; left: 0; cursor: nesw-resize; transform: rotate(-90deg); }
      .resize-grip.bottom-right { bottom: 0; right: 0; cursor: nwse-resize; }
      .header { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
        background: var(--c-header); border-radius: 12px 12px 0 0;
        cursor: move; touch-action: none; user-select: none; }
      .title { flex: 1; font-size: 14px; font-weight: 700; color: var(--c-accent); letter-spacing: 0.02em; }
      button, select, input { font: inherit; }
      button { color: inherit; cursor: pointer; }
      input[type="checkbox"], input[type="range"] { accent-color: var(--c-accent); }
      .icon-button { min-width: 32px; height: 32px; border: 1px solid var(--c-border);
        border-radius: 7px; background: transparent; color: var(--c-text); }
      .icon-button:hover { background: var(--c-hover); }
      .icon-button:hover, button:focus-visible, select:focus-visible, input:focus-visible {
        outline: 2px solid var(--c-accent); outline-offset: 2px;
      }
      .feed { flex: 1; overflow: auto; padding: 12px; }
      .status { color: var(--c-text-muted); }
      .comment { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
        background: var(--c-surface); border-left: 3px solid var(--c-accent); }
      .comment strong { color: var(--c-accent); }
      .timestamp { margin-left: 6px; color: var(--c-accent-warm); font-size: 11px; font-weight: 600; }
      .footer { padding: 8px 12px; color: var(--c-text-muted); font-size: 11px;
        border-top: 1px solid var(--c-border); }
      .menu { position: fixed; z-index: 2147483647; width: 250px; max-height: calc(100vh - 16px);
        overflow: auto; padding: 12px;
        color: var(--c-text); background: var(--c-header); border: 1px solid var(--c-border);
        border-radius: 10px; box-shadow: 0 8px 28px var(--c-shadow); }
      .menu[hidden] { display: none; }
      .menu h2 { margin: 0 0 10px; font-size: 14px; color: var(--c-accent); }
      .setting { display: flex; justify-content: space-between; align-items: center;
        gap: 10px; margin: 10px 0; }
      .setting input[type="range"] { width: 104px; }
      .setting select { max-width: 125px; color: var(--c-text); background: var(--c-surface);
        border: 1px solid var(--c-border); border-radius: 5px; padding: 4px; }
      .menu-note { margin: 10px 0 0; color: var(--c-text-muted); font-size: 11px; }
      .api-key-setting { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
      .api-key-setting input { width: 100%; padding: 6px; color: var(--c-text);
        background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 5px; }
      .menu-action { width: 100%; margin-top: 10px; padding: 7px;
        color: inherit; text-align: left; background: var(--c-surface);
        border: 1px solid var(--c-border); border-radius: 6px; }
      @media (max-width: 480px) {
        .panel { top: 12px; right: 12px; max-height: 85vh; }
        .panel.bottom-right { top: auto; bottom: 12px; }
        .panel.bottom-left { top: auto; right: auto; bottom: 12px; left: 12px; }
      }
    `;

    panel = createElement('section', 'panel');
    panel.setAttribute('aria-label', 'Carpenter synchronized comments');

    const header = createElement('header', 'header');
    header.appendChild(createElement('div', 'title', 'Carpenter'));
    const menuButton = createElement('button', 'icon-button', 'Settings');
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', 'Open overlay settings');
    menuButton.addEventListener('click', () => openMenu(menuButton));
    header.appendChild(menuButton);

    const closeButton = createElement('button', 'icon-button', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Turn off overlay');
    closeButton.addEventListener('click', () => saveSettings({ overlayEnabled: false }));
    header.appendChild(closeButton);

    header.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;
      event.preventDefault();
      dragging = true;
      const bounds = panel.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      try { header.setPointerCapture(event.pointerId); } catch {}
      const drag = (moveEvent) => {
        const maxX = Math.max(0, innerWidth - bounds.width);
        const maxY = Math.max(0, innerHeight - bounds.height);
        const x = Math.max(0, Math.min(moveEvent.clientX - offsetX, maxX));
        const y = Math.max(0, Math.min(moveEvent.clientY - offsetY, maxY));
        placePanelAt(x, y);
      };
      const finishDrag = () => {
        dragging = false;
        header.removeEventListener('pointermove', drag);
        const moved = panel.getBoundingClientRect();
        saveSettings({ posX: Math.round(moved.left), posY: Math.round(moved.top) });
      };
      header.addEventListener('pointermove', drag);
      header.addEventListener('pointerup', finishDrag, { once: true });
      header.addEventListener('pointercancel', finishDrag, { once: true });
    });

    feed = createElement('div', 'feed');
    feed.setAttribute('aria-live', 'polite');
    feed.setAttribute('aria-relevant', 'additions text');
    feed.addEventListener('contextmenu', (event) => {
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      openMenu(null, event.clientX, event.clientY);
    });

    const footer = createElement('footer', 'footer', 'Loads up to 200 timestamped comments through the YouTube Data API. Drag the header to move, the opposite corner to resize.');
    const resizeGrip = createElement('div', 'resize-grip');
    resizeGrip.setAttribute('role', 'separator');
    resizeGrip.setAttribute('aria-label', 'Resize overlay from the corner opposite its position');
    resizeGrip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const bounds = panel.getBoundingClientRect();
      const hasCustomPos = Number.isFinite(settings.posX) && Number.isFinite(settings.posY);
      const gripPosition = hasCustomPos
        ? 'bottom-right'
        : settings.position === 'bottom-right'
          ? 'top-left'
          : settings.position === 'bottom-left'
            ? 'top-right'
            : 'bottom-left';
      const growsLeft = gripPosition.includes('left');
      const growsUp = gripPosition.includes('top');

      resizeGrip.setPointerCapture(event.pointerId);
      const resize = (moveEvent) => {
        const widthDelta = growsLeft ? event.clientX - moveEvent.clientX : moveEvent.clientX - event.clientX;
        const heightDelta = growsUp ? event.clientY - moveEvent.clientY : moveEvent.clientY - event.clientY;
        const width = Math.max(260, Math.min(bounds.width + widthDelta, innerWidth - 24));
        const height = Math.max(220, Math.min(bounds.height + heightDelta, innerHeight * 0.7));
        panel.style.width = `${Math.round(width)}px`;
        panel.style.height = `${Math.round(height)}px`;
      };
      const finishResize = () => {
        resizeGrip.removeEventListener('pointermove', resize);
        resizeGrip.removeEventListener('pointerup', finishResize);
        resizeGrip.removeEventListener('pointercancel', finishResize);
        const resizedBounds = panel.getBoundingClientRect();
        saveSettings({
          width: Math.round(resizedBounds.width),
          height: Math.round(resizedBounds.height),
        });
      };

      resizeGrip.addEventListener('pointermove', resize);
      resizeGrip.addEventListener('pointerup', finishResize, { once: true });
      resizeGrip.addEventListener('pointercancel', finishResize, { once: true });
    });
    panel.append(header, feed, footer, resizeGrip);

    menu = buildMenu();
    root.append(style, panel, menu);
    document.documentElement.appendChild(host);
    document.addEventListener('pointerdown', (event) => {
      if (!menu.hidden && !event.composedPath().includes(menu)) closeMenu(false);
    }, true);
    applySettings();
    showStatus('Waiting for a YouTube video…');
  }

  function buildMenu() {
    const settingsMenu = createElement('div', 'menu');
    settingsMenu.hidden = true;
    settingsMenu.setAttribute('role', 'dialog');
    settingsMenu.setAttribute('aria-label', 'Overlay settings');

    const heading = createElement('h2', '', 'Overlay settings');
    settingsMenu.appendChild(heading);

    settingsMenu.appendChild(buildCheckboxSetting(
      'overlayEnabled',
      'Overlay on',
      'Turn the overlay on or off',
    ));
    settingsMenu.appendChild(buildCheckboxSetting(
      'youtubeEnabled',
      'Enable on YouTube',
      'Enable Project Freedom on YouTube',
    ));

    const apiKeyLabel = createElement('label', 'api-key-setting');
    apiKeyLabel.appendChild(createElement('span', '', 'YouTube Data API key'));
    const apiKeyInput = createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.autocomplete = 'off';
    apiKeyInput.setAttribute('aria-label', 'YouTube Data API key');
    apiKeyInput.addEventListener('change', () => {
      saveSettings({ youtubeApiKey: apiKeyInput.value.trim() });
    });
    apiKeyLabel.appendChild(apiKeyInput);
    settingsMenu.appendChild(apiKeyLabel);

    const opacityLabel = createElement('label', 'setting');
    opacityLabel.appendChild(createElement('span', '', 'Opacity'));
    const opacityInput = createElement('input');
    opacityInput.type = 'range';
    opacityInput.min = '0.45';
    opacityInput.max = '1';
    opacityInput.step = '0.05';
    opacityInput.setAttribute('aria-label', 'Overlay opacity');
    opacityInput.addEventListener('input', () => {
      saveSettings({ opacity: Number(opacityInput.value) });
    });
    opacityLabel.appendChild(opacityInput);
    settingsMenu.appendChild(opacityLabel);

    const positionLabel = createElement('label', 'setting');
    positionLabel.appendChild(createElement('span', '', 'Position'));
    const positionSelect = createElement('select');
    positionSelect.setAttribute('aria-label', 'Overlay position');
    for (const [value, label] of [
      ['top-right', 'Top right'],
      ['bottom-right', 'Bottom right'],
      ['bottom-left', 'Bottom left'],
    ]) {
      const option = createElement('option', '', label);
      option.value = value;
      positionSelect.appendChild(option);
    }
    positionSelect.addEventListener('change', () => {
      saveSettings({ position: positionSelect.value, posX: null, posY: null });
    });
    positionLabel.appendChild(positionSelect);
    settingsMenu.appendChild(positionLabel);

    const note = createElement('p', 'menu-note', 'Create a key in Google Cloud and enable YouTube Data API v3. This prototype stores the key locally, but it is not secret in a browser extension. Restrict it to the YouTube Data API. Right-click the comments area or use Alt+Shift+M to open this menu.');
    settingsMenu.appendChild(note);

    const closeMenuButton = createElement('button', 'menu-action', 'Close settings');
    closeMenuButton.type = 'button';
    closeMenuButton.addEventListener('click', closeMenu);
    settingsMenu.appendChild(closeMenuButton);

    settingsMenu._controls = { opacityInput, positionSelect, apiKeyInput };
    settingsMenu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    });
    return settingsMenu;
  }

  function buildCheckboxSetting(key, labelText, accessibleLabel) {
    const label = createElement('label', 'setting');
    label.appendChild(createElement('span', '', labelText));
    const input = createElement('input');
    input.type = 'checkbox';
    input.setAttribute('aria-label', accessibleLabel);
    input.addEventListener('change', () => saveSettings({ [key]: input.checked }));
    label.appendChild(input);
    label._control = input;
    label._settingKey = key;
    return label;
  }

  function placePanelAt(x, y) {
    if (!panel) return;
    panel.classList.remove('bottom-right', 'bottom-left');
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }

  function applySettings() {
    if (!panel || !menu) return;

    const visible = Boolean(settings.overlayEnabled && settings.youtubeEnabled && isWatchPage());
    panel.hidden = !visible;
    const hasCustomPos = Number.isFinite(settings.posX) && Number.isFinite(settings.posY);
    if (!dragging) {
      if (hasCustomPos) {
        panel.classList.remove('bottom-right', 'bottom-left');
        const w = panel.offsetWidth || Number(settings.width) || 330;
        const h = panel.offsetHeight || Number(settings.height) || 440;
        const x = Math.max(0, Math.min(settings.posX, Math.max(0, innerWidth - w)));
        const y = Math.max(0, Math.min(settings.posY, Math.max(0, innerHeight - h)));
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      } else {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.classList.toggle('bottom-right', settings.position === 'bottom-right');
        panel.classList.toggle('bottom-left', settings.position === 'bottom-left');
      }
    }
    const gripPosition = hasCustomPos
      ? 'bottom-right'
      : settings.position === 'bottom-right'
        ? 'top-left'
        : settings.position === 'bottom-left'
          ? 'top-right'
          : 'bottom-left';
    const resizeGrip = panel.querySelector('.resize-grip');
    resizeGrip.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
    resizeGrip.classList.add(gripPosition);
    panel.style.opacity = String(settings.opacity);
    panel.style.width = `min(${settings.width}px, calc(100vw - 24px))`;
    panel.style.height = `min(${settings.height}px, 70vh)`;
    for (const label of menu.querySelectorAll('.setting')) {
      if (label._control && label._settingKey) {
        label._control.checked = Boolean(settings[label._settingKey]);
      }
    }
    menu._controls.opacityInput.value = String(settings.opacity);
    menu._controls.positionSelect.value = settings.position;
    if (root.activeElement !== menu._controls.apiKeyInput) {
      menu._controls.apiKeyInput.value = settings.youtubeApiKey || '';
    }

    if (!visible) closeMenu(false);
    if (lastStatus === 'Waiting for a YouTube video…' && isWatchPage()) {
      showStatus('Comments load automatically for this video.');
    }
  }

  function isWatchPage() {
    return location.pathname === '/watch' && Boolean(new URLSearchParams(location.search).get('v'));
  }

  function openMenu(trigger, x, y) {
    if (!menu || panel.hidden) return;
    menuTrigger = trigger || null;
    menu.hidden = false;
    const bounds = menu.getBoundingClientRect();
    const left = x ?? Math.max(12, innerWidth - bounds.width - 24);
    const top = y ?? Math.max(12, innerHeight - bounds.height - 24);
    menu.style.left = `${Math.max(8, Math.min(left, innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
    const firstFocusable = menu.querySelector('input, select, button');
    firstFocusable?.focus();
  }

  function closeMenu(returnFocus = true) {
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    if (returnFocus) (menuTrigger || root.querySelector('.header button'))?.focus();
    menuTrigger = null;
  }

  function showStatus(text) {
    if (!feed) return;
    if (feed.querySelector('.comment')) {
      lastStatus = text;
      return;
    }
    feed.replaceChildren(createElement('p', 'status', text));
    lastStatus = text;
  }

  function clearForVideo(id) {
    videoId = id;
    comments = [];
    rendered.clear();
    feed.replaceChildren();
    showStatus('Loading comments from YouTube…');
    requestComments(id);
  }

  // Visible comments are a pure function of the playhead: a comment is shown
  // only once playback has reached its timestamp, and scrubbing backward past a
  // timestamp removes that comment so it re-appears when the video plays forward
  // again.
  function syncCommentsToTime(currentTime) {
    let removedAny = false;
    for (const [key, el] of rendered) {
      if (Number(el.dataset.time) > currentTime) {
        el.remove();
        rendered.delete(key);
        removedAny = true;
      }
    }
    const toAdd = comments
      .filter((comment) => comment.time <= currentTime && !rendered.has(comment.key))
      .sort((left, right) => left.time - right.time);
    toAdd.forEach(renderComment);
    if (removedAny && rendered.size === 0 && lastStatus) {
      showStatus(lastStatus);
    }
  }

  function parseTimestamp(text) {
    const match = text.match(/(?:^|\s)(?:(\d{1,2}):)?(\d{1,2}):([0-5]\d)(?=$|[\s.,!?])/);
    if (!match) return null;
    const hours = Number(match[1] || 0);
    const minutes = Number(match[2]);
    const seconds = Number(match[3]);
    if (minutes > 59 && match[1]) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  function requestComments(id) {
    chrome.runtime.sendMessage({ type: 'FETCH_VIDEO_COMMENTS', videoId: id }, (response) => {
      if (id !== videoId) return;
      if (chrome.runtime.lastError) {
        showStatus('Could not contact the extension service worker. Reload the extension and try again.');
        return;
      }
      if (!response?.ok) {
        showStatus(response?.message || 'YouTube comments could not be loaded.');
        return;
      }

      const fetchedComments = Array.isArray(response.comments) ? response.comments : [];
      const diagnostics = response.diagnostics || {};
      comments = fetchedComments
        .map((comment, index) => ({
          key: `${id}:${index}`,
          time: parseTimestamp(comment.text),
          author: comment.author,
          text: comment.text,
        }))
        .filter((comment) => comment.time !== null);
      const threadCount = Number.isInteger(diagnostics.topLevelThreadCount)
        ? diagnostics.topLevelThreadCount
        : fetchedComments.length;
      const pageCount = Number.isInteger(diagnostics.pagesRetrieved)
        ? diagnostics.pagesRetrieved
        : 0;
      const resultSummary = diagnostics.hasMorePages
        ? 'More top-level pages are available.'
        : 'The API returned no further top-level page token.';
      const replySummary = Number.isInteger(diagnostics.totalReplyCount)
        ? ` ${diagnostics.totalReplyCount} replies are available but not loaded yet.`
        : '';
      const timestampSummary = comments.length
        ? ` Found ${comments.length}${comments.length >= diagnostics.timestampedCommentLimit ? ' (limit reached)' : ''} timestamped comments.`
        : ' No timestamped comments found.';
      const warning = response.message ? ` Partial results: ${response.message}` : '';
      showStatus(
        `Fetched ${threadCount} top-level threads over ${pageCount} API page(s). ${resultSummary}${replySummary}${timestampSummary}${warning}`,
      );
    });
  }

  function getCurrentVideoId() {
    return new URLSearchParams(location.search).get('v') || '';
  }

  function tick() {
    const currentId = isWatchPage() ? getCurrentVideoId() : '';
    if (currentId !== videoId) {
      if (currentId) {
        clearForVideo(currentId);
      } else {
        videoId = '';
        comments = [];
        rendered.clear();
        feed.replaceChildren();
        showStatus('Open a YouTube video to see synchronized comments.');
      }
    }

    applySettings();
    if (!isWatchPage() || !settings.overlayEnabled || !settings.youtubeEnabled) return;

    const video = document.querySelector('video');
    if (!video) return;

    syncCommentsToTime(Math.floor(video.currentTime));
  }

  function renderComment(comment) {
    if (rendered.has(comment.key)) return;

    const status = feed.querySelector('.status');
    if (status) status.remove();

    const item = createElement('article', 'comment');
    item.dataset.time = String(comment.time);
    const author = createElement('strong', '', comment.author);
    const timestamp = createElement('span', 'timestamp', `[${formatTime(comment.time)}]`);
    const text = createElement('div', '', comment.text);
    item.append(author, timestamp, text);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
    rendered.set(comment.key, item);
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === 'OPEN_MENU') openMenu(null);
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }
    applySettings();
    if (changes.youtubeApiKey && videoId) {
      comments = [];
      rendered.clear();
      feed.replaceChildren();
      showStatus('Loading comments from YouTube…');
      requestComments(videoId);
    }
  });

  buildOverlay();
  readSettings();
  window.setInterval(tick, 500);
  document.addEventListener('yt-navigate-finish', tick);
})();
