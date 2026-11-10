// RedditView - Deleted Content Revealer (content/deleted-reveal.js)

window.RedditViewDeleted = (function () {
  const { escapeHtml, formatCount, formatTimeAgo, formatDate, renderMarkdown, isOldReddit, cleanId } = window.RedditViewUtils;
  const state = window.RedditViewState;
  const archiveApi = window.RedditViewArchiveApi;

  // Check if comment node represents a deleted or removed comment
  function isCommentDeleted(node) {
    if (!node) return false;

    // Check Shreddit attributes
    if (node.tagName && node.tagName.toLowerCase() === 'shreddit-comment') {
      const author = node.getAttribute('author') || '';
      if (author === '[deleted]' || author === '[removed]') return true;

      // Check text content of body
      const content = node.querySelector('[slot="comment"]') || node;
      const text = content.textContent.trim();
      if (text.includes('[deleted]') || text.includes('[removed]')) return true;
    }

    // Check Old Reddit
    if (node.classList && node.classList.contains('comment')) {
      const authorEl = node.querySelector('.tagline .author');
      if (!authorEl || authorEl.textContent.includes('[deleted]')) {
        const bodyEl = node.querySelector('.usertext-body');
        if (bodyEl && (bodyEl.textContent.includes('[deleted]') || bodyEl.textContent.includes('[removed]'))) {
          return true;
        }
      }
    }

    return false;
  }

  // Get comment ID from DOM node
  function getCommentId(node) {
    if (!node) return null;

    if (node.tagName && node.tagName.toLowerCase() === 'shreddit-comment') {
      const raw = node.getAttribute('thingid') || node.getAttribute('id') || node.getAttribute('data-thing-id');
      if (raw) return cleanId(raw);
    }

    if (node.classList && node.classList.contains('comment')) {
      const raw = node.getAttribute('data-fullname') || node.id;
      if (raw) return cleanId(raw);
    }

    return null;
  }

  // Inject the reveal button onto a deleted comment
  function attachRevealButtonToComment(commentNode) {
    if (commentNode.querySelector('.rv-deleted-btn-wrap') || commentNode.querySelector('.rv-restored-box')) {
      return; // Already attached
    }

    const commentId = getCommentId(commentNode);
    if (!commentId) return;

    const wrap = document.createElement('div');
    wrap.className = 'rv-deleted-btn-wrap';
    wrap.innerHTML = `
      <button type="button" class="rv-reveal-btn" data-comment-id="${escapeHtml(commentId)}">
        <span class="rv-reveal-icon">🔍</span> Reveal Archived Comment
      </button>
    `;

    // Insertion target
    let target = commentNode.querySelector('[slot="comment"]') || commentNode.querySelector('.usertext-body');
    if (!target) {
      target = commentNode;
    }

    target.appendChild(wrap);

    const btn = wrap.querySelector('.rv-reveal-btn');
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      e.preventDefault();
      await revealComment(commentNode, commentId, wrap);
    });
  }

  // Reveal single comment
  async function revealComment(commentNode, commentId, buttonWrap) {
    const btn = buttonWrap.querySelector('.rv-reveal-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="rv-spinner"></span> Querying archives...`;
    }

    try {
      const commentData = await archiveApi.fetchDeletedComment(commentId);
      renderRestoredCommentBox(commentNode, commentData, buttonWrap);
    } catch (err) {
      console.warn('Failed to recover deleted comment:', err);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `⚠️ Not found in archives (Click to retry)`;
      }
    }
  }

  // Render the restored content box
  function renderRestoredCommentBox(commentNode, data, buttonWrap) {
    if (buttonWrap && buttonWrap.parentNode) {
      buttonWrap.remove();
    }

    let existingBox = commentNode.querySelector('.rv-restored-box');
    if (existingBox) existingBox.remove();

    const box = document.createElement('div');
    box.className = 'rv-restored-box';
    box.innerHTML = `
      <div class="rv-restored-header">
        <div class="rv-restored-badge">
          <span class="rv-restored-icon">🛡️</span>
          <span>RESTORED (${escapeHtml(data.source || 'Archive')})</span>
        </div>
        <div class="rv-restored-meta">
          <span>Author: <strong>u/${escapeHtml(data.author || '[unknown]')}</strong></span>
          <span class="rv-dot">&bull;</span>
          <span>Score: <strong>${escapeHtml(formatCount(data.score))}</strong></span>
          ${data.created_utc ? `<span class="rv-dot">&bull;</span><span title="${escapeHtml(formatDate(data.created_utc))}">${escapeHtml(formatTimeAgo(data.created_utc))}</span>` : ''}
        </div>
      </div>
      <div class="rv-restored-body">
        ${renderMarkdown(data.body)}
      </div>
    `;

    let target = commentNode.querySelector('[slot="comment"]') || commentNode.querySelector('.usertext-body');
    if (!target) target = commentNode;
    target.appendChild(box);
  }

  // Check and attach reveal button to deleted post (OP)
  function checkDeletedPost() {
    const postCtx = window.RedditViewUtils.parsePostContext();
    if (!postCtx || !postCtx.postId) return;

    const postId = cleanId(postCtx.postId);

    // Look for deleted post indicators
    const postEl = document.querySelector('shreddit-post') || document.querySelector('.thing.link');
    if (!postEl) return;

    if (postEl.querySelector('.rv-deleted-post-wrap') || postEl.querySelector('.rv-restored-box')) {
      return;
    }

    let isDeleted = false;
    const authorAttr = postEl.getAttribute('author');
    if (authorAttr === '[deleted]' || authorAttr === '[removed]') isDeleted = true;

    const postText = postEl.textContent;
    if (postText.includes('[deleted by user]') || postText.includes('[removed by reddit]') || postText.includes('[removed by moderators]')) {
      isDeleted = true;
    }

    if (isDeleted) {
      const wrap = document.createElement('div');
      wrap.className = 'rv-deleted-post-wrap';
      wrap.innerHTML = `
        <button type="button" class="rv-reveal-post-btn">
          <span class="rv-reveal-icon">🔍</span> Reveal Original Deleted Post Content
        </button>
      `;

      const target = postEl.querySelector('[slot="text-body"]') || postEl.querySelector('.entry') || postEl;
      target.appendChild(wrap);

      wrap.querySelector('.rv-reveal-post-btn').addEventListener('click', async () => {
        const btn = wrap.querySelector('.rv-reveal-post-btn');
        btn.disabled = true;
        btn.innerHTML = `<span class="rv-spinner"></span> Checking archives...`;
        try {
          const postData = await archiveApi.fetchDeletedPost(postId);
          wrap.remove();

          const box = document.createElement('div');
          box.className = 'rv-restored-box';
          box.innerHTML = `
            <div class="rv-restored-header">
              <div class="rv-restored-badge">
                <span class="rv-restored-icon">🛡️</span>
                <span>RESTORED SUBMISSION (${escapeHtml(postData.source || 'Archive')})</span>
              </div>
              <div class="rv-restored-meta">
                <span>Original Author: <strong>u/${escapeHtml(postData.author || '[unknown]')}</strong></span>
                <span class="rv-dot">&bull;</span>
                <span>Score: <strong>${escapeHtml(formatCount(postData.score))}</strong></span>
                ${postData.created_utc ? `<span class="rv-dot">&bull;</span><span>${escapeHtml(formatTimeAgo(postData.created_utc))}</span>` : ''}
              </div>
            </div>
            ${postData.title ? `<h4 class="rv-restored-title">${escapeHtml(postData.title)}</h4>` : ''}
            <div class="rv-restored-body">
              ${renderMarkdown(postData.selftext || '')}
            </div>
          `;
          target.appendChild(box);
        } catch (e) {
          btn.disabled = false;
          btn.innerHTML = `⚠️ Post not found in public archives (Click to retry)`;
        }
      });
    }
  }

  // Scan entire thread for deleted comments & insert thread bar
  function scanThreadForDeleted() {
    if (!state.settings.showDeletedButtons) return;

    checkDeletedPost();

    // Query comment elements
    const selector = isOldReddit() ? '.thing.comment' : 'shreddit-comment';
    const comments = Array.from(document.querySelectorAll(selector));

    const deletedNodes = [];
    const deletedIds = [];

    comments.forEach((node) => {
      if (isCommentDeleted(node)) {
        attachRevealButtonToComment(node);
        const id = getCommentId(node);
        if (id) {
          deletedNodes.push({ node, id });
          deletedIds.push(id);
        }
      }
    });

    // Thread top action bar
    if (deletedNodes.length > 0) {
      ensureThreadActionBar(deletedNodes, deletedIds);
    }
  }

  // Header banner showing count of deleted comments with batch reveal button
  function ensureThreadActionBar(deletedNodes, deletedIds) {
    let bar = document.getElementById('redditview-thread-bar');
    if (bar) {
      const countEl = bar.querySelector('.rv-thread-count');
      if (countEl) countEl.textContent = String(deletedNodes.length);
      return;
    }

    bar = document.createElement('div');
    bar.id = 'redditview-thread-bar';
    bar.className = 'rv-thread-bar';
    bar.innerHTML = `
      <div class="rv-thread-bar-content">
        <span class="rv-thread-icon">🔍</span>
        <span class="rv-thread-text">RedditView detected <strong class="rv-thread-count">${deletedNodes.length}</strong> deleted comment(s) in this thread.</span>
        <button type="button" class="rv-batch-reveal-btn">
          Reveal All Deleted Comments
        </button>
      </div>
    `;

    // Anchor: top of comment tree
    const container = document.querySelector('shreddit-comment-tree') || document.querySelector('.commentarea') || document.querySelector('main');
    if (container && container.parentNode) {
      container.parentNode.insertBefore(bar, container);
    }

    state.threadScanBar = bar;

    const btn = bar.querySelector('.rv-batch-reveal-btn');
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.innerHTML = `<span class="rv-spinner"></span> Revealing ${deletedIds.length} comments...`;

      try {
        const recoveredList = await archiveApi.fetchBatchDeletedComments(deletedIds);
        const recoveredMap = new Map();
        recoveredList.forEach((c) => {
          if (c && c.id) recoveredMap.set(c.id, c);
        });

        let successCount = 0;
        deletedNodes.forEach(({ node, id }) => {
          const data = recoveredMap.get(id);
          if (data) {
            const wrap = node.querySelector('.rv-deleted-btn-wrap');
            renderRestoredCommentBox(node, data, wrap);
            successCount++;
          }
        });

        btn.innerHTML = `✅ Restored ${successCount} of ${deletedIds.length} comments!`;
      } catch (err) {
        btn.disabled = false;
        btn.innerHTML = `⚠️ Batch lookup failed. Click to retry.`;
      }
    });
  }

  return {
    scanThreadForDeleted,
    checkDeletedPost,
    revealComment
  };
})();
