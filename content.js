(() => {
  const HOST_ID = 'project-freedom-host';
  const DEFAULT_SETTINGS = {
    overlayEnabled: true,
    youtubeEnabled: true,
    opacity: 0.92,
    position: 'docked',
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
  let localSeq = 0;

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

    // Keep keyboard input inside the overlay from reaching YouTube's shortcut
    // handlers — e.g. Space pausing the video, or k/j/l seeking, while the user
    // is typing a comment. Our fields live in a shadow DOM, so YouTube can't see
    // that a field is focused and would otherwise act on every keystroke.
    for (const type of ['keydown', 'keyup', 'keypress']) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }

    const style = createElement('style');
    style.textContent = `
      :host {
        all: initial;
        /* dark palette: warm umber base + slate-blue secondary accent */
        --c-panel: #221c15;
        --c-header: #1a150f;
        --c-surface: #2c241b;
        --c-border: #42372a;
        --c-text: #f1ece3;
        --c-text-muted: #b6aa98;
        --c-accent: #d1a054;    /* umber (primary / base) */
        --c-accent-2: #8192b5;  /* slate blue (secondary; lightened for dark) */
        --c-grip: #8a7a63;
        --c-hover: #ffffff14;
        --c-shadow: rgba(0, 0, 0, 0.5);
      }
      @media (prefers-color-scheme: light) {
        :host {
          /* light palette: warm paper base + slate-blue secondary accent */
          --c-panel: #f7f3ec;
          --c-header: #efe8dc;
          --c-surface: #efe7db;
          --c-border: #ddd2c1;
          --c-text: #2a241c;
          --c-text-muted: #6f6454;
          --c-accent: #a9742e;    /* umber (darkened for contrast on paper) */
          --c-accent-2: #485872;  /* slate blue (as specified) */
          --c-grip: #a1927d;
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
      .controls { position: absolute; top: 6px; right: 6px; z-index: 2;
        display: flex; gap: 4px; opacity: 0; transition: opacity 120ms ease; pointer-events: none; }
      .panel:hover .controls, .controls:focus-within { opacity: 1; pointer-events: auto; }
      .control-btn { width: 26px; height: 26px; display: flex; align-items: center;
        justify-content: center; padding: 0; font-size: 14px; line-height: 1; color: var(--c-text);
        background: var(--c-header); border: 1px solid var(--c-border); border-radius: 6px;
        box-shadow: 0 1px 4px var(--c-shadow); }
      .control-btn:hover { background: var(--c-hover); }
      .control-btn.drag-grip { cursor: move; touch-action: none; }
      button, select, input { font: inherit; }
      button { color: inherit; cursor: pointer; }
      input[type="checkbox"], input[type="range"] { accent-color: var(--c-accent); }
      button:focus-visible, select:focus-visible, input:focus-visible {
        outline: 2px solid var(--c-accent); outline-offset: 2px;
      }
      .feed { flex: 1; overflow: auto; padding: 12px; }
      .status { color: var(--c-text-muted); }
      .comment { margin: 0 0 10px; padding: 8px 10px; border-radius: 8px;
        background: var(--c-surface); border-left: 3px solid var(--c-accent); }
      .comment strong { color: var(--c-accent); }
      .timestamp { margin-left: 6px; color: var(--c-accent-2); font-size: 11px; font-weight: 600;
        cursor: pointer; }
      .timestamp:hover { text-decoration: underline; }
      .timestamp:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; border-radius: 3px; }
      .composer { display: flex; flex-direction: column; gap: 4px; padding: 8px;
        border-top: 1px solid var(--c-border); }
      .composer-row { display: flex; gap: 6px; }
      .composer input { flex: 1; min-width: 0; padding: 6px 8px; color: var(--c-text);
        background: var(--c-surface); border: 1px solid var(--c-border); border-radius: 6px; }
      .composer button { padding: 6px 12px; color: var(--c-panel); background: var(--c-accent);
        border: 1px solid var(--c-accent); border-radius: 6px; font-weight: 600; cursor: pointer; }
      .composer button:hover { filter: brightness(1.08); }
      .composer-note { font-size: 11px; color: var(--c-text-muted); min-height: 13px; }
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

    const controls = createElement('div', 'controls');

    const dragGrip = createElement('button', 'control-btn drag-grip', '⠿');
    dragGrip.type = 'button';
    dragGrip.setAttribute('aria-label', 'Move overlay');
    dragGrip.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = true;
      const bounds = panel.getBoundingClientRect();
      const offsetX = event.clientX - bounds.left;
      const offsetY = event.clientY - bounds.top;
      try { dragGrip.setPointerCapture(event.pointerId); } catch {}
      const drag = (moveEvent) => {
        const maxX = Math.max(0, innerWidth - bounds.width);
        const maxY = Math.max(0, innerHeight - bounds.height);
        const x = Math.max(0, Math.min(moveEvent.clientX - offsetX, maxX));
        const y = Math.max(0, Math.min(moveEvent.clientY - offsetY, maxY));
        placePanelAt(x, y);
      };
      const finishDrag = () => {
        dragging = false;
        dragGrip.removeEventListener('pointermove', drag);
        const moved = panel.getBoundingClientRect();
        saveSettings({ posX: Math.round(moved.left), posY: Math.round(moved.top) });
      };
      dragGrip.addEventListener('pointermove', drag);
      dragGrip.addEventListener('pointerup', finishDrag, { once: true });
      dragGrip.addEventListener('pointercancel', finishDrag, { once: true });
    });

    const menuButton = createElement('button', 'control-btn', '⚙');
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', 'Open overlay settings');
    menuButton.addEventListener('click', () => openMenu(menuButton));

    const closeButton = createElement('button', 'control-btn', '×');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Turn off overlay');
    closeButton.addEventListener('click', () => saveSettings({ overlayEnabled: false }));

    controls.append(dragGrip, menuButton, closeButton);

    feed = createElement('div', 'feed');
    feed.setAttribute('aria-live', 'polite');
    feed.setAttribute('aria-relevant', 'additions text');
    feed.addEventListener('contextmenu', (event) => {
      if (window.getSelection()?.toString()) return;
      event.preventDefault();
      openMenu(null, event.clientX, event.clientY);
    });

    const composer = createElement('div', 'composer');
    const composerRow = createElement('div', 'composer-row');
    const composerInput = createElement('input');
    composerInput.type = 'text';
    composerInput.placeholder = 'Add to the conversation…';
    composerInput.setAttribute('aria-label', 'Write a comment to post on YouTube');
    const sendButton = createElement('button', '', 'Send');
    sendButton.type = 'button';
    const composerNote = createElement('div', 'composer-note');
    composerNote.setAttribute('aria-live', 'polite');

    let composerNoteTimer = null;
    const setComposerNote = (text, isError) => {
      composerNote.textContent = text;
      composerNote.style.color = isError ? 'var(--c-accent-2)' : 'var(--c-text-muted)';
      if (composerNoteTimer) clearTimeout(composerNoteTimer);
      if (text) composerNoteTimer = setTimeout(() => { composerNote.textContent = ''; }, 5000);
    };

    const submitComposer = () => {
      const text = composerInput.value.trim();
      if (!text) return;
      // Stamp the comment with the current video position so it re-enters the
      // corpus already placed at the moment the user reacted to.
      const video = document.querySelector('video');
      const stampSeconds = video ? Math.floor(video.currentTime) : 0;
      const stamped = video ? `${formatTime(stampSeconds)} ${text}` : text;
      setComposerNote('Posting to YouTube…', false);
      depositToYouTube(stamped, (ok, message) => {
        setComposerNote(message, !ok);
        if (ok) {
          composerInput.value = '';
          // Show the user's comment in the overlay immediately, placed at the
          // moment they posted — no refetch/refresh needed. Display the raw
          // reaction (the badge already shows the time) even though the posted
          // text carries the stamp.
          addLocalComment(stampSeconds, text);
        }
      });
    };

    sendButton.addEventListener('click', submitComposer);
    composerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submitComposer();
      }
    });

    composerRow.append(composerInput, sendButton);
    composer.append(composerRow, composerNote);

    const resizeGrip = createElement('div', 'resize-grip');
    resizeGrip.setAttribute('role', 'separator');
    resizeGrip.setAttribute('aria-label', 'Resize overlay from the corner opposite its position');
    resizeGrip.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      const bounds = panel.getBoundingClientRect();
      const customOrDocked = (Number.isFinite(settings.posX) && Number.isFinite(settings.posY)) || settings.position === 'docked';
      const gripPosition = customOrDocked
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
    panel.append(feed, composer, controls, resizeGrip);

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
      'Enable Carpenter on YouTube',
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
      ['docked', 'Dock beside video'],
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

  // Dock the panel just to the right of the video player, top-aligned with it,
  // so it reads as a sidebar beside the video. Returns false if there is no real
  // player to anchor to (so the caller can fall back to a viewport preset).
  function dockToVideo() {
    if (!panel) return false;
    const video = document.querySelector('video');
    if (!video) return false;
    const r = video.getBoundingClientRect();
    if (r.width < 120 || r.height < 90) return false;
    const gap = 12;
    const w = panel.offsetWidth || Number(settings.width) || 330;
    let left = r.right + gap;
    if (left + w > innerWidth - 8) left = Math.max(8, innerWidth - w - 8);
    const top = Math.max(8, Math.min(r.top, innerHeight - 140));
    panel.classList.remove('bottom-right', 'bottom-left');
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    return true;
  }

  function applySettings() {
    if (!panel || !menu) return;

    const visible = Boolean(settings.overlayEnabled && settings.youtubeEnabled && isWatchPage());
    panel.hidden = !visible;
    const hasCustomPos = Number.isFinite(settings.posX) && Number.isFinite(settings.posY);
    panel.style.opacity = String(settings.opacity);
    panel.style.width = `min(${settings.width}px, calc(100vw - 24px))`;
    panel.style.height = `min(${settings.height}px, 70vh)`;
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
      } else if (settings.position === 'docked' && dockToVideo()) {
        // dockToVideo positioned the panel beside the video, top-aligned
      } else {
        panel.style.left = '';
        panel.style.top = '';
        panel.style.right = '';
        panel.style.bottom = '';
        panel.classList.toggle('bottom-right', settings.position === 'bottom-right');
        panel.classList.toggle('bottom-left', settings.position === 'bottom-left');
      }
    }
    const customOrDocked = hasCustomPos || settings.position === 'docked';
    const gripPosition = customOrDocked
      ? 'bottom-right'
      : settings.position === 'bottom-right'
        ? 'top-left'
        : settings.position === 'bottom-left'
          ? 'top-right'
          : 'bottom-left';
    const resizeGrip = panel.querySelector('.resize-grip');
    resizeGrip.classList.remove('top-left', 'top-right', 'bottom-left', 'bottom-right');
    resizeGrip.classList.add(gripPosition);
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
    if (returnFocus) (menuTrigger || root.querySelector('.controls button'))?.focus();
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
    showStatus('');
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

  // Add the user's own just-posted comment to the overlay feed right away, so it
  // appears at its moment without waiting for a refetch of YouTube's comments.
  function addLocalComment(time, text) {
    comments.push({ key: `local:${++localSeq}`, time, author: 'You', text });
    const video = document.querySelector('video');
    syncCommentsToTime(video ? Math.floor(video.currentTime) : time);
  }

  // A real reaction cites zero or one moment; a comment packed with timestamps
  // is almost always a chapter/index dump (a table of contents), which adds
  // nothing to the watch-party feed. Skip comments with this many or more.
  // Tuned higher for sports/full-game uploads, where viewers post long key-play
  // indexes for people skimming the game.
  const TIMESTAMP_LIST_THRESHOLD = 5;

  function countTimestamps(text) {
    const matches = text.match(/(?:^|\s)(?:\d{1,2}:)?\d{1,2}:[0-5]\d(?=$|[\s.,!?])/g);
    return matches ? matches.length : 0;
  }

  function isTimestampList(text) {
    return countTimestamps(text) >= TIMESTAMP_LIST_THRESHOLD;
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
      comments = fetchedComments
        .map((comment, index) => ({
          key: `${id}:${index}`,
          time: parseTimestamp(comment.text),
          author: comment.author,
          text: comment.text,
        }))
        .filter((comment) => comment.time !== null && !isTimestampList(comment.text));
      if (comments.length) {
        feed.replaceChildren();
        lastStatus = '';
      } else {
        showStatus('No synced comments for this video.');
      }
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
    timestamp.setAttribute('role', 'button');
    timestamp.tabIndex = 0;
    timestamp.title = `Jump to ${formatTime(comment.time)}`;
    timestamp.addEventListener('click', () => seekTo(comment.time));
    timestamp.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        seekTo(comment.time);
      }
    });
    const text = createElement('div', '', comment.text);
    item.append(author, timestamp, text);
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
    rendered.set(comment.key, item);
  }

  function seekTo(seconds) {
    const video = document.querySelector('video');
    if (!video) return;
    try {
      video.currentTime = seconds;
      const playback = video.play?.();
      if (playback && typeof playback.catch === 'function') playback.catch(() => {});
    } catch {}
  }

  // Mode 1 (ghost-tie): put the user's text into YouTube's own comment box and
  // post it. The user typed the text and pressed Send, so posting on their
  // behalf is their explicit per-message intent.
  function depositToYouTube(text, onResult) {
    const report = (ok, message) => { if (typeof onResult === 'function') onResult(ok, message); };
    const placeholder = document.querySelector('#simplebox-placeholder')
      || document.querySelector('ytd-comment-simplebox-renderer #placeholder-area')
      || document.querySelector('#placeholder-area');
    if (placeholder) placeholder.click();

    // Click YouTube's Comment button once it enables (it stays disabled until it
    // registers the inserted text).
    const submitWhenReady = (attempts) => {
      const renderer = document.querySelector('ytd-commentbox #submit-button')
        || document.querySelector('#submit-button');
      const button = (renderer && renderer.querySelector('button')) || renderer;
      const disabled = !button || button.disabled
        || button.getAttribute('aria-disabled') === 'true'
        || (renderer && renderer.hasAttribute && renderer.hasAttribute('disabled'));
      if (button && !disabled) {
        button.click();
        report(true, 'Posted to YouTube ✓');
        return;
      }
      if (attempts < 15) { setTimeout(() => submitWhenReady(attempts + 1), 120); return; }
      report(false, 'Filled YouTube’s box, but couldn’t auto-post — click Comment there to post.');
    };

    let tries = 0;
    const fill = () => {
      const editable = document.querySelector('ytd-comment-simplebox-renderer #contenteditable-root')
        || document.querySelector('ytd-commentbox #contenteditable-root')
        || document.querySelector('#contenteditable-root');
      if (editable) {
        editable.focus();
        let inserted = false;
        try {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(editable);
          selection.removeAllRanges();
          selection.addRange(range);
          inserted = document.execCommand('insertText', false, text);
        } catch {}
        if (!inserted) editable.textContent = text;
        editable.dispatchEvent(new InputEvent('input', {
          bubbles: true, cancelable: true, inputType: 'insertText', data: text,
        }));
        submitWhenReady(0);
        return;
      }
      if (tries++ < 12) { setTimeout(fill, 120); return; }
      report(false, 'Couldn’t find YouTube’s comment box. Scroll to the comments and try again.');
    };
    setTimeout(fill, 120);
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
      showStatus('');
      requestComments(videoId);
    }
  });

  buildOverlay();
  readSettings();
  window.setInterval(tick, 500);
  document.addEventListener('yt-navigate-finish', tick);
})();
