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
  };
  const settings = { ...DEFAULT_SETTINGS };
  const emittedComments = new Set();
  let host;
  let root;
  let panel;
  let feed;
  let menu;
  let menuTrigger;
  let lastTime = null;
  let videoId = '';
  let comments = [];
  let lastStatus = '';

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
      :host { all: initial; }
      * { box-sizing: border-box; }
      .panel {
        position: fixed; z-index: 2147483646; top: 20px; right: 20px;
        display: flex; flex-direction: column; min-width: 260px; min-height: 220px;
        max-width: calc(100vw - 24px); max-height: 90vh; overflow: hidden;
        color: #f4f6f8; background: #17212b; border: 1px solid #42515f;
        border-radius: 12px; box-shadow: 0 8px 28px #0008;
        font: 14px/1.4 system-ui, sans-serif;
      }
      .panel[hidden] { display: none; }
      .panel.bottom-right { top: auto; bottom: 20px; }
      .panel.bottom-left { top: auto; right: auto; bottom: 20px; left: 20px; }
      .resize-grip { position: absolute; z-index: 1; width: 18px; height: 18px;
        background: linear-gradient(135deg, transparent 45%, #8a9aa8 46%, #8a9aa8 53%,
          transparent 54%, transparent 67%, #8a9aa8 68%, #8a9aa8 75%, transparent 76%);
        touch-action: none; }
      .resize-grip:hover { background-color: #ffffff12; }
      .resize-grip.top-left { top: 0; left: 0; cursor: nwse-resize; transform: rotate(180deg); }
      .resize-grip.top-right { top: 0; right: 0; cursor: nesw-resize; transform: rotate(90deg); }
      .resize-grip.bottom-left { bottom: 0; left: 0; cursor: nesw-resize; transform: rotate(-90deg); }
      .header { display: flex; align-items: center; gap: 8px; padding: 10px 12px;
        background: #101820; border-radius: 12px 12px 0 0; }
      .title { flex: 1; font-size: 14px; font-weight: 700; }
      button, select, input { font: inherit; }
      button { color: inherit; cursor: pointer; }
      .icon-button { min-width: 32px; height: 32px; border: 1px solid #536270;
        border-radius: 7px; background: transparent; }
      .icon-button:hover, button:focus-visible, select:focus-visible, input:focus-visible {
        outline: 2px solid #55c6b1; outline-offset: 2px;
      }
      .feed { flex: 1; overflow: auto; padding: 12px; }
      .status { color: #c3ccd4; }
      .comment { margin: 0 0 10px; padding: 8px; border-radius: 8px; background: #24323e; }
      .comment strong { color: #80d5c6; }
      .timestamp { margin-left: 6px; color: #ffc66d; font-size: 11px; }
      .footer { padding: 8px 12px; color: #bbc6cf; font-size: 11px;
        border-top: 1px solid #354451; }
      .menu { position: fixed; z-index: 2147483647; width: 250px; max-height: calc(100vh - 16px);
        overflow: auto; padding: 12px;
        color: #f4f6f8; background: #101820; border: 1px solid #536270;
        border-radius: 10px; box-shadow: 0 8px 28px #0009; }
      .menu[hidden] { display: none; }
      .menu h2 { margin: 0 0 10px; font-size: 14px; }
      .setting { display: flex; justify-content: space-between; align-items: center;
        gap: 10px; margin: 10px 0; }
      .setting input[type="range"] { width: 104px; }
      .setting select { max-width: 125px; color: #f4f6f8; background: #24323e;
        border: 1px solid #536270; border-radius: 5px; padding: 4px; }
      .menu-note { margin: 10px 0 0; color: #bdc8d1; font-size: 11px; }
      .api-key-setting { display: flex; flex-direction: column; gap: 6px; margin: 10px 0; }
      .api-key-setting input { width: 100%; padding: 6px; color: #f4f6f8;
        background: #24323e; border: 1px solid #536270; border-radius: 5px; }
      .menu-action { width: 100%; margin-top: 10px; padding: 7px;
        color: inherit; text-align: left; background: #24323e;
        border: 1px solid #536270; border-radius: 6px; }
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

    feed = createElement('div', 'feed');
    feed.setAttribute('aria-live', 'polite');
    feed.setAttribute('aria-relevant', 'additions text');
    feed.addEventListener('contextmenu', (event) => {
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      openMenu(null, event.clientX, event.clientY);
    });

    const footer = createElement('footer', 'footer', 'Loads up to 200 timestamped comments through the YouTube Data API. Drag the opposite corner to resize.');
    const resizeGrip = createElement('div', 'resize-grip');
    resizeGrip.setAttribute('role', 'separator');
    resizeGrip.setAttribute('aria-label', 'Resize overlay from the corner opposite its position');
    resizeGrip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const bounds = panel.getBoundingClientRect();
      const gripPosition = settings.position === 'bottom-right'
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
      saveSettings({ position: positionSelect.value });
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

  function applySettings() {
    if (!panel || !menu) return;

    const visible = Boolean(settings.overlayEnabled && settings.youtubeEnabled && isWatchPage());
    panel.hidden = !visible;
    panel.classList.toggle('bottom-right', settings.position === 'bottom-right');
    panel.classList.toggle('bottom-left', settings.position === 'bottom-left');
    const gripPosition = settings.position === 'bottom-right'
      ? 'top-left'
      : settings.position === 'bottom-left'
        ? 'top-right'
        : 'bottom-left';
    const resizeGrip = panel.querySelector('.resize-grip');
    resizeGrip.classList.remove('top-left', 'top-right', 'bottom-left');
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
    emittedComments.clear();
    lastTime = null;
    feed.replaceChildren();
    showStatus('Loading comments from YouTube…');
    requestComments(id);
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
        emittedComments.clear();
        lastTime = null;
        feed.replaceChildren();
        showStatus('Open a YouTube video to see synchronized comments.');
      }
    }

    applySettings();
    if (!isWatchPage() || !settings.overlayEnabled || !settings.youtubeEnabled) return;

    const video = document.querySelector('video');
    if (!video) return;

    const currentTime = Math.floor(video.currentTime);
    if (lastTime === null) {
      lastTime = currentTime - 1;
    }
    if (currentTime < lastTime) {
      lastTime = currentTime;
      return;
    }

    if (currentTime > lastTime) {
      const matching = comments
        .filter((comment) => comment.time > lastTime && comment.time <= currentTime)
        .sort((left, right) => left.time - right.time);
      matching.forEach(renderComment);
      lastTime = currentTime;
    }
  }

  function renderComment(comment) {
    if (emittedComments.has(comment.key)) return;
    emittedComments.add(comment.key);

    const status = feed.querySelector('.status');
    if (status) status.remove();

    const item = createElement('article', 'comment');
    const author = createElement('strong', '', comment.author);
    const timestamp = createElement('span', 'timestamp', `[${formatTime(comment.time)}]`);
    const text = createElement('div', '', comment.text);
    item.append(author, timestamp, text);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
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
      emittedComments.clear();
      lastTime = null;
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
