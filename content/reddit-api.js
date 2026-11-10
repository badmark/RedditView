// RedditView - Reddit Public API Client (content/reddit-api.js)

window.RedditViewRedditApi = (function () {
  const { escapeHtml, getRedditOrigin } = window.RedditViewUtils;
  const state = window.RedditViewState;

  // 1. Fetch user posts via Reddit public search index
  async function fetchUserPosts({ username, sort = 'new', t = null, after = null, limit = 25 }) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_POSTS',
          payload: { username, sort, t, after, limit }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.ok) {
            return reject(new Error(response?.error || 'Failed to fetch posts'));
          }
          resolve(response.data);
        }
      );
    });
  }

  // 2. Build comment search URL
  function buildCommentsSearchUrl(username, sort = 'new') {
    const q = `author:"${username}"`;
    return `https://www.reddit.com/svc/shreddit/search/?q=${encodeURIComponent(q)}&type=comments&sort=${encodeURIComponent(sort)}`;
  }

  // 3. Fetch Shreddit comments page HTML
  async function fetchCommentsHtml(url) {
    if (location.origin === 'https://www.reddit.com') {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9' }
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return await res.text();
    }

    // Cross-origin on old.reddit.com
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_COMMENTS',
          payload: { url }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!response || !response.ok) {
            return reject(new Error(response?.error || 'Failed to fetch comments'));
          }
          resolve(response.html);
        }
      );
    });
  }

  // 4. Parse comments from Shreddit HTML partial
  function parseCommentsPartial(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Extract next page cursor URL
    let nextUrl = null;
    const partialEl = doc.querySelector('faceplate-partial[loading="lazy"]');
    if (partialEl && partialEl.getAttribute('src')) {
      try {
        nextUrl = new URL(partialEl.getAttribute('src'), 'https://www.reddit.com').toString();
      } catch (e) {}
    }

    const comments = [];
    const units = doc.querySelectorAll('[data-testid="search-sdui-comment-unit"]');

    units.forEach((unit) => {
      try {
        const tracker = unit.closest('search-telemetry-tracker');
        const ctxRaw = tracker ? tracker.getAttribute('data-faceplate-tracking-context') : null;
        if (!ctxRaw) return;
        const ctx = JSON.parse(ctxRaw);
        const commentId = ctx?.comment?.id;
        if (!commentId) return;

        const permalinkEl = unit.querySelector('a[aria-labelledby^="comment-content-"]');
        const permalink = permalinkEl ? permalinkEl.getAttribute('href') : '';
        const postPermalink = permalink ? permalink.replace(/[^/]+\/?$/, '') : '';

        const contentWrap = unit.querySelector('[data-testid="search-comment-content"]');
        const bodyEl = contentWrap ? contentWrap.querySelector('[id^="search-comment-"][id$="-post-rtjson-content"]') : null;

        let bodyText = '';
        if (bodyEl) {
          const paragraphs = Array.from(bodyEl.querySelectorAll('p'));
          bodyText = (paragraphs.length ? paragraphs.map((p) => p.textContent.trim()) : [bodyEl.textContent.trim()])
            .filter(Boolean)
            .join('\n\n');
        }

        const voteEl = contentWrap ? contentWrap.querySelector('faceplate-number') : null;
        const score = voteEl ? parseInt(voteEl.getAttribute('number'), 10) || 0 : 0;

        const timeEl = contentWrap ? contentWrap.querySelector('faceplate-timeago') : null;
        const ts = timeEl ? timeEl.getAttribute('ts') : null;
        const createdUtc = ts ? Math.floor(new Date(ts).getTime() / 1000) : null;

        comments.push({
          id: commentId,
          postTitle: ctx?.post?.title || 'Comment on Reddit',
          subredditName: ctx?.subreddit?.name || '',
          permalink,
          postPermalink,
          body: bodyText,
          score,
          createdUtc
        });
      } catch (err) {
        // Skip malformed entries
      }
    });

    return { comments, nextUrl };
  }

  // 5. Fetch subreddit icon with caching
  async function fetchSubredditIcon(subreddit) {
    if (!subreddit) return null;
    const subLower = subreddit.toLowerCase().replace(/^r\//, '');
    if (state.iconCache.has(subLower)) {
      return state.iconCache.get(subLower);
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_SUBREDDIT_ICON',
          payload: { subreddit: subLower }
        },
        (response) => {
          if (response && response.ok && response.icon) {
            state.iconCache.set(subLower, response.icon);
            resolve(response.icon);
          } else {
            state.iconCache.set(subLower, null);
            resolve(null);
          }
        }
      );
    });
  }

  return {
    fetchUserPosts,
    buildCommentsSearchUrl,
    fetchCommentsHtml,
    parseCommentsPartial,
    fetchSubredditIcon
  };
})();
