// RedditView - Background Service Worker (Manifest V3)

const DEFAULT_SETTINGS = {
  autoRevealProfile: true,
  showDeletedButtons: true,
  forceRevealMode: false,
  preferredArchive: 'auto', // 'auto' | 'arctic' | 'pullpush'
  highlightDeletedComments: true
};

// Initialize settings and context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const toSet = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (current[key] === undefined) {
      toSet[key] = value;
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
  }

  // Create context menus
  try {
    chrome.contextMenus.create({
      id: 'redditview-search-user',
      title: 'RedditView: Inspect u/%s in public archives',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'redditview-check-link',
      title: 'RedditView: View deleted/archived version',
      contexts: ['link'],
      targetUrlPatterns: ['*://*.reddit.com/*']
    });
  } catch (err) {
    console.warn('Context menu creation warning:', err);
  }
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'redditview-search-user' && info.selectionText) {
    const raw = info.selectionText.trim().replace(/^u\//i, '').replace(/^@/, '');
    if (raw) {
      const url = `https://arctic-shift.photon-reddit.com/search?author=${encodeURIComponent(raw)}`;
      await chrome.tabs.create({ url, openerTabId: tab?.id });
    }
  } else if (info.menuItemId === 'redditview-check-link' && info.linkUrl) {
    const targetUrl = info.linkUrl;
    // Extract thread or comment path
    const match = targetUrl.match(/reddit\.com\/r\/([^/]+)\/comments\/([a-z0-9]+)(?:\/[^/]*\/([a-z0-9]+))?/i);
    if (match) {
      const sub = match[1];
      const postId = match[2];
      const commentId = match[3];
      const revedditUrl = `https://www.reveddit.com/v/${sub}/comments/${postId}/${commentId ? commentId + '/' : ''}`;
      await chrome.tabs.create({ url: revedditUrl, openerTabId: tab?.id });
    } else {
      await chrome.tabs.create({ url: targetUrl, openerTabId: tab?.id });
    }
  }
});

// Helper for HTTP requests with timeouts and headers
async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// 1. Fetch Reddit Public Post Search (for user history)
async function fetchRedditPosts({ username, sort = 'new', t = null, after = null, limit = 25 }) {
  const q = `author:"${username}"`;
  let url = `https://api.reddit.com/search/?q=${encodeURIComponent(q)}&sort=${encodeURIComponent(sort)}&limit=${limit}`;
  if (sort === 'top' && t) {
    url += `&t=${encodeURIComponent(t)}`;
  }
  if (after) {
    url += `&after=${encodeURIComponent(after)}`;
  }

  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) RedditView/1.0' }
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error('USER_NOT_FOUND');
    if (res.status === 403) throw new Error('BANNED_OR_PRIVATE');
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`HTTP_${res.status}`);
  }

  const data = await res.json();
  const posts = (data?.data?.children || [])
    .filter((item) => item.kind === 't3')
    .map((item) => item.data);

  return {
    posts,
    after: data?.data?.after || null
  };
}

// 2. Fetch Reddit Public Comments HTML (Shreddit search)
async function fetchRedditCommentsHtml(targetUrl) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (e) {
    throw new Error('INVALID_URL');
  }

  if (parsed.origin !== 'https://www.reddit.com' || !parsed.pathname.startsWith('/svc/shreddit/search/')) {
    throw new Error('UNAUTHORIZED_ENDPOINT');
  }

  const res = await fetchWithTimeout(parsed.href, {
    credentials: 'include',
    headers: { Accept: 'text/vnd.reddit.partial+html, text/html;q=0.9' }
  });

  if (!res.ok) {
    if (res.status === 429) throw new Error('RATE_LIMITED');
    throw new Error(`HTTP_${res.status}`);
  }

  return await res.text();
}

