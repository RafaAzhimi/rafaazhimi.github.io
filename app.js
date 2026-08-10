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
  addDoc, 
  getDocs, 
  doc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy 
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

// Bridge Firebase functions to the window object expected by your script
window.communityFirebase = {
  auth: {
    signUp: async ({ username, password }) => {
      const email = `${username.toLowerCase()}@app.local`;
      const res = await createUserWithEmailAndPassword(auth, email, password);
      return { uid: res.user.uid, username, email: res.user.email };
    },
    signIn: async ({ username, password }) => {
      const email = `${username.toLowerCase()}@app.local`;
      const res = await signInWithEmailAndPassword(auth, email, password);
      return { uid: res.user.uid, username, email: res.user.email };
    },
    signOut: () => signOut(auth),
    onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback)
  },
  firestore: {
    listDiscussions: async () => {
      const q = query(collection(db, "discussions"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    createDiscussion: async (data) => {
      await addDoc(collection(db, "discussions"), data);
    },
    updateDiscussion: async (id, data) => {
      await updateDoc(doc(db, "discussions", id), data);
    },
    deleteDiscussion: async (id) => {
      await deleteDoc(doc(db, "discussions", id));
    },
    listPosts: async () => {
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    createPost: async (data) => {
      await addDoc(collection(db, "posts"), data);
    },
    updatePost: async (id, data) => {
      await updateDoc(doc(db, "posts", id), data);
    },
    deletePost: async (id) => {
      await deleteDoc(doc(db, "posts", id));
    },
    listComments: async (targetId) => {
      const q = query(collection(db, "comments"), where("targetId", "==", targetId));
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    listAllComments: async () => {
      const snap = await getDocs(collection(db, "comments"));
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },
    createComment: async (data) => {
      await addDoc(collection(db, "comments"), data);
    },
    updateComment: async (id, data) => {
      await updateDoc(doc(db, "comments", id), data);
    },
    deleteComment: async (id) => {
      await deleteDoc(doc(db, "comments", id));
    }
  }
};

// --- YOUR EXISTING APP LOGIC ---
(function () {
    "use strict";

    const FIREBASE_READY_SCHEMAS = Object.freeze({
        user: Object.freeze({
            uid: "",
            username: "",
            email: "",
            createdAt: ""
        }),
        discussionOrComment: Object.freeze({
            id: "",
            targetId: "",
            parentId: "",
            author: "",
            authorUid: "",
            title: "",
            content: "",
            externalLink: "",
            createdAt: ""
        })
    });

    const ADMIN_USERNAME = "rafa.azhimi";
    const ADMIN_EMAIL = "rafa.azhimi@app.local";
    const MAX_REPLY_DEPTH = 4;

    const siteConfig = {
        githubRepo: inferGithubRepo(),
        githubBranch: "main",
        postsPath: "content/posts",
        ...(window.communityConfig || {})
    };

    const firebaseBridge = mergeFirebaseBridge(createDefaultFirebaseBridge(), window.communityFirebase || {});

    const state = {
        currentUser: null,
        posts: [],
        discussions: [],
        commentsByTarget: new Map(),
        commentCountsByTarget: new Map(),
        expandedTargets: new Set(),
        expandedReplyForms: new Set()
    };

    const nodes = {};

    window.communitySchemas = FIREBASE_READY_SCHEMAS;
    window.communityApp = {
        config: siteConfig,
        reloadPosts: loadPosts,
        reloadDiscussions: loadDiscussions,
        reloadCommentCounts: loadCommentCounts,
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
        loadCommentCounts();
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
        nodes.discussionsFeed = document.getElementById("discussions-feed");
        nodes.discussionsCount = document.getElementById("discussions-count");
        nodes.discussionsStatus = document.getElementById("discussions-status");
        nodes.discussionForm = document.getElementById("discussion-form");
        nodes.discussionFieldset = document.getElementById("discussion-fieldset");
        nodes.discussionFormStatus = document.getElementById("discussion-form-status");
        nodes.commentsCount = document.getElementById("comments-count");
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
                    setCurrentUser(normalizeUser(user, credentials.username));
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
                setCurrentUser(null);
            } catch (error) {
                renderProfileStatus(getErrorMessage(error));
            }
        });
    }

    function bindPostForm() {
        if (!nodes.postForm) {
            return;
        }

        nodes.postForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!isAdminUser()) {
                setText(nodes.postFormStatus, `Only Admins can post.`);
                return;
            }

            const formData = new FormData(nodes.postForm);
            const model = createFirestoreModel({
                targetId: "posts",
                parentId: "",
                author: state.currentUser.username,
                authorUid: state.currentUser.uid,
                title: String(formData.get("title") || "").trim(),
                content: String(formData.get("content") || "").trim(),
                externalLink: sanitizeExternalLink(String(formData.get("externalLink") || "").trim())
            });

            if (!model.title || !model.content) {
                setText(nodes.postFormStatus, "Title and text content are required.");
                return;
            }

            setText(nodes.postFormStatus, "Creating post...");

            try {
                await firebaseBridge.firestore.createPost(model);
                nodes.postForm.reset();
                setText(nodes.postFormStatus, "Post submitted.");
                await loadPosts();
            } catch (error) {
                setText(nodes.postFormStatus, getErrorMessage(error));
            }
        });
    }

    function bindDiscussionForm() {
        nodes.discussionForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            if (!state.currentUser) {
                setText(nodes.discussionFormStatus, "Log in to create a discussion.");
                return;
            }

            const formData = new FormData(nodes.discussionForm);
            const model = createFirestoreModel({
                targetId: "discussions",
                parentId: "",
                author: state.currentUser.username,
                authorUid: state.currentUser.uid,
                title: String(formData.get("title") || "").trim(),
                content: String(formData.get("content") || "").trim(),
                externalLink: sanitizeExternalLink(String(formData.get("externalLink") || "").trim())
            });

            if (!model.title || !model.content) {
                setText(nodes.discussionFormStatus, "Title and text content are required.");
                return;
            }

            setText(nodes.discussionFormStatus, "Creating discussion...");

            try {
                await firebaseBridge.firestore.createDiscussion(model);
                nodes.discussionForm.reset();
                setText(nodes.discussionFormStatus, "Discussion submitted.");
                await loadDiscussions();
            } catch (error) {
                setText(nodes.discussionFormStatus, getErrorMessage(error));
            }
        });
    }

    function bindFeedActions() {
        document.addEventListener("click", async (event) => {
            const button = event.target.closest("[data-action]");

            if (!button) {
                return;
            }

            const action = button.dataset.action;
            const targetId = button.dataset.targetId;
            const itemId = button.dataset.itemId;

            if (action === "toggle-comments") {
                await toggleComments(targetId);
                return;
            }

            if (action === "toggle-reply") {
                toggleReplyForm(itemId);
                return;
            }

            if (action === "edit-post") {
                await editPost(itemId);
                return;
            }

            if (action === "delete-post") {
                await deletePost(itemId);
                return;
            }

            if (action === "edit-discussion") {
                await editDiscussion(itemId);
                return;
            }

            if (action === "delete-discussion") {
                await deleteDiscussion(itemId);
                return;
            }

            if (action === "edit-comment") {
                await editComment(targetId, itemId);
                return;
            }

            if (action === "delete-comment") {
                await deleteComment(targetId, itemId);
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
                const status = form.querySelector("[data-comment-status]");
                setText(status, "Log in to reply.");
                return;
            }

            const targetId = form.dataset.targetId;
            const parentId = form.dataset.parentId || "";
            const formData = new FormData(form);

            if (parentId) {
                const comments = state.commentsByTarget.get(targetId) || [];
                const parentComment = findComment(targetId, parentId);

                if (!parentComment) {
                    setText(form.querySelector("[data-comment-status]"), "Parent comment not found.");
                    return;
                }

                if (getCommentDepth(parentComment, comments) >= MAX_REPLY_DEPTH) {
                    setText(form.querySelector("[data-comment-status]"), `Replies are limited to ${MAX_REPLY_DEPTH} levels.`);
                    return;
                }
            }

            const model = createFirestoreModel({
                targetId,
                parentId,
                author: state.currentUser.username,
                authorUid: state.currentUser.uid,
                title: "",
                content: String(formData.get("content") || "").trim(),
                externalLink: sanitizeExternalLink(String(formData.get("externalLink") || "").trim())
            });

            if (!model.content) {
                setText(form.querySelector("[data-comment-status]"), "Text content is required.");
                return;
            }

            setText(form.querySelector("[data-comment-status]"), "Submitting reply...");

            try {
                await firebaseBridge.firestore.createComment(model);
                form.reset();
                if (parentId) {
                    state.expandedReplyForms.delete(parentId);
                }
                await refreshComments(targetId);
                renderFeeds();
            } catch (error) {
                setText(form.querySelector("[data-comment-status]"), getErrorMessage(error));
            }
        });
    }

    function bootAuthObserver() {
        try {
            firebaseBridge.auth.onAuthStateChanged((user) => {
                setCurrentUser(user ? normalizeUser(user) : null);
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
                ? posts.map(normalizeDiscussionOrComment).filter(Boolean).sort(sortByCreatedAtDesc)
                : [];
            setText(nodes.postsStatus, "");
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
                ? discussions.map(normalizeDiscussionOrComment).filter(Boolean).sort(sortByCreatedAtDesc)
                : [];
            setText(nodes.discussionsStatus, "");
        } catch (error) {
            state.discussions = [];
            setText(nodes.discussionsStatus, getErrorMessage(error, "Discussions could not load from Firestore."));
        }

        renderDiscussions();
    }

    async function loadCommentCounts() {
        try {
            const allComments = await firebaseBridge.firestore.listAllComments();
            state.commentCountsByTarget.clear();

            (Array.isArray(allComments) ? allComments : []).forEach((rawComment) => {
                const comment = normalizeDiscussionOrComment(rawComment);

                if (!comment || !comment.targetId) {
                    return;
                }

                const current = state.commentCountsByTarget.get(comment.targetId) || 0;
                state.commentCountsByTarget.set(comment.targetId, current + 1);
            });
        } catch (error) {
            state.commentCountsByTarget.clear();
        }

        renderCountSidebar();
        renderFeeds();
    }

    function toggleReplyForm(commentId) {
        if (state.expandedReplyForms.has(commentId)) {
            state.expandedReplyForms.delete(commentId);
        } else {
            state.expandedReplyForms.add(commentId);
        }

        renderFeeds();
    }

    function renderPosts() {
        setText(nodes.postsCount, pluralize(state.posts.length, "post"));
        renderCountSidebar();
        clearNode(nodes.postsFeed);

        if (state.posts.length === 0) {
            nodes.postsFeed.append(createEmptyState("No posts found."));
            return;
        }

        state.posts.forEach((post) => {
            nodes.postsFeed.append(createItemCard(post, "post"));
        });
    }

    function renderDiscussions() {
        setText(nodes.discussionsCount, pluralize(state.discussions.length, "discussion"));
        renderCountSidebar();
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

    function createItemCard(item, type) {
        const card = createElement("article", { className: "card" });
        const commentCount = getCommentCount(item.id);
        const score = Number.isFinite(Number(item.score)) ? Number(item.score) : 0;

        const body = createElement("div", { className: "card-body" });
        const meta = type === "post"
            ? `Posted by ${item.author || "Admin"} on ${formatDate(item.createdAt)}`
            : `Started by ${item.author || "Unknown"} on ${formatDate(item.createdAt)}`;

        body.append(
            createElement("p", { className: "item-meta", text: meta }),
            createElement("h2", { className: "item-title", text: item.title || "Untitled" }),
            createElement("p", { className: "item-content", text: item.content || "" })
        );

        if (item.externalLink) {
            body.append(createExternalLinkBadge(item.externalLink));
        }

        body.append(createActionRow(item, type, commentCount, score));
        body.append(createCommentsRegion(item));

        card.append(body);
        return card;
    }

    function createVoteInline(score) {
        const voteInline = createElement("div", { className: "vote-inline", ariaLabel: "Counters" });
        voteInline.append(
            createElement("button", {
                className: "vote-button",
                type: "button",
                text: "↑",
                disabled: true,
                ariaLabel: "Vote up"
            }),
            createElement("span", { className: "vote-count", text: String(score) }),
            createElement("button", {
                className: "vote-button",
                type: "button",
                text: "↓",
                disabled: true,
                ariaLabel: "Vote down"
            })
        );
        return voteInline;
    }

    function createActionRow(item, type, commentCount, score = 0) {
        const actionRow = createElement("div", { className: "action-row" });

        actionRow.append(createVoteInline(score));

        const allowed = type === "post" ? canMutatePost(item) : canMutate(item);

        if (allowed) {
            if (type === "discussion") {
                actionRow.append(
                    createElement("button", {
                        className: "action-button",
                        type: "button",
                        text: "Edit",
                        dataset: {
                            action: "edit-discussion",
                            itemId: item.id
                        }
                    }),
                    createElement("button", {
                        className: "action-button danger-button",
                        type: "button",
                        text: "Delete",
                        dataset: {
                            action: "delete-discussion",
                            itemId: item.id
                        }
                    })
                );
            }

            if (type === "post") {
                actionRow.append(
                    createElement("button", {
                        className: "action-button",
                        type: "button",
                        text: "Edit",
                        dataset: {
                            action: "edit-post",
                            itemId: item.id
                        }
                    }),
                    createElement("button", {
                        className: "action-button danger-button",
                        type: "button",
                        text: "Delete",
                        dataset: {
                            action: "delete-post",
                            itemId: item.id
                        }
                    })
                );
            }
        }

        actionRow.append(createElement("button", {
            className: "action-button",
            type: "button",
            text: `Comments (${commentCount})`,
            dataset: {
                action: "toggle-comments",
                targetId: item.id
            }
        }));

        return actionRow;
    }

    function createCommentsRegion(item) {
        const region = createElement("div", {
            className: state.expandedTargets.has(item.id) ? "comments-region is-open" : "comments-region"
        });

        const list = createElement("div", { className: "comment-list" });
        const comments = state.commentsByTarget.get(item.id) || [];
        const roots = getRootComments(comments);

        if (roots.length === 0) {
            list.append(createElement("p", { className: "empty-state", text: "No comments found." }));
        } else {
            roots.forEach((comment) => {
                list.append(createCommentNode(comment, item.id, comments));
            });
        }

        region.append(list, createCommentForm(item.id));
        return region;
    }

    function createCommentNode(comment, targetId, allComments) {
        const depth = getCommentDepth(comment, allComments);
        const wrapper = createElement("article", {
            className: "comment",
            dataset: {
                depth: String(depth)
            }
        });
        const allowed = canMutate(comment);

        wrapper.append(
            createElement("p", {
                className: "item-meta",
                text: `${comment.author || "Unknown"} on ${formatDate(comment.createdAt)}`
            }),
            createElement("p", { text: comment.content || "" })
        );

        if (comment.externalLink) {
            wrapper.append(createExternalLinkBadge(comment.externalLink));
        }

        const actions = createElement("div", { className: "action-row" });

        if (depth < MAX_REPLY_DEPTH) {
            actions.append(createElement("button", {
                className: "action-button",
                type: "button",
                text: state.expandedReplyForms.has(comment.id) ? "Cancel reply" : "Reply",
                dataset: {
                    action: "toggle-reply",
                    itemId: comment.id
                }
            }));
        }

        if (allowed) {
            actions.append(
                createElement("button", {
                    className: "action-button",
                    type: "button",
                    text: "Edit",
                    dataset: {
                        action: "edit-comment",
                        targetId,
                        itemId: comment.id
                    }
                }),
                createElement("button", {
                    className: "action-button danger-button",
                    type: "button",
                    text: "Delete",
                    dataset: {
                        action: "delete-comment",
                        targetId,
                        itemId: comment.id
                    }
                })
            );
        }
        wrapper.append(actions);

        if (state.expandedReplyForms.has(comment.id)) {
            wrapper.append(createCommentForm(targetId, comment.id));
        }

        const children = getCommentReplies(comment.id, allComments);

        if (children.length > 0) {
            const childList = createElement("div", { className: "comment-children" });
            children.forEach((child) => {
                childList.append(createCommentNode(child, targetId, allComments));
            });
            wrapper.append(childList);
        }

        return wrapper;
    }

    function createComment(comment, targetId) {
        const allComments = state.commentsByTarget.get(targetId) || [];
        return createCommentNode(comment, targetId, allComments);
    }

    function createCommentForm(targetId, parentId = "") {
        const form = createElement("form", {
            className: "comment-form",
            dataset: {
                targetId,
                parentId
            }
        });

        const formKey = parentId || targetId;
        const contentId = `comment-content-${cssSafeId(formKey)}`;
        const linkId = `comment-link-${cssSafeId(formKey)}`;

        const fieldset = createElement("fieldset", { disabled: !state.currentUser });
        fieldset.append(
            createElement("label", { htmlFor: contentId, text: "Content" }),
            createElement("textarea", {
                id: contentId,
                name: "content",
                rows: 3,
                maxLength: 3000,
                required: true
            }),
            createElement("label", { htmlFor: linkId, text: "External Link" }),
            createElement("input", {
                id: linkId,
                name: "externalLink",
                type: "url",
                inputMode: "url",
                placeholder: "https://example.com"
            }),
            createElement("button", {
                className: "secondary-button",
                type: "submit",
                text: parentId ? "Submit reply" : "Reply"
            })
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
        await refreshComments(targetId);
        renderFeeds();
    }

    async function refreshComments(targetId) {
        try {
            const comments = await firebaseBridge.firestore.listComments(targetId);
            const normalized = Array.isArray(comments)
                ? comments.map(normalizeDiscussionOrComment).filter(Boolean).sort(sortByCreatedAtAsc)
                : [];

            state.commentsByTarget.set(targetId, normalized);
            state.commentCountsByTarget.set(targetId, normalized.length);
        } catch (error) {
            state.commentsByTarget.set(targetId, []);
            state.commentCountsByTarget.set(targetId, 0);
        }

        renderCountSidebar();
    }

    async function editPost(itemId) {
        const item = state.posts.find((post) => post.id === itemId);

        if (!canMutatePost(item)) {
            return;
        }

        const nextContent = window.prompt("Content", item.content);

        if (nextContent === null) {
            return;
        }

        try {
            await firebaseBridge.firestore.updatePost(item.id, { content: nextContent.trim() });
            await loadPosts();
        } catch (error) {
            setText(nodes.postsStatus, getErrorMessage(error));
        }
    }

    async function deletePost(itemId) {
        const item = state.posts.find((post) => post.id === itemId);

        if (!canMutatePost(item) || !window.confirm("Delete this post?")) {
            return;
        }

        try {
            await firebaseBridge.firestore.deletePost(item.id);
            await loadPosts();
            await loadCommentCounts();
        } catch (error) {
            setText(nodes.postsStatus, getErrorMessage(error));
        }
    }

    async function editDiscussion(itemId) {
        const item = state.discussions.find((discussion) => discussion.id === itemId);

        if (!canMutate(item)) {
            return;
        }

        const nextContent = window.prompt("Content", item.content);

        if (nextContent === null) {
            return;
        }

        try {
            await firebaseBridge.firestore.updateDiscussion(item.id, { content: nextContent.trim() });
            await loadDiscussions();
        } catch (error) {
            setText(nodes.discussionsStatus, getErrorMessage(error));
        }
    }

    async function deleteDiscussion(itemId) {
        const item = state.discussions.find((discussion) => discussion.id === itemId);

        if (!canMutate(item) || !window.confirm("Delete this discussion?")) {
            return;
        }

        try {
            await firebaseBridge.firestore.deleteDiscussion(item.id);
            await loadDiscussions();
        } catch (error) {
            setText(nodes.discussionsStatus, getErrorMessage(error));
        }
    }

    async function editComment(targetId, itemId) {
        const comment = findComment(targetId, itemId);

        if (!canMutate(comment)) {
            return;
        }

        const nextContent = window.prompt("Content", comment.content);

        if (nextContent === null) {
            return;
        }

        try {
            await firebaseBridge.firestore.updateComment(comment.id, { content: nextContent.trim() });
            await refreshComments(targetId);
            renderFeeds();
        } catch (error) {
            setText(nodes.discussionsStatus, getErrorMessage(error));
        }
    }

    async function deleteComment(targetId, itemId) {
        const comment = findComment(targetId, itemId);

        if (!canMutate(comment) || !window.confirm("Delete this comment?")) {
            return;
        }

        try {
            await firebaseBridge.firestore.deleteComment(comment.id);
            await refreshComments(targetId);
            renderFeeds();
        } catch (error) {
            setText(nodes.discussionsStatus, getErrorMessage(error));
        }
    }

    function setCurrentUser(user) {
        state.currentUser = user;
        renderAuthState();
        renderFeeds();
    }

    function renderAuthState() {
        if (!state.currentUser) {
            setText(nodes.sessionChip, "Guest");
            nodes.authForm.classList.remove("is-hidden");
            nodes.signOutButton.classList.add("is-hidden");
            renderProfileStatus("Guest");
            nodes.discussionFieldset.disabled = true;
            nodes.postFieldset.disabled = true;
            nodes.postForm.classList.add("is-hidden");
            setText(nodes.discussionFormStatus, "Log in to create a discussion.");
            setText(nodes.postFormStatus, `Only Admins can post.`);
            return;
        }

        setText(nodes.sessionChip, state.currentUser.username);
        nodes.authForm.classList.add("is-hidden");
        nodes.signOutButton.classList.remove("is-hidden");
        renderProfileStatus(`${state.currentUser.username} (${state.currentUser.uid})`);
        nodes.discussionFieldset.disabled = false;
        nodes.postFieldset.disabled = !isAdminUser();
        nodes.postForm.classList.toggle("is-hidden", !isAdminUser());
        setText(nodes.discussionFormStatus, `Logged in as ${state.currentUser.username}.`);

        if (isAdminUser()) {
            setText(nodes.postFormStatus, `Logged in as ${state.currentUser.username}.`);
        } else {
            setText(nodes.postFormStatus, `Only Admins can post.`);
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
        const commentsTotal = document.getElementById("side-comment-count");

        if (postsTotal) {
            setText(postsTotal, String(state.posts.length));
        }

        if (discussionsTotal) {
            setText(discussionsTotal, String(state.discussions.length));
        }

        if (commentsTotal) {
            let totalComments = 0;
            state.commentCountsByTarget.forEach((count) => {
                totalComments += count;
            });
            setText(commentsTotal, String(totalComments));
        }
    }

    function setAuthFormBusy(isBusy) {
        Array.from(nodes.authForm.elements).forEach((element) => {
            element.disabled = isBusy;
        });
    }

    function createExternalLinkBadge(url) {
        const link = createElement("a", {
            className: "link-badge",
            href: url,
            text: "External link",
            target: "_blank",
            rel: "noopener noreferrer"
        });

        return link;
    }

    function createEmptyState(message) {
        return createElement("p", { className: "empty-state", text: message });
    }

    function createFirestoreModel(values) {
        return {
            ...FIREBASE_READY_SCHEMAS.discussionOrComment,
            id: createId(),
            targetId: values.targetId || "",
            parentId: values.parentId || "",
            author: values.author || "",
            authorUid: values.authorUid || "",
            title: values.title || "",
            content: values.content || "",
            externalLink: values.externalLink || "",
            createdAt: new Date().toISOString()
        };
    }

    function normalizeDiscussionOrComment(rawItem) {
        if (!rawItem || typeof rawItem !== "object") {
            return null;
        }

        return {
            id: String(rawItem.id || ""),
            targetId: String(rawItem.targetId || ""),
            parentId: String(rawItem.parentId || ""),
            author: String(rawItem.author || ""),
            authorUid: String(rawItem.authorUid || ""),
            title: String(rawItem.title || ""),
            content: String(rawItem.content || ""),
            externalLink: sanitizeExternalLink(String(rawItem.externalLink || "").trim()),
            createdAt: String(rawItem.createdAt || "")
        };
    }

    function normalizeUser(user, fallbackUsername) {
        const uid = String(user.uid || user.id || "");
        const email = String(user.email || "").trim().toLowerCase();
        const username = String(user.username || user.displayName || fallbackUsername || emailName(user.email) || "User");

        return {
            ...FIREBASE_READY_SCHEMAS.user,
            uid,
            username,
            email,
            createdAt: String(user.createdAt || user.metadata?.creationTime || "")
        };
    }

    function canMutatePost(item) {
        return isAdminUser() && canMutate(item);
    }

    function isAdminUser(user = state.currentUser) {
        if (!user) {
            return false;
        }

        const email = String(user.email || "").trim().toLowerCase();
        return email === ADMIN_EMAIL || normalizeUsername(user.username) === normalizeUsername(ADMIN_USERNAME);
    }

    function normalizeUsername(username) {
        return String(username || "").trim().toLowerCase();
    }

    function getRootComments(comments) {
        return comments.filter((comment) => !comment.parentId);
    }

    function getCommentReplies(parentId, comments) {
        return comments.filter((comment) => comment.parentId === parentId);
    }

    function getCommentDepth(comment, allComments) {
        if (!comment || !comment.parentId) {
            return 1;
        }

        const parent = allComments.find((entry) => entry.id === comment.parentId);

        if (!parent) {
            return 1;
        }

        return getCommentDepth(parent, allComments) + 1;
    }

    function canMutate(item) {
        // UI permission gate for Firestore-owned records. Firestore security rules should enforce the same authorUid check.
        return Boolean(state.currentUser && item && item.authorUid && item.authorUid === state.currentUser.uid);
    }

    function findComment(targetId, itemId) {
        const comments = state.commentsByTarget.get(targetId) || [];
        return comments.find((comment) => comment.id === itemId);
    }

    function getCommentCount(targetId) {
        return state.commentCountsByTarget.get(targetId) || 0;
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

    function sortByCreatedAtAsc(a, b) {
        return Number(new Date(a.createdAt)) - Number(new Date(b.createdAt));
    }

    function sortByCreatedAtDesc(a, b) {
        return Number(new Date(b.createdAt)) - Number(new Date(a.createdAt));
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

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
            return window.crypto.randomUUID();
        }

        return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function cssSafeId(value) {
        return String(value).replace(/[^a-z0-9_-]/gi, "-");
    }

    function trimSlashes(value) {
        return String(value).replace(/^\/+|\/+$/g, "");
    }

    function emailName(email) {
        return email ? String(email).split("@")[0] : "";
    }

    function getErrorMessage(error, fallback = "Action unavailable until Firebase is connected.") {
        return error && error.message ? error.message : fallback;
    }

    function inferGithubRepo() {
        const host = window.location.hostname.toLowerCase();

        if (host.endsWith(".github.io")) {
            const owner = host.replace(".github.io", "");
            const firstPathSegment = window.location.pathname.split("/").filter(Boolean)[0];
            const repo = firstPathSegment || `${owner}.github.io`;
            return `${owner}/${repo}`;
        }

        return "rafaazhimi/rafaazhimi.github.io";
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
                    // Firebase Auth integration point:
                    // createUserWithEmailAndPassword(auth, usernameEmail, password)
                    throw new Error("Firebase Auth is not connected.");
                },
                async signIn() {
                    // Firebase Auth integration point:
                    // signInWithEmailAndPassword(auth, usernameEmail, password)
                    throw new Error("Firebase Auth is not connected.");
                },
                async signOut() {
                    // Firebase Auth integration point:
                    // signOut(auth)
                    throw new Error("Firebase Auth is not connected.");
                }
            },
            firestore: {
                async listDiscussions() {
                    // Firestore integration point:
                    // getDocs(query(collection(db, "discussions"), orderBy("createdAt", "desc")))
                    return [];
                },
                async listPosts() {
                    // Firestore integration point:
                    // getDocs(query(collection(db, "posts"), orderBy("createdAt", "desc")))
                    return [];
                },
                async listComments() {
                    // Firestore integration point:
                    // getDocs(query(collection(db, "comments"), where("targetId", "==", targetId)))
                    return [];
                },
                async listAllComments() {
                    // Firestore integration point:
                    // getDocs(collection(db, "comments"))
                    return [];
                },
                async createDiscussion() {
                    // Firestore integration point:
                    // setDoc(doc(db, "discussions", model.id), model)
                    throw new Error("Firestore is not connected.");
                },
                async createPost() {
                    // Firestore integration point:
                    // setDoc(doc(db, "posts", model.id), model)
                    throw new Error("Firestore is not connected.");
                },
                async createComment() {
                    // Firestore integration point:
                    // setDoc(doc(db, "comments", model.id), model)
                    throw new Error("Firestore is not connected.");
                },
                async updateDiscussion() {
                    // Firestore integration point:
                    // updateDoc(doc(db, "discussions", id), patch)
                    throw new Error("Firestore is not connected.");
                },
                async updatePost() {
                    // Firestore integration point:
                    // updateDoc(doc(db, "posts", id), patch)
                    throw new Error("Firestore is not connected.");
                },
                async updateComment() {
                    // Firestore integration point:
                    // updateDoc(doc(db, "comments", id), patch)
                    throw new Error("Firestore is not connected.");
                },
                async deleteDiscussion() {
                    // Firestore integration point:
                    // deleteDoc(doc(db, "discussions", id))
                    throw new Error("Firestore is not connected.");
                },
                async deletePost() {
                    // Firestore integration point:
                    // deleteDoc(doc(db, "posts", id))
                    throw new Error("Firestore is not connected.");
                },
                async deleteComment() {
                    // Firestore integration point:
                    // deleteDoc(doc(db, "comments", id))
                    throw new Error("Firestore is not connected.");
                }
            }
        };
    }
})();
