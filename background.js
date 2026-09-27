// background.js – Manifest v3
// ===========================

const CHATGPT_ORIGIN = "https://chatgpt.com";

/**
 * Retrieve user‑settings (prompts array + preferred model) stored via options page.
 * Returns: { prompts: Array<{name, content, default}>, model: string }
 */
function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        prompts: [
          { name: "Default", content: "Summarize this video", default: true }
        ],
        model: ""
      },
      (items) => resolve(items)
    );
  });
}


/**
 * Injects `text` into ChatGPT’s textarea inside the given tab.
 */
async function injectPrompt(tabId, text) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [text],
        func: async (payload) => {
          const selector = '.ProseMirror[data-composer-markdown][contenteditable="true"], [role="textbox"][aria-label="Ask ChatGPT"][contenteditable="true"], #prompt-textarea, #mobile-composer-prompt, textarea[aria-label="Chat with ChatGPT"], textarea[data-testid*="composer"]';
          const editor = [...document.querySelectorAll(selector)]
            .find(el => el.getClientRects().length && !el.closest('[hidden]'));
          if (!editor) return false;

          editor.focus();
          if (editor instanceof HTMLTextAreaElement) {
            const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
            setter.call(editor, payload);
            editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload }));
            editor.setSelectionRange(payload.length, payload.length);
          } else if (editor.isContentEditable) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editor);
            selection.removeAllRanges();
            selection.addRange(range);
            document.execCommand('insertText', false, payload);
          } else {
            return false;
          }

          // ChatGPT may replace the composer during hydration or a React render.
          await new Promise(resolve => setTimeout(resolve, 700));
          if (!editor.isConnected) return false;
          const actual = editor instanceof HTMLTextAreaElement ? editor.value : editor.innerText;
          const normalize = value => value.replace(/\s+/g, ' ').trim();
          return normalize(actual) === normalize(payload);
        }
      });
      if (result) return;
    } catch (error) {
      // A navigation can destroy the frame while the injection is in progress.
      if (!/frame.*(removed|navigat|unload)|document was unloaded/i.test(error.message)) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Could not keep the prompt in the ChatGPT composer');
}

async function injectPromptWithError(tabId, text) {
  try {
    await injectPrompt(tabId, text);
  } catch (error) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (message) => {
        const notice = document.createElement('div');
        notice.textContent = `YouTube → ChatGPT: ${message}`;
        notice.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;padding:12px 16px;background:#9b1c1c;color:white;border-radius:8px;font:14px sans-serif;max-width:400px';
        document.body.appendChild(notice);
      },
      args: [error.message]
    }).catch(() => {});
    throw error;
  }
}

async function createChatGPTTab(model) {
  const url = new URL(CHATGPT_ORIGIN);
  if (model) url.searchParams.set('model', model);
  const tab = await chrome.tabs.create({ url: url.toString() });
  if (tab.status !== 'complete') {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        reject(new Error('ChatGPT page did not finish loading'));
      }, 30000);
      const listener = (id, info) => {
        if (id === tab.id && info.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      chrome.tabs.get(tab.id).then(current => {
        if (current.status === 'complete') listener(tab.id, { status: 'complete' });
      }).catch(reject);
    });
  }
  return tab;
}

/**
 * Ensures a ChatGPT tab is available, focuses it, then writes the prepared message.
 * Now supports prompt selection overlay.
 */
async function openChatGPTWithData(data, promptContent, model) {
  const message = `${promptContent}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;

  const tab = await createChatGPTTab(model);
  await injectPromptWithError(tab.id, message);
}

// Helper: open ChatGPT, inject prompt, then inject publisher.js to monitor and POST answer
async function openChatGPTAndPublish(data, promptContent, model) {
  const message = `${promptContent}\n\n---\n## Video Title: ${data.title}\n## URL: ${data.url}\n## Transcript\n${data.transcript}`;
  const tab = await createChatGPTTab(model);
  await injectPromptWithError(tab.id, message);
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
    if (command === "copy-transcript") {
      await chrome.tabs.sendMessage(tab.id, { action: "copyTranscript" });
      return;
    }

    if (command === "summarize-video" || command === "publish-transcript") {
      // Ask content script for the video data (title + transcript)
      const videoData = await chrome.tabs.sendMessage(tab.id, { action: "getVideoData" });
      if (!videoData) return;
      if (videoData.error) throw new Error(videoData.error);
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
    console.warn("YouTube → ChatGPT:", err);
    chrome.tabs.sendMessage(tab.id, { action: 'showError', message: err.message }).catch(() => {});
  }
});