// 3. Subreddit Icon Lookup
async function fetchSubredditIcon(subreddit) {
  const cleanSub = subreddit.replace(/^r\//, '');
  const url = `https://api.reddit.com/r/${encodeURIComponent(cleanSub)}/about`;
  const res = await fetchWithTimeout(url, {
    headers: { Accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`HTTP_${res.status}`);

  const data = await res.json();
  const d = data?.data || {};
  let icon = d.community_icon || d.icon_img || null;
  if (icon) icon = icon.split('&amp;').join('&');
  return icon;
}

// 4. Deleted Comment Lookup (Arctic Shift + Pullpush fallback)
async function fetchDeletedComment(rawId, preferredArchive = 'auto') {
  const cleanId = rawId.replace(/^t1_/i, '');
  if (!cleanId) throw new Error('MISSING_COMMENT_ID');

  // Try Arctic Shift first unless specifically configured for Pullpush
  if (preferredArchive !== 'pullpush') {
    try {
      const arcticUrl = `https://arctic-shift.photon-reddit.com/api/comments/ids?ids=${cleanId}`;
      const res = await fetchWithTimeout(arcticUrl, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        const item = Array.isArray(json?.data) ? json.data[0] : (json?.data || json[0]);
        if (item && item.body && item.body !== '[deleted]' && item.body !== '[removed]') {
          return {
            source: 'Arctic Shift',
            id: item.id || cleanId,
            author: item.author || '[unknown]',
            body: item.body,
            created_utc: item.created_utc,
            score: item.score ?? 0,
            subreddit: item.subreddit || '',
            permalink: item.permalink || ''
          };
        }
      }
    } catch (err) {
      console.warn('Arctic Shift comment lookup failed, trying fallback:', err.message);
    }
  }

  // Fallback: Pullpush
  if (preferredArchive !== 'arctic') {
    try {
      const pullpushUrl = `https://api.pullpush.io/reddit/search/comment/?ids=${cleanId}`;
      const res = await fetchWithTimeout(pullpushUrl, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        const item = (json?.data && json.data[0]) || null;
        if (item && item.body && item.body !== '[deleted]' && item.body !== '[removed]') {
          return {
            source: 'Pullpush',
            id: item.id || cleanId,
            author: item.author || '[unknown]',
            body: item.body,
            created_utc: item.created_utc,
            score: item.score ?? 0,
            subreddit: item.subreddit || '',
            permalink: item.permalink || ''
          };
        }
      }
    } catch (err) {
      console.warn('Pullpush comment lookup failed:', err.message);
    }
  }

  throw new Error('NOT_FOUND_IN_ARCHIVE');
}

// 5. Batch Deleted Comments Lookup (for whole threads)
async function fetchBatchDeletedComments(rawIds) {
  const cleanIds = rawIds.map((id) => id.replace(/^t1_/i, '')).filter(Boolean);
  if (!cleanIds.length) return [];

  const foundMap = new Map();
  // Fetch up to 50 at a time from Arctic Shift
  const chunks = [];
  for (let i = 0; i < cleanIds.length; i += 50) {
    chunks.push(cleanIds.slice(i, i + 50));
  }

  for (const chunk of chunks) {
    try {
      const url = `https://arctic-shift.photon-reddit.com/api/comments/ids?ids=${chunk.join(',')}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : (Array.isArray(json) ? json : []);
        items.forEach((item) => {
          if (item && item.id && item.body && item.body !== '[deleted]' && item.body !== '[removed]') {
            foundMap.set(item.id, {
              source: 'Arctic Shift',
              id: item.id,
              author: item.author || '[unknown]',
              body: item.body,
              created_utc: item.created_utc,
              score: item.score ?? 0,
              subreddit: item.subreddit || '',
              permalink: item.permalink || ''
            });
          }
        });
      }
    } catch (e) {
      console.warn('Batch Arctic Shift fetch failed for chunk', e);
    }
  }

  // Any missing? Check Pullpush for remaining
  const missing = cleanIds.filter((id) => !foundMap.has(id));
  if (missing.length > 0 && missing.length <= 40) {
    try {
      const url = `https://api.pullpush.io/reddit/search/comment/?ids=${missing.join(',')}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 8000);
      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json?.data) ? json.data : [];
        items.forEach((item) => {
          if (item && item.id && item.body && item.body !== '[deleted]' && item.body !== '[removed]') {
            foundMap.set(item.id, {
              source: 'Pullpush',
              id: item.id,
              author: item.author || '[unknown]',
              body: item.body,
              created_utc: item.created_utc,
              score: item.score ?? 0,
              subreddit: item.subreddit || '',
              permalink: item.permalink || ''
            });
          }
        });
      }
    } catch (e) {
      console.warn('Batch Pullpush fetch failed for missing IDs', e);
    }
  }

  return Array.from(foundMap.values());
}

// 6. Deleted Post/Submission Lookup
async function fetchDeletedPost(rawId, preferredArchive = 'auto') {
  const cleanId = rawId.replace(/^t3_/i, '');
  if (!cleanId) throw new Error('MISSING_POST_ID');

  if (preferredArchive !== 'pullpush') {
    try {
      const arcticUrl = `https://arctic-shift.photon-reddit.com/api/posts/ids?ids=${cleanId}`;
      const res = await fetchWithTimeout(arcticUrl, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        const item = Array.isArray(json?.data) ? json.data[0] : (json?.data || json[0]);
        if (item) {
          return {
            source: 'Arctic Shift',
            id: item.id || cleanId,
            author: item.author || '[unknown]',
            title: item.title || '',
            selftext: item.selftext || '',
            created_utc: item.created_utc,
            score: item.score ?? 0,
            subreddit: item.subreddit || '',
            url: item.url || '',
            permalink: item.permalink || ''
          };
        }
      }
    } catch (err) {
      console.warn('Arctic Shift post lookup failed:', err.message);
    }
  }

  // Fallback: Pullpush
  if (preferredArchive !== 'arctic') {
    try {
      const pullpushUrl = `https://api.pullpush.io/reddit/search/submission/?ids=${cleanId}`;
      const res = await fetchWithTimeout(pullpushUrl, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        const item = (json?.data && json.data[0]) || null;
        if (item) {
          return {
            source: 'Pullpush',
            id: item.id || cleanId,
            author: item.author || '[unknown]',
            title: item.title || '',
            selftext: item.selftext || '',
            created_utc: item.created_utc,
            score: item.score ?? 0,
            subreddit: item.subreddit || '',
            url: item.url || '',
            permalink: item.permalink || ''
          };
        }
      }
    } catch (err) {
      console.warn('Pullpush post lookup failed:', err.message);
    }
  }

  throw new Error('NOT_FOUND_IN_ARCHIVE');
}

// 7. Search User History directly from Archives (Arctic Shift / Pullpush)
async function fetchUserArchive({ username, type = 'all', limit = 25 }) {
  const result = { posts: [], comments: [] };

  if (type === 'all' || type === 'posts') {
    try {
      const url = `https://arctic-shift.photon-reddit.com/api/posts/search?author=${encodeURIComponent(username)}&limit=${limit}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        result.posts = Array.isArray(json?.data) ? json.data : [];
      }
    } catch (e) {
      // Pullpush fallback
      try {
        const pUrl = `https://api.pullpush.io/reddit/search/submission/?author=${encodeURIComponent(username)}&size=${limit}`;
        const pRes = await fetchWithTimeout(pUrl, { headers: { Accept: 'application/json' } }, 6000);
        if (pRes.ok) {
          const pJson = await pRes.json();
          result.posts = Array.isArray(pJson?.data) ? pJson.data : [];
        }
      } catch (err) {}
    }
  }

  if (type === 'all' || type === 'comments') {
    try {
      const url = `https://arctic-shift.photon-reddit.com/api/comments/search?author=${encodeURIComponent(username)}&limit=${limit}`;
      const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 6000);
      if (res.ok) {
        const json = await res.json();
        result.comments = Array.isArray(json?.data) ? json.data : [];
      }
    } catch (e) {
      // Pullpush fallback
      try {
        const pUrl = `https://api.pullpush.io/reddit/search/comment/?author=${encodeURIComponent(username)}&size=${limit}`;
        const pRes = await fetchWithTimeout(pUrl, { headers: { Accept: 'application/json' } }, 6000);
        if (pRes.ok) {
          const pJson = await pRes.json();
          result.comments = Array.isArray(pJson?.data) ? pJson.data : [];
        }
      } catch (err) {}
    }
  }

  return result;
}

