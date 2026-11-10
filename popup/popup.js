// RedditView - Popup Controller (popup/popup.js)

document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Tabs Setup
  const navTabs = document.querySelectorAll('.rv-nav-tab');
  const tabContents = document.querySelectorAll('.rv-tab-content');

  navTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = `tab-${btn.getAttribute('data-tab')}`;
      navTabs.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add('active');
    });
  });

  // 1. Detect Active Tab Context
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeUrl = activeTab?.url || '';

  const contextTitle = document.getElementById('page-context-title');
  const profileActions = document.getElementById('profile-actions');
  const threadActions = document.getElementById('thread-actions');
  const genericActions = document.getElementById('generic-actions');

  const profileMatch = activeUrl.match(/reddit\.com\/(?:user|u)\/([^/?#]+)/i);
  const threadMatch = activeUrl.match(/reddit\.com\/r\/([^/?#]+)\/comments\/([a-z0-9]+)/i);

  if (profileMatch) {
    const username = profileMatch[1];
    contextTitle.textContent = `User Profile: u/${username}`;
    profileActions.style.display = 'flex';
    threadActions.style.display = 'none';
    genericActions.style.display = 'none';

    // Direct mirror links
    document.getElementById('link-ghostddit').href = `https://ghostddit.aeddit.com/user/${encodeURIComponent(username)}/`;
    document.getElementById('link-reveddit').href = `https://www.reveddit.com/y/${encodeURIComponent(username)}/`;
    document.getElementById('link-arctic').href = `https://arctic-shift.photon-reddit.com/search?author=${encodeURIComponent(username)}`;
    document.getElementById('link-pullpush').href = `https://api.pullpush.io/reddit/search/submission/?author=${encodeURIComponent(username)}`;

    // Force reveal button
    const btnForce = document.getElementById('btn-force-reveal');
    btnForce.addEventListener('click', async () => {
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'REDDITVIEW_TRIGGER_FORCE_REVEAL' });
        btnForce.textContent = '✅ Force Mode Toggled!';
        setTimeout(() => {
          btnForce.textContent = '👁️ Force Reveal Profile History (Ctrl+G)';
        }, 1800);
      } catch (e) {
        btnForce.textContent = '⚠️ Refresh Reddit Tab First';
      }
    });

  } else if (threadMatch) {
    const sub = threadMatch[1];
    const postId = threadMatch[2];
    contextTitle.textContent = `Thread: r/${sub} (${postId})`;
    profileActions.style.display = 'none';
    threadActions.style.display = 'flex';
    genericActions.style.display = 'none';

    document.getElementById('link-thread-reveddit').href = `https://www.reveddit.com/v/${sub}/comments/${postId}/`;

    // Thread scan button
    const btnScan = document.getElementById('btn-scan-thread');
    btnScan.addEventListener('click', async () => {
      try {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'REDDITVIEW_TRIGGER_THREAD_SCAN' });
        btnScan.textContent = '✅ Scanned Page for Deleted Items!';
        setTimeout(() => {
          btnScan.textContent = '🔍 Scan & Reveal All Deleted Comments';
        }, 1800);
      } catch (e) {
        btnScan.textContent = '⚠️ Refresh Reddit Tab First';
      }
    });

  } else {
    contextTitle.textContent = activeUrl.includes('reddit.com') ? 'Reddit Home / Feed' : 'Non-Reddit Page';
    profileActions.style.display = 'none';
    threadActions.style.display = 'none';
    genericActions.style.display = 'block';
  }

  // 2. User Lookup Form
  const formUser = document.getElementById('form-user-lookup');
  const inputUser = document.getElementById('input-username');
  const userResultsWrap = document.getElementById('user-results-wrap');
  const userMirrors = document.getElementById('user-mirrors');

  formUser.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawUser = inputUser.value.trim().replace(/^u\//i, '');
    if (!rawUser) return;

    // Show mirror links
    userMirrors.style.display = 'flex';
    document.getElementById('user-ghostddit-link').href = `https://ghostddit.aeddit.com/user/${encodeURIComponent(rawUser)}/`;
    document.getElementById('user-reveddit-link').href = `https://www.reveddit.com/y/${encodeURIComponent(rawUser)}/`;
    document.getElementById('user-arctic-link').href = `https://arctic-shift.photon-reddit.com/search?author=${encodeURIComponent(rawUser)}`;

    userResultsWrap.innerHTML = '<div class="rv-placeholder-text">Searching Reddit index and archives...</div>';

    try {
      // Query Reddit API and Archives in parallel
      const [redditRes, archiveRes] = await Promise.allSettled([
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'REDDITVIEW_FETCH_POSTS', payload: { username: rawUser, limit: 10 } },
            (res) => (res && res.ok ? resolve(res.data) : reject(new Error(res?.error || 'Failed')))
          );
        }),
        new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: 'REDDITVIEW_FETCH_USER_ARCHIVE', payload: { username: rawUser, limit: 10 } },
            (res) => (res && res.ok ? resolve(res.archive) : reject(new Error(res?.error || 'Failed')))
          );
        })
      ]);

      const posts = redditRes.status === 'fulfilled' ? (redditRes.value?.posts || []) : [];
      const archivePosts = archiveRes.status === 'fulfilled' ? (archiveRes.value?.posts || []) : [];
      const archiveComments = archiveRes.status === 'fulfilled' ? (archiveRes.value?.comments || []) : [];

      if (!posts.length && !archivePosts.length && !archiveComments.length) {
        userResultsWrap.innerHTML = `
          <div class="rv-placeholder-text">
            No public or archived records found for <strong>u/${rawUser}</strong>.
            <br><br>
            Try opening directly in <a href="https://ghostddit.aeddit.com/user/${encodeURIComponent(rawUser)}/" target="_blank" style="color:#ff4500;">Ghostddit</a> or <a href="https://www.reveddit.com/y/${encodeURIComponent(rawUser)}/" target="_blank" style="color:#24a0ed;">Reveddit</a>.
          </div>
        `;
        return;
      }

      userResultsWrap.innerHTML = '';

      // Render items
      posts.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'rv-mini-card';
        const url = p.permalink ? `https://www.reddit.com${p.permalink}` : p.url;
        item.innerHTML = `
          <div class="rv-mini-title"><a href="${url}" target="_blank">${escapeHtml(p.title)}</a></div>
          <div class="rv-mini-meta">
            <span>r/${escapeHtml(p.subreddit)}</span>
            <span>&bull;</span>
            <span>▲ ${p.score || 0}</span>
          </div>
        `;
        userResultsWrap.appendChild(item);
      });

      archiveComments.forEach((c) => {
        const item = document.createElement('div');
        item.className = 'rv-mini-card';
        const url = c.permalink ? `https://www.reddit.com${c.permalink}` : '#';
        item.innerHTML = `
          <div class="rv-mini-meta">
            <span style="color:#24a0ed;font-weight:700;">Archived Comment</span>
            <span>&bull;</span>
            <span>r/${escapeHtml(c.subreddit || '')}</span>
          </div>
          <div class="rv-mini-body">${escapeHtml(c.body ? c.body.slice(0, 200) : '')}</div>
        `;
        userResultsWrap.appendChild(item);
      });
    } catch (err) {
      userResultsWrap.innerHTML = `<div class="rv-placeholder-text" style="color:#ea0027;">Search error: ${escapeHtml(err.message)}</div>`;
    }
  });

  // 3. Thread Lookup Form
  const formThread = document.getElementById('form-thread-lookup');
  const inputThread = document.getElementById('input-thread-query');
  const threadResultsWrap = document.getElementById('thread-results-wrap');

  formThread.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = inputThread.value.trim();
    if (!query) return;

    threadResultsWrap.innerHTML = '<div class="rv-placeholder-text">Querying archives for deleted text...</div>';

    // Parse comment or post ID
    const commentMatch = query.match(/comments\/[a-z0-9]+\/[^/]*\/([a-z0-9]+)/i);
    const postMatch = query.match(/comments\/([a-z0-9]+)/i);
    const commentId = commentMatch ? commentMatch[1] : (query.startsWith('t1_') ? query.slice(3) : (!query.includes('/') && query.length >= 6 ? query : null));
    const postId = postMatch ? postMatch[1] : (query.startsWith('t3_') ? query.slice(3) : null);

    if (commentId) {
      chrome.runtime.sendMessage(
        { type: 'REDDITVIEW_FETCH_DELETED_COMMENT', payload: { id: commentId } },
        (res) => {
          if (res && res.ok && res.comment) {
            const c = res.comment;
            threadResultsWrap.innerHTML = `
              <div class="rv-mini-card">
                <div class="rv-mini-meta" style="color:#24a0ed;font-weight:700;">
                  <span>Restored Comment (${escapeHtml(c.source || 'Archive')})</span>
                </div>
                <div class="rv-mini-meta" style="margin-top:4px;">
                  <span>Author: <strong>u/${escapeHtml(c.author)}</strong></span>
                  <span>&bull;</span>
                  <span>Score: ${c.score || 0}</span>
                </div>
                <div class="rv-mini-body">${escapeHtml(c.body)}</div>
              </div>
            `;
          } else {
            threadResultsWrap.innerHTML = `<div class="rv-placeholder-text" style="color:#ea0027;">Comment not found in archives.</div>`;
          }
        }
      );
    } else if (postId) {
      chrome.runtime.sendMessage(
        { type: 'REDDITVIEW_FETCH_DELETED_POST', payload: { id: postId } },
        (res) => {
          if (res && res.ok && res.post) {
            const p = res.post;
            threadResultsWrap.innerHTML = `
              <div class="rv-mini-card">
                <div class="rv-mini-meta" style="color:#24a0ed;font-weight:700;">
                  <span>Restored Post (${escapeHtml(p.source || 'Archive')})</span>
                </div>
                <div class="rv-mini-title" style="margin-top:6px;">${escapeHtml(p.title)}</div>
                <div class="rv-mini-meta">
                  <span>Author: <strong>u/${escapeHtml(p.author)}</strong></span>
                  <span>&bull;</span>
                  <span>r/${escapeHtml(p.subreddit)}</span>
                </div>
                <div class="rv-mini-body">${escapeHtml(p.selftext || '(No text body)')}</div>
              </div>
            `;
          } else {
            threadResultsWrap.innerHTML = `<div class="rv-placeholder-text" style="color:#ea0027;">Post not found in archives.</div>`;
          }
        }
      );
    } else {
      threadResultsWrap.innerHTML = `<div class="rv-placeholder-text" style="color:#ea0027;">Could not extract a valid post or comment ID from input.</div>`;
    }
  });

  // 4. Settings Tab
  const autoRevealCheckbox = document.getElementById('setting-auto-reveal');
  const showDeletedCheckbox = document.getElementById('setting-show-deleted');
  const forceModeCheckbox = document.getElementById('setting-force-mode');
  const archiveProviderSelect = document.getElementById('setting-archive-provider');
  const savedNotice = document.getElementById('settings-saved-notice');

  // Load existing settings
  chrome.runtime.sendMessage({ type: 'REDDITVIEW_GET_SETTINGS' }, (res) => {
    if (res && res.ok && res.settings) {
      const s = res.settings;
      autoRevealCheckbox.checked = Boolean(s.autoRevealProfile);
      showDeletedCheckbox.checked = Boolean(s.showDeletedButtons);
      forceModeCheckbox.checked = Boolean(s.forceRevealMode);
      if (s.preferredArchive) archiveProviderSelect.value = s.preferredArchive;
    }
  });

  async function saveSettings() {
    const newSettings = {
      autoRevealProfile: autoRevealCheckbox.checked,
      showDeletedButtons: showDeletedCheckbox.checked,
      forceRevealMode: forceModeCheckbox.checked,
      preferredArchive: archiveProviderSelect.value
    };

    await chrome.storage.local.set(newSettings);

    // Notify active tab
    if (activeTab?.id) {
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: 'REDDITVIEW_SETTINGS_UPDATED',
          settings: newSettings
        });
      } catch (e) {}
    }

    savedNotice.style.display = 'inline';
    setTimeout(() => {
      savedNotice.style.display = 'none';
    }, 1500);
  }

  autoRevealCheckbox.addEventListener('change', saveSettings);
  showDeletedCheckbox.addEventListener('change', saveSettings);
  forceModeCheckbox.addEventListener('change', saveSettings);
  archiveProviderSelect.addEventListener('change', saveSettings);

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
