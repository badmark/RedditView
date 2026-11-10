// RedditView - State Management (content/state.js)

window.RedditViewState = window.RedditViewState || {
  // Caches
  iconCache: new Map(),
  deletedCommentCache: new Map(),
  deletedPostCache: new Map(),
  seenItemIds: new Set(),

  // Current page context
  isProfilePage: false,
  isPostPage: false,
  currentUsername: null,
  currentTab: 'overview', // 'overview' | 'posts' | 'comments' | 'archived'
  currentSort: 'new',
  currentPostId: null,

  // Profile pagination & loading state
  postsAfter: null,
  nextCommentsUrl: null,
  isLoading: false,
  isExhausted: false,
  generation: 0,

  // Settings
  settings: {
    autoRevealProfile: true,
    showDeletedButtons: true,
    forceRevealMode: false,
    preferredArchive: 'auto',
    highlightDeletedComments: true
  },

  // DOM Elements & Observers
  injectedPanel: null,
  floatingToolbar: null,
  threadScanBar: null,
  observer: null,
  debounceTimer: null,

  // Reset state on navigation
  resetProfileState() {
    this.postsAfter = null;
    this.nextCommentsUrl = null;
    this.isLoading = false;
    this.isExhausted = false;
    this.seenItemIds.clear();
    this.generation++;
  }
};
