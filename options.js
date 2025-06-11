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
const promptsContainer = document.getElementById("promptsContainer");
const addPromptBtn = document.getElementById("addPrompt");
const MAX_PROMPTS = 5;

// --- Prompts UI logic ---
function renderPrompts(prompts) {
  promptsContainer.innerHTML = "";
  prompts.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "prompt-block";
    div.style.border = "1px solid #ccc";
    div.style.padding = "10px";
    div.style.marginBottom = "10px";
    div.innerHTML = `
      <label>Name <input type="text" class="prompt-name" value="${p.name || ''}" /></label>
      <label>Prompt <textarea class="prompt-content" rows="2">${p.content || ''}</textarea></label>
      <label><input type="radio" name="defaultPrompt" class="prompt-default" ${p.default ? 'checked' : ''}/> Default</label>
      <button type="button" class="removePrompt" ${prompts.length === 1 ? 'disabled' : ''}>Remove</button>
    `;
    promptsContainer.appendChild(div);
    div.querySelector(".removePrompt").onclick = () => {
      if (prompts.length > 1) {
        prompts.splice(i, 1);
        if (!prompts.some(p => p.default)) prompts[0].default = true;
        renderPrompts(prompts);
      }
    };
    div.querySelector(".prompt-default").onchange = () => {
      prompts.forEach((p, j) => p.default = (i === j));
      renderPrompts(prompts);
    };
  });
}

function getPromptsFromUI() {
  return Array.from(promptsContainer.children).map((div, i) => ({
    name: div.querySelector('.prompt-name').value,
    content: div.querySelector('.prompt-content').value,
    default: div.querySelector('.prompt-default').checked
  }));
}

addPromptBtn.onclick = () => {
  const prompts = getPromptsFromUI();
  if (prompts.length < MAX_PROMPTS) {
    prompts.push({ name: '', content: '', default: prompts.length === 0 });
    renderPrompts(prompts);
  }
};

// Show/hide Wallabag fields
sendWallabagEl.addEventListener("change", () => {
  wallabagFields.style.display = sendWallabagEl.checked ? "block" : "none";
});

// Load
chrome.storage.sync.get({
  prompts: [
    { name: "Default", content: "Summarize this video", default: true }
  ],
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
  renderPrompts(opts.prompts && opts.prompts.length ? opts.prompts : [{ name: "Default", content: "Summarize this video", default: true }]);
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
  const prompts = getPromptsFromUI();
  if (!prompts.some(p => p.default)) {
    alert("Please select a default prompt.");
    return;
  }
  chrome.storage.sync.set({
    prompts,
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