// Global Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  (async () => {
    try {
      const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
      const preferredArchive = settings.preferredArchive || 'auto';

      switch (message.type) {
        case 'REDDITVIEW_FETCH_POSTS': {
          const data = await fetchRedditPosts(message.payload);
          sendResponse({ ok: true, data });
          break;
        }

        case 'REDDITVIEW_FETCH_COMMENTS': {
          const html = await fetchRedditCommentsHtml(message.payload.url);
          sendResponse({ ok: true, html });
          break;
        }

        case 'REDDITVIEW_FETCH_SUBREDDIT_ICON': {
          const icon = await fetchSubredditIcon(message.payload.subreddit);
          sendResponse({ ok: true, icon });
          break;
        }

        case 'REDDITVIEW_FETCH_DELETED_COMMENT': {
          const comment = await fetchDeletedComment(message.payload.id, preferredArchive);
          sendResponse({ ok: true, comment });
          break;
        }

        case 'REDDITVIEW_FETCH_BATCH_DELETED_COMMENTS': {
          const comments = await fetchBatchDeletedComments(message.payload.ids);
          sendResponse({ ok: true, comments });
          break;
        }

        case 'REDDITVIEW_FETCH_DELETED_POST': {
          const post = await fetchDeletedPost(message.payload.id, preferredArchive);
          sendResponse({ ok: true, post });
          break;
        }

        case 'REDDITVIEW_FETCH_USER_ARCHIVE': {
          const archive = await fetchUserArchive(message.payload);
          sendResponse({ ok: true, archive });
          break;
        }

        case 'REDDITVIEW_GET_SETTINGS': {
          sendResponse({ ok: true, settings });
          break;
        }

        case 'REDDITVIEW_SET_SETTINGS': {
          await chrome.storage.local.set(message.payload);
          sendResponse({ ok: true });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'UNKNOWN_MESSAGE_TYPE' });
          break;
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message || 'REQUEST_FAILED' });
    }
  })();

  return true; // Keep message channel open for async response
});
