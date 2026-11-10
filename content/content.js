// RedditView - Main Content Script Orchestrator (content/content.js)

(function () {
  const state = window.RedditViewState;
  const profileEngine = window.RedditViewProfile;
  const deletedEngine = window.RedditViewDeleted;

  // Initialize extension settings
  async function initSettings() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REDDITVIEW_GET_SETTINGS' }, (res) => {
        if (res && res.ok && res.settings) {
          state.settings = { ...state.settings, ...res.settings };
        }
        resolve();
      });
    });
  }

  // Handle SPA Navigation (Reddit uses custom pushState / popstate)
  function setupNavigationListener() {
    let lastUrl = location.href;

    const onLocationChange = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        state.resetProfileState();
        if (state.injectedPanel) {
          state.injectedPanel.remove();
          state.injectedPanel = null;
        }
        if (state.threadScanBar) {
          state.threadScanBar.remove();
          state.threadScanBar = null;
        }
        runAnalysis();
      }
    };

    // Monkey-patch history
    const origPushState = history.pushState;
    history.pushState = function (...args) {
      const res = origPushState.apply(this, args);
      window.dispatchEvent(new Event('redditview:locationchange'));
      return res;
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function (...args) {
      const res = origReplaceState.apply(this, args);
      window.dispatchEvent(new Event('redditview:locationchange'));
      return res;
    };

    window.addEventListener('popstate', onLocationChange);
    window.addEventListener('redditview:locationchange', onLocationChange);

    // Modern Reddit shreddit-app custom events
    window.addEventListener('shreddit:locationchange', onLocationChange);
  }

  // Keyboard shortcut listener: Ctrl+G / Cmd+G for Force Reveal on profiles
  function setupKeyboardShortcuts() {
    document.addEventListener(
      'keydown',
      (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
          // If on a profile page, toggle force reveal
          const profileCtx = window.RedditViewUtils.parseProfileContext();
          if (profileCtx) {
            e.preventDefault();
            e.stopImmediatePropagation();
            profileEngine.toggleForceReveal();
          }
        }
      },
      true
    );
  }

  // Floating Action Widget
  function ensureFloatingToolbar() {
    const profileCtx = window.RedditViewUtils.parseProfileContext();
    const postCtx = window.RedditViewUtils.parsePostContext();

    if (!profileCtx && !postCtx) {
      if (state.floatingToolbar) {
        state.floatingToolbar.remove();
        state.floatingToolbar = null;
      }
      return;
    }

    if (!state.floatingToolbar) {
      const tb = document.createElement('div');
      tb.id = 'redditview-floating-toolbar';
      tb.className = 'rv-floating-toolbar';
      document.body.appendChild(tb);
      state.floatingToolbar = tb;
    }

    if (profileCtx) {
      state.floatingToolbar.innerHTML = `
        <div class="rv-float-btn-group">
          <button type="button" class="rv-float-btn ${state.settings.forceRevealMode ? 'active' : ''}" id="rv-float-force-toggle" title="Toggle Force Reveal (Ctrl+G)">
            <span class="rv-icon">👁️</span>
            <span>${state.settings.forceRevealMode ? 'Force Reveal: ON' : 'Force Reveal Profile'}</span>
          </button>
        </div>
      `;

      const btn = state.floatingToolbar.querySelector('#rv-float-force-toggle');
      if (btn) {
        btn.addEventListener('click', () => {
          profileEngine.toggleForceReveal();
        });
      }
    } else if (postCtx) {
      state.floatingToolbar.innerHTML = `
        <div class="rv-float-btn-group">
          <button type="button" class="rv-float-btn" id="rv-float-scan-thread" title="Scan entire thread for deleted comments">
            <span class="rv-icon">🔍</span>
            <span>Scan Deleted Comments</span>
          </button>
        </div>
      `;

      const btn = state.floatingToolbar.querySelector('#rv-float-scan-thread');
      if (btn) {
        btn.addEventListener('click', () => {
          deletedEngine.scanThreadForDeleted();
        });
      }
    }
  }

  // Run page analysis (debounced)
  function runAnalysis() {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }

    state.debounceTimer = setTimeout(() => {
      const profileCtx = window.RedditViewUtils.parseProfileContext();
      const postCtx = window.RedditViewUtils.parsePostContext();

      if (profileCtx) {
        profileEngine.checkAndInject();
      } else if (postCtx) {
        deletedEngine.scanThreadForDeleted();
      }

      ensureFloatingToolbar();
    }, 250);
  }

  // DOM Mutation Observer
  function setupMutationObserver() {
    const observer = new MutationObserver(() => {
      runAnalysis();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Message listener from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'REDDITVIEW_TRIGGER_FORCE_REVEAL') {
      profileEngine.toggleForceReveal();
      sendResponse({ ok: true, forceMode: state.settings.forceRevealMode });
    } else if (msg.type === 'REDDITVIEW_TRIGGER_THREAD_SCAN') {
      deletedEngine.scanThreadForDeleted();
      sendResponse({ ok: true });
    } else if (msg.type === 'REDDITVIEW_SETTINGS_UPDATED') {
      state.settings = { ...state.settings, ...msg.settings };
      runAnalysis();
      sendResponse({ ok: true });
    }
    return true;
  });

  // Main entrypoint
  async function bootstrap() {
    await initSettings();
    setupNavigationListener();
    setupKeyboardShortcuts();
    runAnalysis();
    setupMutationObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
