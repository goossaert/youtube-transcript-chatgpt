const promptEl = document.getElementById("prompt");
const modelEl = document.getElementById("model");
const sendPublisherEl = document.getElementById("sendPublisher");
const sendWallabagEl = document.getElementById("sendWallabag");
const wallabagFields = document.getElementById("wallabagFields");
const wallabagUrlEl = document.getElementById("wallabagUrl");
const wallabagClientIdEl = document.getElementById("wallabagClientId");
const wallabagClientSecretEl = document.getElementById("wallabagClientSecret");
const wallabagUsernameEl = document.getElementById("wallabagUsername");
const wallabagPasswordEl = document.getElementById("wallabagPassword");
const publisherUrlEl = document.getElementById("publisherUrl");

// Show/hide Wallabag fields
sendWallabagEl.addEventListener("change", () => {
  wallabagFields.style.display = sendWallabagEl.checked ? "block" : "none";
});

// Load
chrome.storage.sync.get({
  prompt: "Summarize this video",
  model: "gpt-4o",
  sendPublisher: true,
  sendWallabag: false,
  wallabagUrl: "",
  wallabagClientId: "",
  wallabagClientSecret: "",
  wallabagUsername: "",
  wallabagPassword: "",
  publisherUrl: ""
}, (opts) => {
  promptEl.value = opts.prompt;
  modelEl.value = opts.model;
  sendPublisherEl.checked = opts.sendPublisher;
  sendWallabagEl.checked = opts.sendWallabag;
  wallabagFields.style.display = opts.sendWallabag ? "block" : "none";
  wallabagUrlEl.value = opts.wallabagUrl;
  wallabagClientIdEl.value = opts.wallabagClientId;
  wallabagClientSecretEl.value = opts.wallabagClientSecret;
  wallabagUsernameEl.value = opts.wallabagUsername;
  wallabagPasswordEl.value = opts.wallabagPassword;
  publisherUrlEl.value = opts.publisherUrl;
});

// Save
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({
    prompt: promptEl.value,
    model: modelEl.value,
    sendPublisher: sendPublisherEl.checked,
    sendWallabag: sendWallabagEl.checked,
    wallabagUrl: wallabagUrlEl.value,
    wallabagClientId: wallabagClientIdEl.value,
    wallabagClientSecret: wallabagClientSecretEl.value,
    wallabagUsername: wallabagUsernameEl.value,
    wallabagPassword: wallabagPasswordEl.value,
    publisherUrl: publisherUrlEl.value
  });
  alert("Saved ✅ — remember you can change the shortcut in chrome://extensions/shortcuts");
});