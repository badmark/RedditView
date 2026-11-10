// RedditView - Utility Functions (content/utils.js)

window.RedditViewUtils = (function () {
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCount(num) {
    const n = Number(num);
    if (isNaN(n)) return '0';
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';
    const now = Math.floor(Date.now() / 1000);
    // Check if timestamp is in milliseconds vs seconds
    const ts = timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : Number(timestamp);
    const diff = Math.max(0, now - ts);

    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
    if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
    return `${Math.floor(diff / 31536000)}y ago`;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '';
    const ts = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
    return new Date(ts).toLocaleString();
  }

  function isOldReddit() {
    return location.hostname === 'old.reddit.com' || Boolean(document.getElementById('header-bottom-left'));
  }

  function getRedditOrigin() {
    return location.origin;
  }

  function cleanId(rawId) {
    if (!rawId) return '';
    return String(rawId).replace(/^(t[1-6]_)/i, '').trim();
  }

  // Parse Profile URL: /user/name, /u/name, /user/name/submitted, etc.
  function parseProfileContext(url = location.pathname) {
    const match = url.match(/^\/(?:user|u)\/([^/?#]+)(?:\/([^/?#]+))?/i);
    if (!match) return null;

    const username = match[1];
    let tab = (match[2] || 'overview').toLowerCase();
    if (tab === 'submitted') tab = 'posts';

    const params = new URLSearchParams(location.search);
    const sort = params.get('sort') || 'new';
    const t = params.get('t') || null;

    return { username, tab, sort, t };
  }

  // Parse Thread URL: /r/sub/comments/postId/...
  function parsePostContext(url = location.pathname) {
    const match = url.match(/^\/r\/([^/?#]+)\/comments\/([a-z0-9]+)(?:\/[^/?#]*\/([a-z0-9]+))?/i);
    if (!match) return null;
    return {
      subreddit: match[1],
      postId: match[2],
      commentId: match[3] || null
    };
  }

  // Render a safe subset of Reddit markdown
  function renderMarkdown(text) {
    if (!text) return '';
    // Escape HTML first
    let escaped = escapeHtml(text);

    // Code blocks ```code```
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre class="rv-code-block"><code>$1</code></pre>');
    // Inline code `code`
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="rv-inline-code">$1</code>');
    // Bold **text**
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic *text*
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Strikethrough ~~text~~
    escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // Quotes > text
    escaped = escaped.replace(/(?:^|\n)&gt;\s?(.*?)(?=\n|$)/g, '<blockquote class="rv-blockquote">$1</blockquote>');
    // Markdown links [text](url)
    escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="rv-link">$1</a>');
    // Line breaks
    escaped = escaped.replace(/\n\n+/g, '</p><p>');
    escaped = escaped.replace(/\n/g, '<br>');

    return `<p>${escaped}</p>`;
  }

  // Batch DOM manipulation with requestAnimationFrame
  async function batchDOM(fn) {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        fn();
        resolve();
      });
    });
  }

  return {
    escapeHtml,
    formatCount,
    formatTimeAgo,
    formatDate,
    isOldReddit,
    getRedditOrigin,
    cleanId,
    parseProfileContext,
    parsePostContext,
    renderMarkdown,
    batchDOM
  };
})();
