const promptEl = document.getElementById("prompt");
const modelEl = document.getElementById("model");

// Load
chrome.storage.sync.get({ prompt: "Summarize this video", model: "gpt-4o" }, (opts) => {
  promptEl.value = opts.prompt;
  modelEl.value = opts.model;
});

// Save
document.getElementById("save").addEventListener("click", () => {
  chrome.storage.sync.set({ prompt: promptEl.value, model: modelEl.value });
  alert("Saved ✅ — remember you can change the shortcut in chrome://extensions/shortcuts");
});