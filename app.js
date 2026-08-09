import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3pgUsvYHHqyWP9Zy7GIUvi0UWTeHV6dA",
  authDomain: "rafaazhimi-github-io.firebaseapp.com",
  projectId: "rafaazhimi-github-io",
  storageBucket: "rafaazhimi-github-io.firebasestorage.app",
  messagingSenderId: "943032630083",
  appId: "1:943032630083:web:ffc1cfb4f4a67102ff8df6",
  measurementId: "G-35E0DPLQZ2"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const FIRESTORE_COLLECTIONS = {
  post: "posts",
  discussion: "discussions",
  comment: "comments"
};

function itemRef(itemType, itemId) {
  const collectionName = FIRESTORE_COLLECTIONS[itemType];

  if (!collectionName) {
    throw new Error("Unknown item type.");
  }

  return doc(db, collectionName, itemId);
}

function snapshotToItems(snapshot) {
  return snapshot.docs.map((snapshotDoc) => ({
    ...snapshotDoc.data(),
    id: snapshotDoc.id
  }));
}

async function createRecord(collectionName, data) {
  const recordRef = doc(collection(db, collectionName));
  await setDoc(recordRef, {
    ...data,
    id: recordRef.id
  });
  return recordRef.id;
}

async function applyCommentCountDelta(itemType, itemId, delta) {
  if (!itemType || !itemId || !FIRESTORE_COLLECTIONS[itemType]) {
    return;
  }

  try {
    await updateDoc(itemRef(itemType, itemId), {
      commentCount: increment(delta)
    });
  } catch (error) {
    console.warn("Comment count update skipped.", error);
  }
}

