// RedditView - Archive API Client (Arctic Shift / Pullpush) (content/archive-api.js)

window.RedditViewArchiveApi = (function () {
  const state = window.RedditViewState;

  // 1. Fetch single deleted comment by ID
  async function fetchDeletedComment(id) {
    const cleanId = String(id).replace(/^t1_/i, '');
    if (state.deletedCommentCache.has(cleanId)) {
      return state.deletedCommentCache.get(cleanId);
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_DELETED_COMMENT',
          payload: { id: cleanId }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && response.ok && response.comment) {
            state.deletedCommentCache.set(cleanId, response.comment);
            resolve(response.comment);
          } else {
            reject(new Error(response?.error || 'Comment not found in public archives'));
          }
        }
      );
    });
  }

  // 2. Batch fetch deleted comments
  async function fetchBatchDeletedComments(ids) {
    if (!ids || !ids.length) return [];
    const cleanIds = ids.map((id) => String(id).replace(/^t1_/i, ''));

    // Check what's already cached
    const uncachedIds = cleanIds.filter((id) => !state.deletedCommentCache.has(id));

    if (uncachedIds.length > 0) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'REDDITVIEW_FETCH_BATCH_DELETED_COMMENTS',
            payload: { ids: uncachedIds }
          },
          (response) => {
            if (response && response.ok && Array.isArray(response.comments)) {
              response.comments.forEach((c) => {
                if (c && c.id) {
                  state.deletedCommentCache.set(c.id, c);
                }
              });
            }
            resolve();
          }
        );
      });
    }

    return cleanIds.map((id) => state.deletedCommentCache.get(id)).filter(Boolean);
  }

  // 3. Fetch single deleted post by ID
  async function fetchDeletedPost(id) {
    const cleanId = String(id).replace(/^t3_/i, '');
    if (state.deletedPostCache.has(cleanId)) {
      return state.deletedPostCache.get(cleanId);
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_DELETED_POST',
          payload: { id: cleanId }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && response.ok && response.post) {
            state.deletedPostCache.set(cleanId, response.post);
            resolve(response.post);
          } else {
            reject(new Error(response?.error || 'Post not found in public archives'));
          }
        }
      );
    });
  }

  // 4. Fetch user archive records (Arctic Shift / Pullpush)
  async function fetchUserArchive(username, type = 'all', limit = 25) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: 'REDDITVIEW_FETCH_USER_ARCHIVE',
          payload: { username, type, limit }
        },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (response && response.ok && response.archive) {
            resolve(response.archive);
          } else {
            reject(new Error(response?.error || 'User archive request failed'));
          }
        }
      );
    });
  }

  return {
    fetchDeletedComment,
    fetchBatchDeletedComments,
    fetchDeletedPost,
    fetchUserArchive
  };
})();
