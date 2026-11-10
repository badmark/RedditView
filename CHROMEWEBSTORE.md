# Chrome Web Store Listing — RedditView

> Last Updated: 2026-11-10

## Store Listing

**Extension Name** [REQUIRED]
RedditView - Hidden History & Deleted Posts

**Short Description** [REQUIRED]
View hidden user profiles, reveal deleted posts and comments inline, and inspect archived Reddit history directly on Reddit.

**Detailed Description** [REQUIRED]
RedditView is a lightweight browser enhancement that brings hidden profile feeds and deleted Reddit discussions back into view.

When browsing Reddit, user profiles often display an empty state or hide their post history, and threads frequently contain removed or deleted comments that break discussion context. RedditView surfaces this public and archived content seamlessly directly on the page.

Key Features:
- Reveals hidden user profile feeds (Overview, Posts, and Comments) directly within Reddit.
- Force Reveal Mode: Press Ctrl+G (or Cmd+G on Mac) to unhide and browse public post and comment history on any Reddit profile.
- Inline Deleted Comments Reveal: Adds an instant button beside [deleted] and [removed] comments in discussion threads to view the original text, author, and timestamp from public community archives.
- Thread Scanner: Quickly scans entire comment sections to restore all deleted comments with a single click.
- Supports both modern Reddit (shreddit) and old.reddit.com interfaces.
- Standalone search dashboard in the extension popup to lookup any username, inspect threads, and open direct mirrors (Ghostddit, Reveddit, Arctic Shift).

How to Use:
1. Browse to any Reddit user profile (e.g. reddit.com/user/username). If the profile feed is hidden or empty, RedditView automatically loads their public posts and comments.
2. In any comment thread with [deleted] comments, click "Reveal Archived Comment" or use the top banner to reveal all deleted comments at once.
3. Press Ctrl+G at any time on a profile page to toggle Force Reveal mode.
4. Click the extension toolbar icon to search usernames or lookup specific threads.

Privacy & Security:
RedditView does not collect, track, or sell any personal data or credentials. All searches and archive lookups connect directly to public Reddit search indexes and community archives.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Surfaces hidden Reddit user profile histories and deleted discussion comments directly within Reddit using public indexes and archives.

**Primary Language** [REQUIRED]
English

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | Ready | icons/icon-128.png |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Not created | |
| Small Promo Tile [RECOMMENDED] | 440×280 | ⬜ Not created | |
| Marquee Promo Tile | 1400×560 | ⬜ Not created | |

### Screenshot Notes
- Screenshot 1: Profile page showing revealed overview and post feed where Reddit originally displayed an empty feed state.
- Screenshot 2: Comment thread showing inline "Reveal Archived Comment" button and the restored blue archival banner showing original author and text.
- Screenshot 3: Extension popup dashboard with user lookup and current page controls.

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Saves user preferences such as auto-reveal toggles, force-mode preference, and selected archive provider locally on the device. |
| `contextMenus` | permissions | Allows users to right-click usernames or thread links to inspect their public archives. |
| `tabs` | permissions | Detects whether the current active tab is on a Reddit profile or comment thread to provide contextual quick actions in the popup. |
| `https://*.reddit.com/*` | host_permissions | Allows the content script to detect empty profile feeds, inject revealed history cards, and attach restore buttons to deleted comments. |
| `https://api.reddit.com/*` | host_permissions | Fetches public post searches and subreddit icon images to render revealed user history cards. |
| `https://arctic-shift.photon-reddit.com/*` | host_permissions | Queries public Arctic Shift historical archives to retrieve original text for deleted posts and comments. |
| `https://api.pullpush.io/*` | host_permissions | Provides secondary public archive fallback to look up deleted Reddit comment and submission records. |

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

RedditView operates entirely on the client side without telemetry, user accounts, or tracking.

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/mark/RedditView/blob/main/PRIVACY.md

## Distribution

**Visibility**: Public
**Regions**: All regions

## Developer Info

**Publisher Name** [REQUIRED]
RedditView Team

**Contact Email** [REQUIRED]
support@redditview.local

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-11-10 | Initial release with hidden profile unhide, inline deleted comment restoration, thread batch scanner, and popup lookup tool. | Draft |

## Review Notes

### Known Issues / Limitations
- Relies on public Reddit search index and community archives (Arctic Shift, Pullpush).
- Content that was never archived before deletion or permanently purged from all public search indexes cannot be recovered.
