// background.js – Manifest v3
// ===========================

const CHATGPT_ORIGIN = "https://chat.openai.com";

/**
 * Retrieve user‑settings (default prompt + preferred model) stored via options page.
 * Returns: { prompt: string, model: string }
 */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        prompt: "Summarize this video", // default prompt
        model: "o3" // default model slug
      },
      (items) => resolve(items)
    );
  });
}


/**
 * Older version
 * Injects text into ChatGPT’s textarea inside the given tab.
 */
/*
async function injectPrompt(tabId, text) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (payload) => {
      const promptDiv = document.querySelector("#prompt-textarea");
      if (!promptDiv) return;
      promptDiv.innerHTML   = "<p>" + payload.replace(/\n/g, '</p><p>') + "</p>";
      promptDiv.dispatchEvent(new InputEvent("input", { bubbles: true }));
      promptDiv.focus();
    }
  });
}
*/





/**
 * Injects `text` into ChatGPT’s textarea inside the given tab.
 */
async function injectPrompt(tabId, text) {
  await chrome.scripting.executeScript({
    target: { tabId },
    args: [text],
    func: (payload) => {
      const INTERVAL = 100;      // ms between retries
      const MAX_TRIES = 40;      // ≈ 4 s total

      let tries = 0;
      (function tryInject() {
        const promptDiv = document.querySelector("#prompt-textarea");
        if (promptDiv) {
          promptDiv.innerHTML = "<p>" + payload.replace(/\n/g, '</p><p>') + "</p>";
          promptDiv.dispatchEvent(new InputEvent("input", { bubbles: true }));
          promptDiv.focus();
          // Scroll to bottom and place cursor at end
          promptDiv.scrollTop = promptDiv.scrollHeight;
          // Move cursor to end
          if (window.getSelection && document.createRange) {
            const range = document.createRange();
            range.selectNodeContents(promptDiv);
            range.collapse(false); // to end
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } else if (++tries < MAX_TRIES) {
          setTimeout(tryInject, INTERVAL);
        }
      })();
    }
  });
}

/**
 * Ensures a ChatGPT tab is available, focuses it, then writes the prepared message.
 */
async function openChatGPTWithData(data) {
  const { prompt, model } = await loadSettings();

  const message = `${prompt}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;

  // Look for an existing ChatGPT tab first
  const existingTabs = await chrome.tabs.query({ url: `${CHATGPT_ORIGIN}/*` });
  let tab = existingTabs[0];

  if (!tab) {
    // No tab → create one with model query param so ChatGPT pre‑selects it
    tab = await chrome.tabs.create({ url: `${CHATGPT_ORIGIN}/?model=${model}` });

    // Wait for the newly‑created tab to finish loading
    await new Promise((resolve) => {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  } else {
    // Bring the tab to front if it already existed
    await chrome.tabs.update(tab.id, { active: true });
  }

  // Finally inject the prompt
  await injectPrompt(tab.id, message);
}

// Helper: open ChatGPT, inject prompt, then inject publisher.js to monitor and POST answer
async function openChatGPTAndPublish(data) {
  const { prompt, model } = await loadSettings();
  const message = `${prompt}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;

  // Look for an existing ChatGPT tab first
  //const existingTabs = await chrome.tabs.query({ url: `${CHATGPT_ORIGIN}/*` });
  //let tab = existingTabs[0];
  let tab = null;

  if (!tab) {
    tab = await chrome.tabs.create({ url: `${CHATGPT_ORIGIN}/?model=${model}` });
    await new Promise((resolve) => {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tab.id && info.status === "complete") {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  } else {
    await chrome.tabs.update(tab.id, { active: true });
  }

  await injectPrompt(tab.id, message);
  // Inject publisher.js to monitor for answer and POST to server
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["publisher.js"]
  });
}

// ---------------------------------------------------------------------------
// COMMAND HANDLER (keyboard shortcut defined in manifest → commands)
// ---------------------------------------------------------------------------
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!tab?.id) return;

  try {
    if (command === "summarize-video") {
      // Ask content script for the video data (title + transcript)
      const videoData = await chrome.tabs.sendMessage(tab.id, { action: "getVideoData" });
      if (!videoData) return;
      await openChatGPTWithData(videoData);
    } else if (command === "publish-transcript") {
      // Ask content script for the video data (title + transcript)
      const videoData = await chrome.tabs.sendMessage(tab.id, { action: "getVideoData" });
      if (!videoData) return;
      await openChatGPTAndPublish(videoData);
    }
  } catch (err) {
    // Likely no content script (user isn’t on youtube.com/watch)
    console.warn("YouTube → ChatGPT: cannot collect video data – are you on a watch page?", err);
  }
});