// Bridge Firebase functions to the UI controller without changing the project config.
window.communityFirebase = {
  auth: {
    signUp: async ({ username, password }) => {
      const email = `${username.toLowerCase()}@app.local`;
      const res = await createUserWithEmailAndPassword(auth, email, password);
      return { uid: res.user.uid, username };
    },
    signIn: async ({ username, password }) => {
      const email = `${username.toLowerCase()}@app.local`;
      const res = await signInWithEmailAndPassword(auth, email, password);
      return { uid: res.user.uid, username };
    },
    signOut: () => signOut(auth),
    onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback)
  },
  firestore: {
    listPosts: async () => {
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snapshotToItems(snap);
    },
    createPost: async (data) => createRecord("posts", data),
    updatePost: async (id, data) => {
      await updateDoc(doc(db, "posts", id), data);
    },
    deletePost: async (id) => {
      await deleteDoc(doc(db, "posts", id));
    },
    listDiscussions: async () => {
      const q = query(collection(db, "discussions"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snapshotToItems(snap);
    },
    createDiscussion: async (data) => createRecord("discussions", data),
    updateDiscussion: async (id, data) => {
      await updateDoc(doc(db, "discussions", id), data);
    },
    deleteDiscussion: async (id) => {
      await deleteDoc(doc(db, "discussions", id));
    },
    listComments: async (targetId) => {
      const q = query(collection(db, "comments"), where("targetId", "==", targetId));
      const snap = await getDocs(q);
      return snapshotToItems(snap);
    },
    createComment: async (data) => {
      const commentId = await createRecord("comments", data);
      await applyCommentCountDelta(data.parentType, data.targetId, 1);

      if (data.rootId && data.rootId !== data.targetId) {
        await applyCommentCountDelta(data.rootType, data.rootId, 1);
      }

      return commentId;
    },
    updateComment: async (id, data) => {
      await updateDoc(doc(db, "comments", id), data);
    },
    deleteComment: async (id) => {
      const commentRef = doc(db, "comments", id);
      const snap = await getDoc(commentRef);
      const commentData = snap.exists() ? snap.data() : null;

      await deleteDoc(commentRef);

      if (commentData) {
        await applyCommentCountDelta(commentData.parentType || "comment", commentData.targetId, -1);

        if (commentData.rootId && commentData.rootId !== commentData.targetId) {
          await applyCommentCountDelta(commentData.rootType, commentData.rootId, -1);
        }
      }
    },
    listUserVotes: async (uid) => {
      const q = query(collection(db, "votes"), where("authorUid", "==", uid));
      const snap = await getDocs(q);
      return snapshotToItems(snap);
    },
    setVote: async ({ itemType, itemId, authorUid, value }) => {
      const normalizedValue = value === -1 ? -1 : 1;
      const voteId = `${authorUid}_${itemType}_${itemId}`.replace(/\//g, "_");
      const voteRef = doc(db, "votes", voteId);
      const voteSnap = await getDoc(voteRef);
      const previousValue = voteSnap.exists() ? Number(voteSnap.data().value) || 0 : 0;
      const nextValue = previousValue === normalizedValue ? 0 : normalizedValue;
      const delta = nextValue - previousValue;

      if (nextValue === 0) {
        if (voteSnap.exists()) {
          await deleteDoc(voteRef);
        }
      } else {
        await setDoc(voteRef, {
          id: voteId,
          targetId: itemId,
          itemType,
          authorUid,
          value: nextValue,
          updatedAt: new Date().toISOString()
        });
      }

      if (delta !== 0) {
        await updateDoc(itemRef(itemType, itemId), {
          score: increment(delta)
        });
      }

      return { value: nextValue, delta };
    }
  }
};

// --- FORUM UI CONTROLLER ---
(function () {
    "use strict";

    const ADMIN_USERNAME = "rafa.azhimi";
    const MAX_COMMENT_DEPTH = 5;
    const DEFAULT_MODELS = Object.freeze({
        user: Object.freeze({
            uid: "",
            username: "",
            createdAt: ""
        }),
        entry: Object.freeze({
            id: "",
            targetId: "",
            author: "",
            authorUid: "",
            title: "",
            content: "",
            externalLink: "",
            createdAt: "",
            score: 0,
            commentCount: 0
        })
    });

    const firebaseBridge = mergeFirebaseBridge(createDefaultFirebaseBridge(), window.communityFirebase || {});

    const state = {
        currentUser: null,
        posts: [],
        discussions: [],
        commentsByTarget: new Map(),
        expandedTargets: new Set(),
        openReplyForms: new Set(),
        userVotes: new Map(),
        editing: {
            post: null,
            discussion: null,
            comment: null
        }
    };

    const nodes = {};

    window.communityApp = {
        reloadPosts: loadPosts,
        reloadDiscussions: loadDiscussions,
        setAuthenticatedUser: setCurrentUser
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    function init() {
        cacheNodes();
        bindTabs();
        bindThemeToggle();
        bindAuth();
        bindPostForm();
        bindDiscussionForm();
        bindFeedActions();
        bindCommentForms();
        bootAuthObserver();
        loadPosts();
        loadDiscussions();
    }

    function cacheNodes() {
        nodes.tabButtons = Array.from(document.querySelectorAll("[data-tab-target]"));
        nodes.views = Array.from(document.querySelectorAll("[data-view]"));
        nodes.themeToggle = document.getElementById("theme-toggle");
        nodes.sessionChip = document.getElementById("session-chip");
        nodes.postsFeed = document.getElementById("posts-feed");
        nodes.postsCount = document.getElementById("posts-count");
        nodes.postsStatus = document.getElementById("posts-status");
        nodes.postForm = document.getElementById("post-form");
        nodes.postFieldset = document.getElementById("post-fieldset");
        nodes.postFormStatus = document.getElementById("post-form-status");
        nodes.postSubmitButton = document.getElementById("post-submit-button");
        nodes.postCancelEdit = document.getElementById("post-cancel-edit");
        nodes.discussionsFeed = document.getElementById("discussions-feed");
        nodes.discussionsCount = document.getElementById("discussions-count");
        nodes.discussionsStatus = document.getElementById("discussions-status");
        nodes.discussionForm = document.getElementById("discussion-form");
        nodes.discussionFieldset = document.getElementById("discussion-fieldset");
        nodes.discussionFormStatus = document.getElementById("discussion-form-status");
        nodes.discussionSubmitButton = document.getElementById("discussion-submit-button");
        nodes.discussionCancelEdit = document.getElementById("discussion-cancel-edit");
        nodes.authForm = document.getElementById("auth-form");
        nodes.profileStatus = document.getElementById("profile-status");
        nodes.signOutButton = document.getElementById("sign-out-button");
    }

    function bindTabs() {
        nodes.tabButtons.forEach((button) => {
            button.addEventListener("click", () => setActiveTab(button.dataset.tabTarget));
        });

        const hashTab = window.location.hash.replace("#", "");

        if (["posts", "discussions", "settings"].includes(hashTab)) {
            setActiveTab(hashTab, false);
        }
    }

    function setActiveTab(tabName, updateHash = true) {
        nodes.tabButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.tabTarget === tabName);
        });

        nodes.views.forEach((view) => {
            view.classList.toggle("is-active", view.dataset.view === tabName);
        });

        if (updateHash) {
            window.history.replaceState(null, "", `#${tabName}`);
        }
    }

    function bindThemeToggle() {
        nodes.themeToggle.addEventListener("change", () => {
            const theme = nodes.themeToggle.checked ? "dark" : "light";
            document.documentElement.dataset.theme = theme;
            nodes.themeToggle.closest("label").querySelector(".toggle-label").textContent = theme === "dark" ? "Dark" : "Light";
        });
    }

    function bindAuth() {
        nodes.authForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const submitter = event.submitter;
            const action = submitter && submitter.dataset.authAction === "signup" ? "signup" : "login";
            const formData = new FormData(nodes.authForm);
            const credentials = {
                username: String(formData.get("username") || "").trim(),
                password: String(formData.get("password") || "")
            };

            if (!credentials.username || !credentials.password) {
                renderProfileStatus("Username and password are required.");
                return;
            }

            setAuthFormBusy(true);
            renderProfileStatus(action === "signup" ? "Creating account..." : "Logging in...");

            try {
                const user = action === "signup"
                    ? await firebaseBridge.auth.signUp(credentials)
                    : await firebaseBridge.auth.signIn(credentials);

                if (user) {
                    await setCurrentUser(normalizeUser(user, credentials.username));
                }
            } catch (error) {
                renderProfileStatus(getErrorMessage(error));
            } finally {
                setAuthFormBusy(false);
            }
        });

        nodes.signOutButton.addEventListener("click", async () => {
            renderProfileStatus("Signing out...");

            try {
                await firebaseBridge.auth.signOut();
                await setCurrentUser(null);
            } catch (error) {
                renderProfileStatus(getErrorMessage(error));
            }
        });
    }

    function bindPostForm() {
        nodes.postForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!isOfficialPostAdmin()) {
                setText(nodes.postFormStatus, "Only rafa.azhimi can create official posts.");
                return;
            }

            const payload = getComposerPayload(nodes.postForm);

            if (!payload.title || !payload.content) {
                setText(nodes.postFormStatus, "Title and text content are required.");
                return;
            }

            try {
                if (state.editing.post) {
                    setText(nodes.postFormStatus, "Saving post...");
                    await firebaseBridge.firestore.updatePost(state.editing.post.id, payload);
                    resetPostForm();
                    setText(nodes.postFormStatus, "Post updated.");
                } else {
                    setText(nodes.postFormStatus, "Creating post...");
                    await firebaseBridge.firestore.createPost(createEntryModel({
                        ...payload,
                        targetId: "posts",
                        author: state.currentUser.username,
                        authorUid: state.currentUser.uid
                    }));
                    nodes.postForm.reset();
                    setText(nodes.postFormStatus, "Post created.");
                }

                await loadPosts();
            } catch (error) {
                setText(nodes.postFormStatus, getErrorMessage(error));
            }
        });

        nodes.postCancelEdit.addEventListener("click", () => {
            resetPostForm();
            renderPosts();
        });
    }

    function bindDiscussionForm() {
        nodes.discussionForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!state.currentUser) {
                setText(nodes.discussionFormStatus, "Log in to create a discussion.");
                return;
            }

            const payload = getComposerPayload(nodes.discussionForm);

            if (!payload.title || !payload.content) {
                setText(nodes.discussionFormStatus, "Title and text content are required.");
                return;
            }

            try {
                if (state.editing.discussion) {
                    setText(nodes.discussionFormStatus, "Saving discussion...");
                    await firebaseBridge.firestore.updateDiscussion(state.editing.discussion.id, payload);
                    resetDiscussionForm();
                    setText(nodes.discussionFormStatus, "Discussion updated.");
                } else {
                    setText(nodes.discussionFormStatus, "Creating discussion...");
                    await firebaseBridge.firestore.createDiscussion(createEntryModel({
                        ...payload,
                        targetId: "discussions",
                        author: state.currentUser.username,
                        authorUid: state.currentUser.uid
                    }));
                    nodes.discussionForm.reset();
                    setText(nodes.discussionFormStatus, "Discussion submitted.");
                }

                await loadDiscussions();
            } catch (error) {
                setText(nodes.discussionFormStatus, getErrorMessage(error));
            }
        });

        nodes.discussionCancelEdit.addEventListener("click", () => {
            resetDiscussionForm();
            renderDiscussions();
        });
    }

    function bindFeedActions() {
        document.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const action = button.dataset.action;

            if (action === "toggle-comments") {
                await toggleComments(button.dataset.targetId);
                return;
            }

            if (action === "toggle-reply") {
                toggleReplyForm(button.dataset.targetId);
                return;
            }

            if (action === "cancel-reply") {
                state.openReplyForms.delete(button.dataset.targetId);
                renderFeeds();
                return;
            }

            if (action === "vote") {
                await handleVote(button);
                return;
            }

            if (action === "edit-item") {
                beginItemEdit(button.dataset.itemType, button.dataset.itemId);
                return;
            }

            if (action === "delete-item") {
                await deleteItem(button.dataset.itemType, button.dataset.itemId);
                return;
            }

            if (action === "edit-comment") {
                beginCommentEdit(button.dataset.itemId);
                return;
            }

            if (action === "cancel-comment-edit") {
                state.editing.comment = null;
                renderFeeds();
                return;
            }

            if (action === "delete-comment") {
                await deleteComment(button.dataset.rootId, button.dataset.itemId);
            }
        });
    }

    function bindCommentForms() {
        document.addEventListener("submit", async (event) => {
            const form = event.target.closest(".comment-form");

            if (!form) {
                return;
            }

            event.preventDefault();

            if (!state.currentUser) {
                setText(form.querySelector("[data-comment-status]"), "Log in to reply.");
                return;
            }

            const payload = getCommentPayload(form);

            if (!payload.content) {
                setText(form.querySelector("[data-comment-status]"), "Text content is required.");
                return;
            }

            try {
                if (form.dataset.mode === "edit") {
                    const comment = findAnyComment(form.dataset.itemId);

                    if (!canMutate(comment)) {
                        return;
                    }

                    setText(form.querySelector("[data-comment-status]"), "Saving reply...");
                    await firebaseBridge.firestore.updateComment(comment.id, {
                        content: payload.content,
                        externalLink: payload.externalLink
                    });
                    state.editing.comment = null;
                } else {
                    const rootId = form.dataset.rootId;
                    setText(form.querySelector("[data-comment-status]"), "Submitting reply...");
                    await firebaseBridge.firestore.createComment(createEntryModel({
                        targetId: form.dataset.targetId,
                        rootId,
                        rootType: form.dataset.rootType,
                        parentType: form.dataset.parentType,
                        depth: Number(form.dataset.depth) || 1,
                        author: state.currentUser.username,
                        authorUid: state.currentUser.uid,
                        title: "",
                        content: payload.content,
                        externalLink: payload.externalLink
                    }));
                    form.reset();
                    incrementLocalCommentCount(rootId, form.dataset.rootType, form.dataset.targetId);
                }

                await refreshCommentsTree(form.dataset.rootId);
                renderFeeds();
            } catch (error) {
                setText(form.querySelector("[data-comment-status]"), getErrorMessage(error));
            }
        });
    }

    function bootAuthObserver() {
        try {
            firebaseBridge.auth.onAuthStateChanged(async (user) => {
                await setCurrentUser(user ? normalizeUser(user) : null);
            });
        } catch (error) {
            renderProfileStatus(getErrorMessage(error));
        }
    }

    async function loadPosts() {
        setText(nodes.postsStatus, "Loading posts...");

        try {
            const posts = await firebaseBridge.firestore.listPosts();
            state.posts = Array.isArray(posts)
                ? posts.map((item) => normalizeEntry(item, "post")).filter(Boolean).sort(sortByCreatedAtDesc)
                : [];
            setText(nodes.postsStatus, "");
            await refreshVisibleCommentTrees();
        } catch (error) {
            state.posts = [];
            setText(nodes.postsStatus, getErrorMessage(error, "Posts could not load from Firestore."));
        }

        renderPosts();
    }

    async function loadDiscussions() {
        setText(nodes.discussionsStatus, "Loading discussions...");

        try {
            const discussions = await firebaseBridge.firestore.listDiscussions();
            state.discussions = Array.isArray(discussions)
                ? discussions.map((item) => normalizeEntry(item, "discussion")).filter(Boolean).sort(sortByCreatedAtDesc)
                : [];
            setText(nodes.discussionsStatus, "");
            await refreshVisibleCommentTrees();
        } catch (error) {
            state.discussions = [];
            setText(nodes.discussionsStatus, getErrorMessage(error, "Discussions could not load from Firestore."));
        }

        renderDiscussions();
    }

    async function refreshUserVotes() {
        state.userVotes.clear();

        if (!state.currentUser) {
            return;
        }

        try {
            const votes = await firebaseBridge.firestore.listUserVotes(state.currentUser.uid);
            votes.forEach((vote) => {
                if (vote.targetId) {
                    state.userVotes.set(String(vote.targetId), Number(vote.value) || 0);
                }
            });
        } catch (error) {
            setActiveStatus(getErrorMessage(error, "Votes could not load."));
        }
    }

    async function refreshVisibleCommentTrees() {
        const targetIds = Array.from(state.expandedTargets);

        await Promise.all(targetIds.map((targetId) => refreshCommentsTree(targetId)));
    }

    async function refreshCommentsTree(rootId) {
        if (!rootId) {
            return;
        }

        await loadCommentLevel(rootId, 1);
    }

    async function loadCommentLevel(targetId, depth) {
        if (depth > MAX_COMMENT_DEPTH) {
            return;
        }

        const comments = await firebaseBridge.firestore.listComments(targetId);
        const normalizedComments = Array.isArray(comments)
            ? comments.map((comment) => normalizeEntry(comment, "comment")).filter(Boolean).sort(sortByCreatedAtAsc)
            : [];

        state.commentsByTarget.set(targetId, normalizedComments);

        await Promise.all(normalizedComments.map((comment) => loadCommentLevel(comment.id, depth + 1)));
    }

    function renderPosts() {
        setText(nodes.postsCount, pluralize(state.posts.length, "post"));
        renderCountSidebar();
        renderAuthState();
        clearNode(nodes.postsFeed);

        if (state.posts.length === 0) {
            nodes.postsFeed.append(createEmptyState("No official posts found."));
            return;
        }

        state.posts.forEach((post) => {
            nodes.postsFeed.append(createItemCard(post, "post"));
        });
    }

    function renderDiscussions() {
        setText(nodes.discussionsCount, pluralize(state.discussions.length, "discussion"));
        renderCountSidebar();
        renderAuthState();
        clearNode(nodes.discussionsFeed);

        if (state.discussions.length === 0) {
            nodes.discussionsFeed.append(createEmptyState("No discussions found."));
            return;
        }

        state.discussions.forEach((discussion) => {
            nodes.discussionsFeed.append(createItemCard(discussion, "discussion"));
        });
    }

    function renderFeeds() {
        renderPosts();
        renderDiscussions();
    }

    function createItemCard(item, itemType) {
        const card = createElement("article", {
            className: "card",
            dataset: {
                itemId: item.id,
                itemType
            }
        });

        const body = createElement("div", { className: "card-body" });
        const meta = itemType === "post"
            ? `Official post by ${item.author || ADMIN_USERNAME} on ${formatDate(item.createdAt)}`
            : `Started by ${item.author || "Unknown"} on ${formatDate(item.createdAt)}`;

        body.append(
            createElement("p", { className: "item-meta", text: meta }),
            createElement("h2", { className: "item-title", text: item.title || "Untitled" }),
            createElement("p", { className: "item-content", text: item.content || "" })
        );

        if (item.externalLink) {
            body.append(createExternalLinkBadge(item.externalLink));
        }

        body.append(createActionRow(item, itemType));
        body.append(createCommentsRegion(item, itemType));
        card.append(createVoteRail(item, itemType), body);

        return card;
    }

    function createVoteRail(item, itemType) {
        const voteValue = state.userVotes.get(item.id) || 0;
        const score = Number.isFinite(Number(item.score)) ? Number(item.score) : 0;
        const rail = createElement("div", {
            className: itemType === "comment" ? "vote-rail comment-vote-rail" : "vote-rail",
            ariaLabel: "Voting"
        });
        const upButton = createElement("button", {
            className: voteValue === 1 ? "vote-button is-upvoted" : "vote-button",
            type: "button",
            text: "\u25B2",
            ariaLabel: "Upvote",
            dataset: {
                action: "vote",
                voteValue: "1",
                itemId: item.id,
                itemType
            }
        });
        const count = createElement("span", {
            className: voteValue === 1 ? "vote-count is-upvoted" : voteValue === -1 ? "vote-count is-downvoted" : "vote-count",
            text: String(score)
        });
        const downButton = createElement("button", {
            className: voteValue === -1 ? "vote-button is-downvoted" : "vote-button",
            type: "button",
            text: "\u25BC",
            ariaLabel: "Downvote",
            dataset: {
                action: "vote",
                voteValue: "-1",
                itemId: item.id,
                itemType
            }
        });

        rail.append(upButton, count, downButton);
        return rail;
    }

    function createActionRow(item, itemType) {
        const actionRow = createElement("div", { className: "action-row" });

        actionRow.append(createElement("button", {
            className: "action-button",
            type: "button",
            text: `Comments (${getThreadCommentCount(item)})`,
            dataset: {
                action: "toggle-comments",
                targetId: item.id
            }
        }));

        if (canMutate(item)) {
            actionRow.append(
                createElement("button", {
                    className: "action-button",
                    type: "button",
                    text: "Edit",
                    dataset: {
                        action: "edit-item",
                        itemType,
                        itemId: item.id
                    }
                }),
                createElement("button", {
                    className: "action-button danger-button",
                    type: "button",
                    text: "Delete",
                    dataset: {
                        action: "delete-item",
                        itemType,
                        itemId: item.id
                    }
                })
            );
        }

        return actionRow;
    }

    function createCommentsRegion(item, itemType) {
        const region = createElement("div", {
            className: state.expandedTargets.has(item.id) ? "comments-region is-open" : "comments-region"
        });

        const list = createElement("div", { className: "comment-list" });
        const comments = state.commentsByTarget.get(item.id) || [];

        if (comments.length === 0) {
            list.append(createElement("p", { className: "empty-state", text: "No comments yet." }));
        } else {
            comments.forEach((comment) => {
                list.append(createComment(comment, {
                    rootId: item.id,
                    rootType: itemType,
                    depth: 1
                }));
            });
        }

        region.append(
            list,
            createCommentForm({
                mode: "reply",
                targetId: item.id,
                rootId: item.id,
                rootType: itemType,
                parentType: itemType,
                depth: 1,
                submitText: "Reply"
            })
        );

        return region;
    }

    function createComment(comment, context) {
        const depth = Math.min(context.depth, MAX_COMMENT_DEPTH);
        const wrapper = createElement("article", {
            className: "comment",
            dataset: {
                itemId: comment.id
            }
        });
        wrapper.style.setProperty("--depth", String(depth));

        const body = createElement("div", { className: "comment-body" });
        body.append(
            createElement("p", {
                className: "item-meta",
                text: `${comment.author || "Unknown"} on ${formatDate(comment.createdAt)}`
            }),
            createElement("p", { text: comment.content || "" })
        );

        if (comment.externalLink) {
            body.append(createExternalLinkBadge(comment.externalLink));
        }

        body.append(createCommentActions(comment, context.rootId, depth));

        if (state.editing.comment === comment.id) {
            body.append(createCommentForm({
                mode: "edit",
                targetId: comment.targetId,
                rootId: context.rootId,
                rootType: context.rootType,
                parentType: comment.parentType || "comment",
                depth,
                itemId: comment.id,
                submitText: "Save reply",
                content: comment.content,
                externalLink: comment.externalLink
            }));
        } else if (state.openReplyForms.has(comment.id) && depth < MAX_COMMENT_DEPTH) {
            body.append(createCommentForm({
                mode: "reply",
                targetId: comment.id,
                rootId: context.rootId,
                rootType: context.rootType,
                parentType: "comment",
                depth: depth + 1,
                submitText: "Reply"
            }));
        }

        const children = state.commentsByTarget.get(comment.id) || [];

        if (children.length > 0 && depth < MAX_COMMENT_DEPTH) {
            const childList = createElement("div", { className: "comment-children" });
            childList.style.setProperty("--depth", String(depth));
            children.forEach((child) => {
                childList.append(createComment(child, {
                    rootId: context.rootId,
                    rootType: context.rootType,
                    depth: depth + 1
                }));
            });
            body.append(childList);
        }

        wrapper.append(createVoteRail(comment, "comment"), body);
        return wrapper;
    }

    function createCommentActions(comment, rootId, depth) {
        const actions = createElement("div", { className: "action-row" });

        if (depth < MAX_COMMENT_DEPTH) {
            actions.append(createElement("button", {
                className: "action-button",
                type: "button",
                text: "Reply",
                dataset: {
                    action: "toggle-reply",
                    targetId: comment.id
                }
            }));
        }

        if (canMutate(comment)) {
            actions.append(
                createElement("button", {
                    className: "action-button",
                    type: "button",
                    text: "Edit",
                    dataset: {
                        action: "edit-comment",
                        itemId: comment.id
                    }
                }),
                createElement("button", {
                    className: "action-button danger-button",
                    type: "button",
                    text: "Delete",
                    dataset: {
                        action: "delete-comment",
                        rootId,
                        itemId: comment.id
                    }
                })
            );
        }

        return actions;
    }

    function createCommentForm(options) {
        const isEdit = options.mode === "edit";
        const form = createElement("form", {
            className: isEdit ? "comment-form is-inline-edit" : options.targetId === options.rootId ? "comment-form" : "comment-form is-reply",
            dataset: {
                mode: options.mode,
                targetId: options.targetId,
                rootId: options.rootId,
                rootType: options.rootType,
                parentType: options.parentType,
                depth: String(options.depth),
                itemId: options.itemId || ""
            }
        });
        const suffix = cssSafeId(`${options.mode}-${options.itemId || options.targetId}`);
        const contentId = `comment-content-${suffix}`;
        const linkId = `comment-link-${suffix}`;
        const fieldset = createElement("fieldset", { disabled: !state.currentUser });
        const buttonRow = createElement("div", { className: "button-row" });

        buttonRow.append(createElement("button", {
            className: "secondary-button",
            type: "submit",
            text: options.submitText
        }));

        if (isEdit) {
            buttonRow.append(createElement("button", {
                className: "secondary-button",
                type: "button",
                text: "Cancel",
                dataset: {
                    action: "cancel-comment-edit"
                }
            }));
        } else if (options.targetId !== options.rootId) {
            buttonRow.append(createElement("button", {
                className: "secondary-button",
                type: "button",
                text: "Cancel",
                dataset: {
                    action: "cancel-reply",
                    targetId: options.targetId
                }
            }));
        }

        fieldset.append(
            createElement("label", { htmlFor: contentId, text: "Text Content" }),
            createElement("textarea", {
                id: contentId,
                name: "content",
                rows: 3,
                maxLength: 3000,
                required: true,
                value: options.content || ""
            }),
            createElement("label", { htmlFor: linkId, text: "External Link" }),
            createElement("input", {
                id: linkId,
                name: "externalLink",
                type: "url",
                inputMode: "url",
                placeholder: "https://example.com",
                value: options.externalLink || ""
            }),
            buttonRow
        );

        form.append(
            fieldset,
            createElement("p", {
                className: "form-note",
                text: state.currentUser ? "" : "Log in to reply.",
                dataset: {
                    commentStatus: "true"
                }
            })
        );

        return form;
    }

    async function toggleComments(targetId) {
        if (state.expandedTargets.has(targetId)) {
            state.expandedTargets.delete(targetId);
            renderFeeds();
            return;
        }

        state.expandedTargets.add(targetId);
        await refreshCommentsTree(targetId);
        renderFeeds();
    }

    function toggleReplyForm(targetId) {
        if (state.openReplyForms.has(targetId)) {
            state.openReplyForms.delete(targetId);
        } else {
            state.openReplyForms.add(targetId);
        }

        renderFeeds();
    }

    async function handleVote(button) {
        if (!state.currentUser) {
            setActiveStatus("Log in to vote.");
            return;
        }

        const itemType = button.dataset.itemType;
        const itemId = button.dataset.itemId;
        const voteValue = Number(button.dataset.voteValue) === -1 ? -1 : 1;
        const item = findItem(itemType, itemId);

        if (!item) {
            return;
        }

        button.disabled = true;

        try {
            const result = await firebaseBridge.firestore.setVote({
                itemType,
                itemId,
                authorUid: state.currentUser.uid,
                value: voteValue
            });

            if (result.value === 0) {
                state.userVotes.delete(itemId);
            } else {
                state.userVotes.set(itemId, result.value);
            }

            item.score = (Number(item.score) || 0) + result.delta;
            renderFeeds();
        } catch (error) {
            setActiveStatus(getErrorMessage(error, "Vote could not be saved."));
        } finally {
            button.disabled = false;
        }
    }

    function beginItemEdit(itemType, itemId) {
        const item = findItem(itemType, itemId);

        if (!canMutate(item)) {
            return;
        }

        if (itemType === "post") {
            state.editing.post = item;
            fillComposer(nodes.postForm, item);
            nodes.postSubmitButton.textContent = "Save post";
            nodes.postCancelEdit.classList.remove("is-hidden");
            nodes.postForm.classList.remove("is-hidden");
            setText(nodes.postFormStatus, "Editing official post.");
            setActiveTab("posts");
            nodes.postForm.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        if (itemType === "discussion") {
            state.editing.discussion = item;
            fillComposer(nodes.discussionForm, item);
            nodes.discussionSubmitButton.textContent = "Save discussion";
            nodes.discussionCancelEdit.classList.remove("is-hidden");
            setText(nodes.discussionFormStatus, "Editing discussion.");
            setActiveTab("discussions");
            nodes.discussionForm.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    async function deleteItem(itemType, itemId) {
        const item = findItem(itemType, itemId);

        if (!canMutate(item) || !window.confirm(`Delete this ${itemType}?`)) {
            return;
        }

        try {
            if (itemType === "post") {
                await firebaseBridge.firestore.deletePost(itemId);
                await loadPosts();
                return;
            }

            if (itemType === "discussion") {
                await firebaseBridge.firestore.deleteDiscussion(itemId);
                await loadDiscussions();
            }
        } catch (error) {
            setActiveStatus(getErrorMessage(error));
        }
    }

    function beginCommentEdit(itemId) {
        const comment = findAnyComment(itemId);

        if (!canMutate(comment)) {
            return;
        }

        state.editing.comment = itemId;
        state.openReplyForms.delete(itemId);
        renderFeeds();
    }

    async function deleteComment(rootId, itemId) {
        const comment = findAnyComment(itemId);

        if (!canMutate(comment) || !window.confirm("Delete this comment?")) {
            return;
        }

        try {
            await firebaseBridge.firestore.deleteComment(comment.id);
            decrementLocalCommentCount(rootId, comment.rootType, comment.targetId);
            await refreshCommentsTree(rootId);
            renderFeeds();
        } catch (error) {
            setActiveStatus(getErrorMessage(error));
        }
    }

    async function setCurrentUser(user) {
        state.currentUser = user;

        if (!state.currentUser) {
            state.userVotes.clear();
            state.editing.post = null;
            state.editing.discussion = null;
            state.editing.comment = null;
        } else {
            await refreshUserVotes();
        }

        renderAuthState();
        renderFeeds();
    }

    function renderAuthState() {
        const admin = isOfficialPostAdmin();

        if (!state.currentUser) {
            setText(nodes.sessionChip, "Guest");
            nodes.authForm.classList.remove("is-hidden");
            nodes.signOutButton.classList.add("is-hidden");
            renderProfileStatus("Guest");
            nodes.discussionFieldset.disabled = true;
            setText(nodes.discussionFormStatus, "Log in to create a discussion.");
            nodes.postForm.classList.add("is-hidden");
            nodes.postFieldset.disabled = true;
            setText(nodes.postFormStatus, "Official posts are reserved for rafa.azhimi.");
            resetPostForm(false);
            return;
        }

        setText(nodes.sessionChip, state.currentUser.username);
        nodes.authForm.classList.add("is-hidden");
        nodes.signOutButton.classList.remove("is-hidden");
        renderProfileStatus(`${state.currentUser.username} (${state.currentUser.uid})`);
        nodes.discussionFieldset.disabled = false;
        setText(nodes.discussionFormStatus, state.editing.discussion ? "Editing discussion." : `Logged in as ${state.currentUser.username}.`);
        nodes.postForm.classList.toggle("is-hidden", !admin);
        nodes.postFieldset.disabled = !admin;
        setText(nodes.postFormStatus, admin ? "Logged in as official post admin." : "Official posts are reserved for rafa.azhimi.");

        if (!admin) {
            resetPostForm(false);
        }
    }

    function renderProfileStatus(message) {
        clearNode(nodes.profileStatus);
        nodes.profileStatus.append(
            createElement("span", { className: "profile-label", text: "Status" }),
            createElement("strong", { text: message })
        );
    }

    function renderCountSidebar() {
        const postsTotal = document.getElementById("side-post-count");
        const discussionsTotal = document.getElementById("side-discussion-count");

        if (postsTotal) {
            setText(postsTotal, String(state.posts.length));
        }

        if (discussionsTotal) {
            setText(discussionsTotal, String(state.discussions.length));
        }
    }

    function resetPostForm(clearStatus = true) {
        state.editing.post = null;
        nodes.postForm.reset();
        nodes.postSubmitButton.textContent = "Create post";
        nodes.postCancelEdit.classList.add("is-hidden");

        if (clearStatus) {
            setText(nodes.postFormStatus, isOfficialPostAdmin() ? "Logged in as official post admin." : "Official posts are reserved for rafa.azhimi.");
        }
    }

    function resetDiscussionForm() {
        state.editing.discussion = null;
        nodes.discussionForm.reset();
        nodes.discussionSubmitButton.textContent = "Create discussion";
        nodes.discussionCancelEdit.classList.add("is-hidden");
        setText(nodes.discussionFormStatus, state.currentUser ? `Logged in as ${state.currentUser.username}.` : "Log in to create a discussion.");
    }

    function setAuthFormBusy(isBusy) {
        Array.from(nodes.authForm.elements).forEach((element) => {
            element.disabled = isBusy;
        });
    }

    function getComposerPayload(form) {
        const formData = new FormData(form);

        return {
            title: String(formData.get("title") || "").trim(),
            content: String(formData.get("content") || "").trim(),
            externalLink: sanitizeExternalLink(String(formData.get("externalLink") || "").trim())
        };
    }

    function getCommentPayload(form) {
        const formData = new FormData(form);

        return {
            content: String(formData.get("content") || "").trim(),
            externalLink: sanitizeExternalLink(String(formData.get("externalLink") || "").trim())
        };
    }

    function fillComposer(form, item) {
        form.elements.title.value = item.title || "";
        form.elements.content.value = item.content || "";
        form.elements.externalLink.value = item.externalLink || "";
    }

    function createEntryModel(values) {
        return {
            ...DEFAULT_MODELS.entry,
            targetId: values.targetId || "",
            rootId: values.rootId || "",
            rootType: values.rootType || "",
            parentType: values.parentType || "",
            depth: Number(values.depth) || 0,
            author: values.author || "",
            authorUid: values.authorUid || "",
            title: values.title || "",
            content: values.content || "",
            externalLink: values.externalLink || "",
            createdAt: new Date().toISOString(),
            score: 0,
            commentCount: 0
        };
    }

    function normalizeEntry(rawItem, itemType) {
        if (!rawItem || typeof rawItem !== "object") {
            return null;
        }

        return {
            ...DEFAULT_MODELS.entry,
            id: String(rawItem.id || ""),
            targetId: String(rawItem.targetId || ""),
            rootId: String(rawItem.rootId || ""),
            rootType: String(rawItem.rootType || ""),
            parentType: String(rawItem.parentType || ""),
            depth: Number(rawItem.depth) || 0,
            author: String(rawItem.author || (itemType === "post" ? ADMIN_USERNAME : "")),
            authorUid: String(rawItem.authorUid || ""),
            title: String(rawItem.title || ""),
            content: String(rawItem.content || ""),
            externalLink: sanitizeExternalLink(String(rawItem.externalLink || "").trim()),
            createdAt: normalizeDateValue(rawItem.createdAt),
            score: Number(rawItem.score) || 0,
            commentCount: Number(rawItem.commentCount) || 0
        };
    }

    function normalizeUser(user, fallbackUsername) {
        const uid = String(user.uid || user.id || "");
        const username = String(user.username || user.displayName || fallbackUsername || emailName(user.email) || "User");

        return {
            ...DEFAULT_MODELS.user,
            uid,
            username,
            createdAt: normalizeDateValue(user.createdAt || user.metadata?.creationTime || "")
        };
    }

    function canMutate(item) {
        if (!state.currentUser || !item) {
            return false;
        }

        if (item.authorUid) {
            return item.authorUid === state.currentUser.uid;
        }

        return isOfficialPostAdmin() && String(item.author || "").toLowerCase() === ADMIN_USERNAME;
    }

    function isOfficialPostAdmin() {
        return Boolean(state.currentUser && String(state.currentUser.username || "").toLowerCase() === ADMIN_USERNAME);
    }

    function findItem(itemType, itemId) {
        if (itemType === "post") {
            return state.posts.find((item) => item.id === itemId);
        }

        if (itemType === "discussion") {
            return state.discussions.find((item) => item.id === itemId);
        }

        if (itemType === "comment") {
            return findAnyComment(itemId);
        }

        return null;
    }

    function findAnyComment(itemId) {
        for (const comments of state.commentsByTarget.values()) {
            const match = comments.find((comment) => comment.id === itemId);

            if (match) {
                return match;
            }
        }

        return null;
    }

    function incrementLocalCommentCount(rootId, rootType, parentId) {
        const root = findItem(rootType, rootId);
        const parent = findAnyComment(parentId);

        if (root) {
            root.commentCount = (Number(root.commentCount) || 0) + 1;
        }

        if (parent && parent.id !== rootId) {
            parent.commentCount = (Number(parent.commentCount) || 0) + 1;
        }
    }

    function decrementLocalCommentCount(rootId, rootType, parentId) {
        const root = findItem(rootType, rootId);
        const parent = findAnyComment(parentId);

        if (root) {
            root.commentCount = Math.max(0, (Number(root.commentCount) || 0) - 1);
        }

        if (parent && parent.id !== rootId) {
            parent.commentCount = Math.max(0, (Number(parent.commentCount) || 0) - 1);
        }
    }

    function getThreadCommentCount(item) {
        if (state.commentsByTarget.has(item.id)) {
            return countDescendantComments(item.id);
        }

        return Number(item.commentCount) || 0;
    }

    function countDescendantComments(targetId, visited = new Set()) {
        if (visited.has(targetId)) {
            return 0;
        }

        visited.add(targetId);

        const comments = state.commentsByTarget.get(targetId) || [];
        return comments.reduce((total, comment) => total + 1 + countDescendantComments(comment.id, visited), 0);
    }

    function createExternalLinkBadge(url) {
        return createElement("a", {
            className: "link-badge",
            href: url,
            text: "External link",
            target: "_blank",
            rel: "noopener noreferrer"
        });
    }

    function createEmptyState(message) {
        return createElement("p", { className: "empty-state", text: message });
    }

    function createElement(tagName, options = {}) {
        const element = document.createElement(tagName);

        Object.entries(options).forEach(([key, value]) => {
            if (value === undefined || value === null || value === false) {
                return;
            }

            if (key === "text") {
                element.textContent = value;
                return;
            }

            if (key === "className") {
                element.className = value;
                return;
            }

            if (key === "dataset") {
                Object.entries(value).forEach(([dataKey, dataValue]) => {
                    element.dataset[dataKey] = dataValue;
                });
                return;
            }

            if (key === "ariaLabel") {
                element.setAttribute("aria-label", value);
                return;
            }

            if (key in element) {
                element[key] = value;
                return;
            }

            element.setAttribute(key, value);
        });

        return element;
    }

    function clearNode(node) {
        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    }

    function setText(node, value) {
        if (node) {
            node.textContent = value;
        }
    }

    function setActiveStatus(message) {
        const activeView = document.querySelector(".view.is-active");

        if (activeView && activeView.dataset.view === "posts") {
            setText(nodes.postsStatus, message);
            return;
        }

        if (activeView && activeView.dataset.view === "discussions") {
            setText(nodes.discussionsStatus, message);
            return;
        }

        renderProfileStatus(message);
    }

    function sortByCreatedAtDesc(a, b) {
        return Number(new Date(b.createdAt)) - Number(new Date(a.createdAt));
    }

    function sortByCreatedAtAsc(a, b) {
        return Number(new Date(a.createdAt)) - Number(new Date(b.createdAt));
    }

    function normalizeDateValue(value) {
        if (!value) {
            return "";
        }

        if (typeof value.toDate === "function") {
            return value.toDate().toISOString();
        }

        if (typeof value === "object" && typeof value.seconds === "number") {
            return new Date(value.seconds * 1000).toISOString();
        }

        return String(value);
    }

    function formatDate(value) {
        const date = new Date(value);

        if (Number.isNaN(date.valueOf())) {
            return "Unknown date";
        }

        return new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        }).format(date);
    }

    function pluralize(count, noun) {
        return `${count} ${noun}${count === 1 ? "" : "s"}`;
    }

    function cssSafeId(value) {
        return String(value).replace(/[^a-z0-9_-]/gi, "-");
    }

    function emailName(email) {
        return email ? String(email).split("@")[0] : "";
    }

    function sanitizeExternalLink(value) {
        if (!value) {
            return "";
        }

        try {
            const parsed = new URL(value);
            return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
        } catch (error) {
            return "";
        }
    }

    function getErrorMessage(error, fallback = "Action could not be completed.") {
        return error && error.message ? error.message : fallback;
    }

    function mergeFirebaseBridge(defaultBridge, providedBridge) {
        return {
            auth: {
                ...defaultBridge.auth,
                ...(providedBridge.auth || {})
            },
            firestore: {
                ...defaultBridge.firestore,
                ...(providedBridge.firestore || {})
            }
        };
    }

    function createDefaultFirebaseBridge() {
        return {
            auth: {
                onAuthStateChanged(callback) {
                    callback(null);
                    return function unsubscribe() {};
                },
                async signUp() {
                    throw new Error("Firebase Auth is not connected.");
                },
                async signIn() {
                    throw new Error("Firebase Auth is not connected.");
                },
                async signOut() {
                    throw new Error("Firebase Auth is not connected.");
                }
            },
            firestore: {
                async listPosts() {
                    return [];
                },
                async createPost() {
                    throw new Error("Firestore is not connected.");
                },
                async updatePost() {
                    throw new Error("Firestore is not connected.");
                },
                async deletePost() {
                    throw new Error("Firestore is not connected.");
                },
                async listDiscussions() {
                    return [];
                },
                async createDiscussion() {
                    throw new Error("Firestore is not connected.");
                },
                async updateDiscussion() {
                    throw new Error("Firestore is not connected.");
                },
                async deleteDiscussion() {
                    throw new Error("Firestore is not connected.");
                },
                async listComments() {
                    return [];
                },
                async createComment() {
                    throw new Error("Firestore is not connected.");
                },
                async updateComment() {
                    throw new Error("Firestore is not connected.");
                },
                async deleteComment() {
                    throw new Error("Firestore is not connected.");
                },
                async listUserVotes() {
                    return [];
                },
                async setVote() {
                    throw new Error("Firestore is not connected.");
                }
            }
        };
    }
})();
