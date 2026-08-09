// Navigation Elements
const btnPosts = document.getElementById('btn-posts');
const btnDiscussions = document.getElementById('btn-discussions');
const btnSettings = document.getElementById('btn-settings');

// Section Views
const postsView = document.getElementById('posts-view');
const discussionsView = document.getElementById('discussions-view');
const settingsView = document.getElementById('settings-view');

// Dark Mode Toggle Element
const darkModeToggle = document.getElementById('dark-mode-toggle');

// Helper to handle tab active states
const setActiveTab = (activeBtn, activeView) => {
    // Reset all buttons
    [btnPosts, btnDiscussions, btnSettings].forEach(btn => btn.classList.remove('active'));
    // Reset all views
    [postsView, discussionsView, settingsView].forEach(view => view.classList.add('hidden'));

    // Set active
    activeBtn.classList.add('active');
    activeView.classList.remove('hidden');
};

// 1. Navigation Event Listeners
btnPosts.addEventListener('click', () => setActiveTab(btnPosts, postsView));
btnDiscussions.addEventListener('click', () => setActiveTab(btnDiscussions, discussionsView));
btnSettings.addEventListener('click', () => setActiveTab(btnSettings, settingsView));

// 2. Dark Theme Toggle Logic (Defaulting to Dark)
const enableDarkMode = () => {
    document.body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
    darkModeToggle.checked = true;
};

const disableDarkMode = () => {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
    darkModeToggle.checked = false;
};

// Check saved user preference (Defaulting to 'dark' if none exists)
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'light') {
    disableDarkMode();
} else {
    enableDarkMode(); // Default mode
}

// Toggle listener
darkModeToggle.addEventListener('change', () => {
    if (darkModeToggle.checked) {
        enableDarkMode();
    } else {
        disableDarkMode();
    }
});