// RedditView - Profile Unhide & History Engine (content/profile-reveal.js)

window.RedditViewProfile = (function () {
  const { escapeHtml, formatCount, formatTimeAgo, formatDate, renderMarkdown, isOldReddit, getRedditOrigin, batchDOM } = window.RedditViewUtils;
  const state = window.RedditViewState;
  const redditApi = window.RedditViewRedditApi;
  const archiveApi = window.RedditViewArchiveApi;

  // Find the anchor element for injecting the panel
  function findAnchorElement() {
    if (isOldReddit()) {
      return document.querySelector('#siteTable') || document.querySelector('.content[role="main"]');
    }
    return document.querySelector('shreddit-feed') || document.querySelector('main') || document.querySelector('[role="main"]');
  }

  // Detect whether Reddit shows its empty state
  function isEmptyFeedPresent() {
    if (isOldReddit()) {
      return Boolean(document.querySelector('#siteTable > #noresults, .content > #noresults'));
    }
    // Shreddit / New Reddit selectors
    const emptyMarkers = [
      '#empty-feed-content',
      '[slot="empty-feed"]',
      'faceplate-tracker[source="empty_state"]',
      '#empty-container'
    ];
    for (const sel of emptyMarkers) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) return true;
    }

    // Check if shreddit-feed has no posts/children
    const feed = document.querySelector('shreddit-feed');
    if (feed && feed.children.length <= 1) {
      const text = feed.textContent.toLowerCase();
      if (text.includes("doesn't have any") || text.includes('no posts') || text.includes('nobody has posted')) {
        return true;
      }
    }

    return false;
  }

  // Hide the native feed cleanly
  function hideNativeFeed(anchor) {
    if (anchor && anchor.tagName.toLowerCase() === 'shreddit-feed') {
      anchor.style.setProperty('display', 'none', 'important');
    }
    const emptyMarker = document.querySelector('#empty-feed-content, #noresults');
    if (emptyMarker) {
      emptyMarker.style.setProperty('display', 'none', 'important');
    }
  }

  // Unhide the native feed if needed
  function unhideNativeFeed(anchor) {
    if (anchor && anchor.tagName.toLowerCase() === 'shreddit-feed') {
      anchor.style.removeProperty('display');
    }
    const emptyMarker = document.querySelector('#empty-feed-content, #noresults');
    if (emptyMarker) {
      emptyMarker.style.removeProperty('display');
    }
  }

  // Create or return the injected panel
  function ensurePanel(anchor, username) {
    let panel = document.getElementById('redditview-profile-panel');
    if (panel) return panel;

    panel = document.createElement('div');
    panel.id = 'redditview-profile-panel';
    panel.className = `rv-panel ${isOldReddit() ? 'rv-old-reddit' : ''}`;

    const revedditUrl = `https://www.reveddit.com/y/${encodeURIComponent(username)}/`;
    const ghostdditUrl = `https://ghostddit.aeddit.com/user/${encodeURIComponent(username)}/`;
    const arcticUrl = `https://arctic-shift.photon-reddit.com/search?author=${encodeURIComponent(username)}`;

    panel.innerHTML = `
      <div class="rv-header">
        <div class="rv-header-main">
          <div class="rv-header-title">
            <span class="rv-badge rv-badge-primary">REVEALED HISTORY</span>
            <span class="rv-user-name">u/${escapeHtml(username)}</span>
            <span class="rv-force-indicator" title="Force-reveal active (Ctrl+G to toggle)">[FORCE MODE]</span>
          </div>
          <div class="rv-external-links">
            <a href="${ghostdditUrl}" target="_blank" rel="noopener" class="rv-ext-btn">Ghostddit</a>
            <a href="${revedditUrl}" target="_blank" rel="noopener" class="rv-ext-btn">Reveddit</a>
            <a href="${arcticUrl}" target="_blank" rel="noopener" class="rv-ext-btn">Arctic Shift</a>
          </div>
        </div>

        <div class="rv-nav-bar">
          <div class="rv-tabs">
            <button type="button" class="rv-tab-btn active" data-tab="overview">Overview</button>
            <button type="button" class="rv-tab-btn" data-tab="posts">Posts</button>
            <button type="button" class="rv-tab-btn" data-tab="comments">Comments</button>
            <button type="button" class="rv-tab-btn" data-tab="archived">Archived / Deleted</button>
          </div>
          <div class="rv-controls">
            <label class="rv-sort-label">Sort:
              <select class="rv-sort-select">
                <option value="new">New</option>
                <option value="top">Top</option>
                <option value="hot">Hot</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div class="rv-items-list"></div>
      <div class="rv-status-bar">Loading history...</div>
      <div class="rv-sentinel"></div>
    `;

    // Insert before anchor or into main
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(panel, anchor);
    } else {
      document.body.appendChild(panel);
    }

    // Bind tab clicks
    panel.querySelectorAll('.rv-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (state.currentTab === tab) return;

        panel.querySelectorAll('.rv-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        state.currentTab = tab;
        state.resetProfileState();
        clearItemsList(panel);
        loadFeed(panel);
      });
    });

    // Bind sort change
    const sortSelect = panel.querySelector('.rv-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        state.currentSort = sortSelect.value;
        state.resetProfileState();
        clearItemsList(panel);
        loadFeed(panel);
      });
    }

    state.injectedPanel = panel;
    setupIntersectionObserver(panel);
    return panel;
  }

  function clearItemsList(panel) {
    const list = panel.querySelector('.rv-items-list');
    if (list) list.innerHTML = '';
  }

  function setStatus(panel, text) {
    const statusEl = panel.querySelector('.rv-status-bar');
    if (statusEl) {
      statusEl.textContent = text;
      statusEl.style.display = text ? 'block' : 'none';
    }
  }

  // Setup infinite scroll observer
  function setupIntersectionObserver(panel) {
    const sentinel = panel.querySelector('.rv-sentinel');
    if (!sentinel) return;

    if (state.observer) {
      try { state.observer.disconnect(); } catch (e) {}
    }

    state.observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        if (!state.isLoading && !state.isExhausted) {
          loadFeed(panel);
        }
      }
    }, { root: null, rootMargin: '400px 0px', threshold: 0 });

    state.observer.observe(sentinel);
  }

  // Render a single post card
  function createPostCard(p) {
    const card = document.createElement('article');
    card.className = 'rv-card rv-post-card';

    const sub = (p.subreddit || '').toLowerCase();
    const subUrl = `${getRedditOrigin()}/r/${escapeHtml(p.subreddit)}/`;
    const postUrl = p.permalink ? `${getRedditOrigin()}${escapeHtml(p.permalink)}` : p.url;
    const authorUrl = `${getRedditOrigin()}/user/${escapeHtml(p.author)}/`;

    // Check thumbnail / image
    let mediaHtml = '';
    if (p.post_hint === 'image' && p.url) {
      mediaHtml = `<div class="rv-media-wrap"><img src="${escapeHtml(p.url)}" alt="" class="rv-post-img" loading="lazy" /></div>`;
    } else if (p.thumbnail && p.thumbnail.startsWith('http')) {
      mediaHtml = `<div class="rv-thumb-wrap"><img src="${escapeHtml(p.thumbnail)}" alt="" class="rv-post-thumb" loading="lazy" /></div>`;
    }

    // Selftext preview
    let bodyHtml = '';
    if (p.selftext) {
      const truncated = p.selftext.length > 500 ? p.selftext.slice(0, 500) + '...' : p.selftext;
      bodyHtml = `<div class="rv-body-text">${renderMarkdown(truncated)}</div>`;
    }

    card.innerHTML = `
      <div class="rv-card-header">
        <span class="rv-sub-icon-slot" data-sub="${escapeHtml(sub)}"></span>
        <a href="${subUrl}" class="rv-sub-link" target="_blank" rel="noopener">r/${escapeHtml(p.subreddit)}</a>
        <span class="rv-dot">&bull;</span>
        <span class="rv-posted-by">Posted by <a href="${authorUrl}" class="rv-author-link">u/${escapeHtml(p.author)}</a></span>
        <span class="rv-timestamp" title="${escapeHtml(formatDate(p.created_utc))}">${escapeHtml(formatTimeAgo(p.created_utc))}</span>
        ${p.over_18 ? '<span class="rv-badge rv-badge-nsfw">NSFW</span>' : ''}
      </div>

      <h3 class="rv-post-title">
        <a href="${postUrl}" target="_blank" rel="noopener">${escapeHtml(p.title)}</a>
      </h3>

      ${bodyHtml}
      ${mediaHtml}

      <div class="rv-card-footer">
        <div class="rv-stat"><span class="rv-stat-icon">▲</span> ${escapeHtml(formatCount(p.score))}</div>
        <a href="${postUrl}" class="rv-stat rv-comments-link" target="_blank" rel="noopener">
          <span class="rv-stat-icon">💬</span> ${escapeHtml(formatCount(p.num_comments || 0))} comments
        </a>
      </div>
    `;

    // Trigger icon fetch
    loadIconForCard(card, sub);
    return card;
  }

  // Render a single comment card
  function createCommentCard(c) {
    const card = document.createElement('article');
    card.className = 'rv-card rv-comment-card';

    const sub = (c.subredditName || c.subreddit || '').toLowerCase();
    const subUrl = `${getRedditOrigin()}/r/${escapeHtml(sub)}/`;
    const postUrl = c.postPermalink ? `${getRedditOrigin()}${escapeHtml(c.postPermalink)}` : '#';
    const commentUrl = c.permalink ? `${getRedditOrigin()}${escapeHtml(c.permalink)}` : '#';

    card.innerHTML = `
      <div class="rv-card-header">
        <span class="rv-sub-icon-slot" data-sub="${escapeHtml(sub)}"></span>
        <a href="${subUrl}" class="rv-sub-link" target="_blank" rel="noopener">r/${escapeHtml(sub)}</a>
        <span class="rv-dot">&bull;</span>
        <span class="rv-parent-title">on <a href="${postUrl}" target="_blank" rel="noopener">${escapeHtml(c.postTitle || 'Reddit Post')}</a></span>
        <span class="rv-timestamp" title="${escapeHtml(formatDate(c.createdUtc || c.created_utc))}">${escapeHtml(formatTimeAgo(c.createdUtc || c.created_utc))}</span>
      </div>

      <div class="rv-comment-body">
        ${renderMarkdown(c.body)}
      </div>

      <div class="rv-card-footer">
        <div class="rv-stat"><span class="rv-stat-icon">▲</span> ${escapeHtml(formatCount(c.score || c.voteCount || 0))}</div>
        <a href="${commentUrl}" class="rv-stat rv-comments-link" target="_blank" rel="noopener">
          <span class="rv-stat-icon">🔗</span> View Context
        </a>
      </div>
    `;

    loadIconForCard(card, sub);
    return card;
  }

  // Render an archived card (from Arctic Shift / Pullpush)
  function createArchivedCard(item, isPost) {
    const card = document.createElement('article');
    card.className = 'rv-card rv-archived-card';

    const sub = (item.subreddit || '').toLowerCase();
    const subUrl = `${getRedditOrigin()}/r/${escapeHtml(sub)}/`;
    const sourceBadge = `<span class="rv-badge rv-badge-archive">Archived (${escapeHtml(item.source || 'Arctic Shift')})</span>`;

    if (isPost) {
      const postUrl = item.permalink ? `${getRedditOrigin()}${escapeHtml(item.permalink)}` : (item.url || '#');
      card.innerHTML = `
        <div class="rv-card-header">
          <span class="rv-sub-icon-slot" data-sub="${escapeHtml(sub)}"></span>
          <a href="${subUrl}" class="rv-sub-link" target="_blank" rel="noopener">r/${escapeHtml(sub)}</a>
          <span class="rv-dot">&bull;</span>
          <span class="rv-timestamp">${escapeHtml(formatTimeAgo(item.created_utc))}</span>
          ${sourceBadge}
        </div>
        <h3 class="rv-post-title"><a href="${postUrl}" target="_blank" rel="noopener">${escapeHtml(item.title || 'Untitled Post')}</a></h3>
        <div class="rv-body-text">${renderMarkdown(item.selftext || '')}</div>
        <div class="rv-card-footer">
          <div class="rv-stat"><span class="rv-stat-icon">▲</span> ${escapeHtml(formatCount(item.score || 0))}</div>
          <span class="rv-archived-note">Pulled from historical database</span>
        </div>
      `;
    } else {
      const commentUrl = item.permalink ? `${getRedditOrigin()}${escapeHtml(item.permalink)}` : '#';
      card.innerHTML = `
        <div class="rv-card-header">
          <span class="rv-sub-icon-slot" data-sub="${escapeHtml(sub)}"></span>
          <a href="${subUrl}" class="rv-sub-link" target="_blank" rel="noopener">r/${escapeHtml(sub)}</a>
          <span class="rv-dot">&bull;</span>
          <span class="rv-timestamp">${escapeHtml(formatTimeAgo(item.created_utc))}</span>
          ${sourceBadge}
        </div>
        <div class="rv-comment-body">${renderMarkdown(item.body || '')}</div>
        <div class="rv-card-footer">
          <div class="rv-stat"><span class="rv-stat-icon">▲</span> ${escapeHtml(formatCount(item.score || 0))}</div>
          <a href="${commentUrl}" class="rv-stat" target="_blank" rel="noopener">🔗 Permalink</a>
        </div>
      `;
    }

    loadIconForCard(card, sub);
    return card;
  }

  // Lazy-load subreddit icon
  async function loadIconForCard(card, sub) {
    if (!sub) return;
    const slot = card.querySelector('.rv-sub-icon-slot');
    if (!slot) return;

    try {
      const iconUrl = await redditApi.fetchSubredditIcon(sub);
      if (iconUrl) {
        slot.innerHTML = `<img src="${escapeHtml(iconUrl)}" alt="" class="rv-sub-icon-img" onerror="this.remove();" />`;
      }
    } catch (e) {}
  }

  // Load feed according to current tab
  async function loadFeed(panel) {
    const currentGen = state.generation;
    if (state.isLoading || state.isExhausted || !state.currentUsername) return;
    state.isLoading = true;

    setStatus(panel, 'Fetching history from Reddit index...');

    try {
      const list = panel.querySelector('.rv-items-list');

      if (state.currentTab === 'posts') {
        const { posts, after } = await redditApi.fetchUserPosts({
          username: state.currentUsername,
          sort: state.currentSort,
          after: state.postsAfter
        });

        if (currentGen !== state.generation) return;
        state.postsAfter = after;

        const newPosts = (posts || []).filter((p) => p && p.id && !state.seenItemIds.has('p_' + p.id));
        newPosts.forEach((p) => {
          state.seenItemIds.add('p_' + p.id);
          list.appendChild(createPostCard(p));
        });

        if (!after || newPosts.length === 0) {
          state.isExhausted = true;
          setStatus(panel, state.seenItemIds.size ? 'All posts loaded.' : 'No public posts found for this user.');
        } else {
          setStatus(panel, '');
        }

      } else if (state.currentTab === 'comments') {
        const url = state.nextCommentsUrl || redditApi.buildCommentsSearchUrl(state.currentUsername, state.currentSort);
        const html = await redditApi.fetchCommentsHtml(url);

        if (currentGen !== state.generation) return;
        const { comments, nextUrl } = redditApi.parseCommentsPartial(html);
        state.nextCommentsUrl = nextUrl;

        const newComments = (comments || []).filter((c) => c && c.id && !state.seenItemIds.has('c_' + c.id));
        newComments.forEach((c) => {
          state.seenItemIds.add('c_' + c.id);
          list.appendChild(createCommentCard(c));
        });

        if (!nextUrl || newComments.length === 0) {
          state.isExhausted = true;
          setStatus(panel, state.seenItemIds.size ? 'All comments loaded.' : 'No public comments found for this user.');
        } else {
          setStatus(panel, '');
        }

      } else if (state.currentTab === 'overview') {
        // Interleave posts and comments
        const [postsRes, commentsHtml] = await Promise.allSettled([
          state.postsAfter !== null || state.seenItemIds.size === 0
            ? redditApi.fetchUserPosts({ username: state.currentUsername, sort: state.currentSort, after: state.postsAfter })
            : Promise.resolve({ posts: [], after: null }),
          state.nextCommentsUrl !== null || state.seenItemIds.size === 0
            ? redditApi.fetchCommentsHtml(state.nextCommentsUrl || redditApi.buildCommentsSearchUrl(state.currentUsername, state.currentSort))
            : Promise.resolve('')
        ]);

        if (currentGen !== state.generation) return;

        const posts = postsRes.status === 'fulfilled' ? (postsRes.value?.posts || []) : [];
        if (postsRes.status === 'fulfilled') state.postsAfter = postsRes.value?.after;

        let comments = [];
        if (commentsHtml.status === 'fulfilled' && commentsHtml.value) {
          const parsed = redditApi.parseCommentsPartial(commentsHtml.value);
          comments = parsed.comments || [];
          state.nextCommentsUrl = parsed.nextUrl;
        }

        // Format combined items
        const combined = [];
        posts.forEach((p) => {
          if (p && p.id && !state.seenItemIds.has('p_' + p.id)) {
            state.seenItemIds.add('p_' + p.id);
            combined.push({ type: 'post', time: p.created_utc || 0, data: p });
          }
        });
        comments.forEach((c) => {
          if (c && c.id && !state.seenItemIds.has('c_' + c.id)) {
            state.seenItemIds.add('c_' + c.id);
            combined.push({ type: 'comment', time: c.createdUtc || c.created_utc || 0, data: c });
          }
        });

        // Sort descending by time
        combined.sort((a, b) => b.time - a.time);

        combined.forEach((item) => {
          if (item.type === 'post') {
            list.appendChild(createPostCard(item.data));
          } else {
            list.appendChild(createCommentCard(item.data));
          }
        });

        if (!state.postsAfter && !state.nextCommentsUrl) {
          state.isExhausted = true;
          setStatus(panel, state.seenItemIds.size ? 'All activity loaded.' : 'No public activity found for this user.');
        } else {
          setStatus(panel, '');
        }

      } else if (state.currentTab === 'archived') {
        setStatus(panel, 'Searching Arctic Shift & Pullpush archives...');
        const archive = await archiveApi.fetchUserArchive(state.currentUsername, 'all', 40);

        if (currentGen !== state.generation) return;

        const posts = archive.posts || [];
        const comments = archive.comments || [];

        const combined = [];
        posts.forEach((p) => {
          if (p && p.id && !state.seenItemIds.has('arch_p_' + p.id)) {
            state.seenItemIds.add('arch_p_' + p.id);
            combined.push({ isPost: true, time: p.created_utc || 0, data: p });
          }
        });
        comments.forEach((c) => {
          if (c && c.id && !state.seenItemIds.has('arch_c_' + c.id)) {
            state.seenItemIds.add('arch_c_' + c.id);
            combined.push({ isPost: false, time: c.created_utc || 0, data: c });
          }
        });

        combined.sort((a, b) => b.time - a.time);
        combined.forEach((item) => {
          list.appendChild(createArchivedCard(item.data, item.isPost));
        });

        state.isExhausted = true;
        setStatus(panel, combined.length ? `Found ${combined.length} archived items in database.` : 'No archived records found.');
      }
    } catch (err) {
      if (currentGen !== state.generation) return;
      console.error('RedditView feed load error:', err);
      setStatus(panel, `Error loading history (${err.message}). Click tab to retry.`);
    } finally {
      if (currentGen === state.generation) {
        state.isLoading = false;
      }
    }
  }

  // Trigger check and injection
  function checkAndInject(force = false) {
    const ctx = window.RedditViewUtils.parseProfileContext();
    if (!ctx || !ctx.username) {
      // Not on profile page
      if (state.injectedPanel) {
        state.injectedPanel.remove();
        state.injectedPanel = null;
      }
      return;
    }

    state.isProfilePage = true;
    state.currentUsername = ctx.username;

    const anchor = findAnchorElement();
    if (!anchor) return;

    const shouldInject = force || state.settings.forceRevealMode || (state.settings.autoRevealProfile && isEmptyFeedPresent());

    if (shouldInject) {
      hideNativeFeed(anchor);
      const panel = ensurePanel(anchor, ctx.username);

      if (force || state.settings.forceRevealMode) {
        panel.classList.add('rv-force-active');
      } else {
        panel.classList.remove('rv-force-active');
      }

      // If newly mounted, load initial feed
      const list = panel.querySelector('.rv-items-list');
      if (list && list.children.length === 0 && !state.isLoading) {
        loadFeed(panel);
      }
    }
  }

  // Toggle Force Mode
  function toggleForceReveal() {
    state.settings.forceRevealMode = !state.settings.forceRevealMode;
    chrome.runtime.sendMessage({
      type: 'REDDITVIEW_SET_SETTINGS',
      payload: { forceRevealMode: state.settings.forceRevealMode }
    });

    const anchor = findAnchorElement();
    if (state.settings.forceRevealMode) {
      checkAndInject(true);
    } else {
      if (anchor) unhideNativeFeed(anchor);
      if (state.injectedPanel) {
        state.injectedPanel.remove();
        state.injectedPanel = null;
      }
    }
  }

  return {
    checkAndInject,
    toggleForceReveal,
    isEmptyFeedPresent
  };
})();
