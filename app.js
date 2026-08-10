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
    listComments: async (targetId) => {
      const q = query(collection(db, "comments"), where("targetId", "==", targetId));
      const snap = await getDocs(q);
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
            createdAt: ""
        }),
        discussionOrComment: Object.freeze({
            id: "",
            targetId: "",
            author: "",
            authorUid: "",
            title: "",
            content: "",
            externalLink: "",
            createdAt: ""
        })
    });

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
        expandedTargets: new Set()
    };

    const nodes = {};

    window.communitySchemas = FIREBASE_READY_SCHEMAS;
    window.communityApp = {
        config: siteConfig,
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
            const formData = new FormData(form);
            const model = createFirestoreModel({
                targetId,
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
            state.posts = await fetchDecapPosts();
            state.posts.sort(sortByCreatedAtDesc);
            setText(nodes.postsStatus, "");
        } catch (error) {
            state.posts = [];
            setText(nodes.postsStatus, getErrorMessage(error, "Posts could not load from GitHub JSON."));
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

    async function fetchDecapPosts() {
        const apiUrl = `https://api.github.com/repos/${siteConfig.githubRepo}/contents/${trimSlashes(siteConfig.postsPath)}?ref=${encodeURIComponent(siteConfig.githubBranch)}`;
        const response = await fetch(apiUrl, {
            headers: {
                Accept: "application/vnd.github+json"
            }
        });

        if (response.status === 404) {
            return [];
        }

        if (!response.ok) {
            throw new Error(`GitHub returned ${response.status} for posts.`);
        }

        const entries = await response.json();

        if (!Array.isArray(entries)) {
            return [];
        }

        const jsonEntries = entries.filter((entry) => {
            return entry && entry.type === "file" && /\.json$/i.test(entry.name) && entry.download_url;
        });

        const posts = await Promise.all(jsonEntries.map(async (entry) => {
            try {
                const fileResponse = await fetch(entry.download_url, { cache: "no-store" });

                if (!fileResponse.ok) {
                    return null;
                }

                const rawPost = await fileResponse.json();
                return normalizePost(rawPost, entry.name);
            } catch (error) {
                return null;
            }
        }));

        return posts.filter(Boolean);
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

        const voteRail = createElement("div", { className: "vote-rail", ariaLabel: "Counters" });
        voteRail.append(
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

        body.append(createActionRow(item, type, commentCount));
        body.append(createCommentsRegion(item));

        card.append(voteRail, body);
        return card;
    }

    function createActionRow(item, type, commentCount) {
        const actionRow = createElement("div", { className: "action-row" });

        actionRow.append(createElement("button", {
            className: "action-button",
            type: "button",
            text: `Comments (${commentCount})`,
            dataset: {
                action: "toggle-comments",
                targetId: item.id
            }
        }));

        if (type === "discussion") {
            const allowed = canMutate(item);

            actionRow.append(
                createElement("button", {
                    className: "action-button",
                    type: "button",
                    text: "Edit",
                    disabled: !allowed,
                    dataset: {
                        action: "edit-discussion",
                        itemId: item.id
                    }
                }),
                createElement("button", {
                    className: "action-button danger-button",
                    type: "button",
                    text: "Delete",
                    disabled: !allowed,
                    dataset: {
                        action: "delete-discussion",
                        itemId: item.id
                    }
                })
            );
        }

        return actionRow;
    }

    function createCommentsRegion(item) {
        const region = createElement("div", {
            className: state.expandedTargets.has(item.id) ? "comments-region is-open" : "comments-region"
        });

        const list = createElement("div", { className: "comment-list" });
        const comments = state.commentsByTarget.get(item.id) || [];

        if (comments.length === 0) {
            list.append(createElement("p", { className: "empty-state", text: "No comments found." }));
        } else {
            comments.forEach((comment) => {
                list.append(createComment(comment, item.id));
            });
        }

        region.append(list, createCommentForm(item.id));
        return region;
    }

    function createComment(comment, targetId) {
        const wrapper = createElement("article", { className: "comment" });
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
        actions.append(
            createElement("button", {
                className: "action-button",
                type: "button",
                text: "Edit",
                disabled: !allowed,
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
                disabled: !allowed,
                dataset: {
                    action: "delete-comment",
                    targetId,
                    itemId: comment.id
                }
            })
        );
        wrapper.append(actions);

        return wrapper;
    }

    function createCommentForm(targetId) {
        const form = createElement("form", {
            className: "comment-form",
            dataset: {
                targetId
            }
        });

        const contentId = `comment-content-${cssSafeId(targetId)}`;
        const linkId = `comment-link-${cssSafeId(targetId)}`;

        const fieldset = createElement("fieldset", { disabled: !state.currentUser });
        fieldset.append(
            createElement("label", { htmlFor: contentId, text: "Text Content" }),
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
                text: "Reply"
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
            state.commentsByTarget.set(
                targetId,
                Array.isArray(comments) ? comments.map(normalizeDiscussionOrComment).filter(Boolean).sort(sortByCreatedAtDesc) : []
            );
        } catch (error) {
            state.commentsByTarget.set(targetId, []);
        }
    }

    async function editDiscussion(itemId) {
        const item = state.discussions.find((discussion) => discussion.id === itemId);

        if (!canMutate(item)) {
            return;
        }

        const nextContent = window.prompt("Text Content", item.content);

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

        const nextContent = window.prompt("Text Content", comment.content);

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
            setText(nodes.discussionFormStatus, "Log in to create a discussion.");
            return;
        }

        setText(nodes.sessionChip, state.currentUser.username);
        nodes.authForm.classList.add("is-hidden");
        nodes.signOutButton.classList.remove("is-hidden");
        renderProfileStatus(`${state.currentUser.username} (${state.currentUser.uid})`);
        nodes.discussionFieldset.disabled = false;
        setText(nodes.discussionFormStatus, `Logged in as ${state.currentUser.username}.`);
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
            author: values.author || "",
            authorUid: values.authorUid || "",
            title: values.title || "",
            content: values.content || "",
            externalLink: values.externalLink || "",
            createdAt: new Date().toISOString()
        };
    }

    function normalizePost(rawPost, fileName) {
        if (!rawPost || typeof rawPost !== "object") {
            return null;
        }

        const fallbackId = fileName ? fileName.replace(/\.json$/i, "") : createId();

        return {
            id: String(rawPost.id || fallbackId),
            title: String(rawPost.title || "Untitled"),
            content: String(rawPost.content || ""),
            externalLink: sanitizeExternalLink(String(rawPost.externalLink || "").trim()),
            createdAt: String(rawPost.createdAt || ""),
            author: String(rawPost.author || "Admin")
        };
    }

    function normalizeDiscussionOrComment(rawItem) {
        if (!rawItem || typeof rawItem !== "object") {
            return null;
        }

        return {
            id: String(rawItem.id || ""),
            targetId: String(rawItem.targetId || ""),
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
        const username = String(user.username || user.displayName || fallbackUsername || emailName(user.email) || "User");

        return {
            ...FIREBASE_READY_SCHEMAS.user,
            uid,
            username,
            createdAt: String(user.createdAt || user.metadata?.creationTime || "")
        };
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
        const comments = state.commentsByTarget.get(targetId);
        return comments ? comments.length : 0;
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
                async listComments() {
                    // Firestore integration point:
                    // getDocs(query(collection(db, "comments"), where("targetId", "==", targetId)))
                    return [];
                },
                async createDiscussion() {
                    // Firestore integration point:
                    // setDoc(doc(db, "discussions", model.id), model)
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
                async deleteComment() {
                    // Firestore integration point:
                    // deleteDoc(doc(db, "comments", id))
                    throw new Error("Firestore is not connected.");
                }
            }
        };
    }
})();
