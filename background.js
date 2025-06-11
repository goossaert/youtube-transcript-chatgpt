// background.js – Manifest v3
// ===========================

const CHATGPT_ORIGIN = "https://chat.openai.com";

/**
 * Retrieve user‑settings (prompts array + preferred model) stored via options page.
 * Returns: { prompts: Array<{name, content, default}>, model: string }
 */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        prompts: [
          { name: "Default", content: "Summarize this video", default: true }
        ],
        model: "gpt-4o"
      },
      (items) => resolve(items)
    );
  });
}


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
 * Now supports prompt selection overlay.
 */
async function openChatGPTWithData(data, promptContent, model) {
  const message = `${promptContent}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;

  // Look for an existing ChatGPT tab first
  const existingTabs = await chrome.tabs.query({ url: `${CHATGPT_ORIGIN}/*` });
  let tab = existingTabs[0];

  if (!tab) {
    // No tab → create one with model query param so ChatGPT pre‑selects it
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
}

// Helper: open ChatGPT, inject prompt, then inject publisher.js to monitor and POST answer
async function openChatGPTAndPublish(data, promptContent, model) {
  const message = `${promptContent}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;
  let tab = null;
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
  await injectPrompt(tab.id, message);
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
    if (command === "summarize-video" || command === "publish-transcript") {
      // Ask content script for the video data (title + transcript)
      const videoData = await chrome.tabs.sendMessage(tab.id, { action: "getVideoData" });
      if (!videoData) return;
      // Load prompts
      const { prompts, model } = await loadSettings();
      // Ask content script to show overlay and select prompt
      const selected = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, { action: "selectPrompt", prompts }, resolve);
      });
      // If user cancels (selectedIdx is null or undefined), do nothing
      if (!selected || typeof selected.selectedIdx !== 'number' || selected.selectedIdx === null) {
        return;
      }
      let promptIdx = selected.selectedIdx;
      if (promptIdx < 0) promptIdx = prompts.findIndex(p => p.default);
      if (promptIdx < 0) promptIdx = 0;
      const promptContent = prompts[promptIdx]?.content || prompts[0].content;
      if (command === "summarize-video") {
        await openChatGPTWithData(videoData, promptContent, model);
      } else if (command === "publish-transcript") {
        await openChatGPTAndPublish(videoData, promptContent, model);
      }
    }
  } catch (err) {
    // Likely no content script (user isn’t on youtube.com/watch)
    console.warn("YouTube → ChatGPT: cannot collect video data – are you on a watch page?", err);
  }
});
