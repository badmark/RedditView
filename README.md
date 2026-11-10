# RedditView - Chrome Browser Extension

RedditView is a Manifest V3 browser extension that allows you to view Reddit user histories even when hidden by Reddit's interface, unearth deleted/removed posts and comments directly inline in discussion threads, and inspect public Reddit archives (like [Ghostddit](https://ghostddit.aeddit.com/), Arctic Shift, and Pullpush).

---

## Features

### 1. View Hidden User Histories (Ghostddit-style inline unhide)
- When visiting a user profile (`reddit.com/user/<username>` or `reddit.com/u/<username>`) where Reddit displays its empty-state message ("looks like nobody has posted" / hidden feed), RedditView automatically queries Reddit's public search index (`author:"<username>"`) and surfaces their public posts, comments, and overview inline!
- **Overview, Posts, and Comments tabs**: View posts and comments interleaved or filtered by tab with infinite scroll pagination.
- **Force Reveal Mode (`Ctrl+G` or `Cmd+G`)**: A global toggle that forces RedditView's feed onto any profile (even profiles that Reddit is rendering normally).
- **Direct Archive Mirrors**: Instant header buttons to open the user on [Ghostddit](https://ghostddit.aeddit.com/), [Reveddit](https://www.reveddit.com/), and [Arctic Shift](https://arctic-shift.photon-reddit.com/).

### 2. Inline Deleted Comments & Posts Revealer
- In any Reddit comment thread (both modern Shreddit and `old.reddit.com`), RedditView detects `[deleted]` and `[removed]` comments.
- Attaches an inline **`[Reveal Archived Comment]`** button directly to the comment.
- When clicked, queries community archives (**Arctic Shift** and **Pullpush**) to restore the original author, creation date, upvote score, and original text in an eye-catching restored block.
- **Thread Scanner**: Adds a thread action bar at the top of comment sections (`RedditView detected X deleted comments`) with a 1-click **"Reveal All Deleted Comments"** batch button.
- **Deleted Post (OP) Revealer**: Detects deleted submissions and unhides the original title and selftext from archives.

### 3. Extension Popup Dashboard
- Click the extension icon in your browser toolbar to:
  - View detected context for the current tab (Profile or Thread).
  - One-click trigger for Force Reveal or Thread Scan.
  - **User Lookup**: Search any Reddit username directly in the popup to see their public and archived submissions and comments.
  - **Thread Lookup**: Paste any Reddit URL or comment ID (e.g. `12345` or `t1_12345`) to fetch the archived content instantly.
  - **Settings**: Toggle auto-reveal, deleted comment buttons, force mode, and choose your preferred archive provider (Auto-fallback, Arctic Shift, or Pullpush).

---

## Installation (Chromium: Chrome, Brave, Edge, Opera)

1. Clone or download this folder to your machine:
   ```bash
   /home/mark/Projects/RedditView
   ```
2. Open Chrome (or any Chromium browser) and navigate to `chrome://extensions`.
3. In the top-right corner, enable **Developer mode** toggle.
4. Click the **Load unpacked** button in the top-left.
5. Select this folder (`/home/mark/Projects/RedditView`).
6. The extension is now loaded and active!

---

## How It Works

1. **Hidden User Histories**:
   - Reddit's profile pages often display an empty state for certain accounts or privacy settings. However, Reddit's public search index still indexes public posts and comments.
   - RedditView queries `https://api.reddit.com/search/?q=author:"<username>"` and Reddit's comment search service, rendering native cards without needing an external scraping server.
2. **Deleted Content**:
   - Truly deleted or removed content is no longer served by Reddit's active servers.
   - RedditView queries historical community archives: **Arctic Shift** (`arctic-shift.photon-reddit.com`) and **Pullpush** (`api.pullpush.io`), which continuously archive the public Reddit firehose.
   - If an item was archived before deletion, its original author, score, and body text are retrieved and injected directly into the page.

---

## Project Structure

```
RedditView/
├── manifest.json              # Manifest V3 extension configuration
├── icons/                     # Extension icons (16px, 48px, 128px PNGs)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── background/
│   └── background.js          # Service worker handling API proxying & context menus
├── content/
│   ├── state.js               # State & caches
│   ├── utils.js               # TimeAgo, escaping, markdown renderer, DOM helpers
│   ├── reddit-api.js          # Public Reddit search API client
│   ├── archive-api.js         # Arctic Shift & Pullpush archive client
│   ├── profile-reveal.js      # Hidden profile detector & feed injector
│   ├── deleted-reveal.js      # Deleted comment & thread scanner
│   ├── content.js             # Navigation handler, keyboard shortcuts, SPA observer
│   └── content.css            # Styles for injected panels, badges, and restored cards
├── popup/
│   ├── popup.html             # Extension dashboard interface
│   ├── popup.css              # Dashboard styles
│   └── popup.js               # Dashboard controller
├── CHROMEWEBSTORE.md          # Chrome Web Store listing & permissions justification
└── README.md                  # This documentation
```

---

## Keyboard Shortcuts

- **`Ctrl+G`** (or **`Cmd+G`** on macOS): Toggle Force-Reveal mode on any Reddit profile page.
