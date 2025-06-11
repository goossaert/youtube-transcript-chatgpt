// publisher.js – Injected into ChatGPT tab to monitor for answer and POST to server
(function() {
  console.log('[publisher.js] Injected and running');
  // Only run on ChatGPT page
  if (!location.hostname.includes('chat.openai.com') && !location.hostname.includes('chatgpt.com')) {
    console.log('[publisher.js] Not on chat.openai.com or chatgpt.com, aborting');
    return;
  }

  // Helper to get video title from the prompt textarea (if present)
  function extractTitle() {
    // Try to find the title in the prompt textarea or in the conversation
    const textarea = document.querySelector('#prompt-textarea');
    if (textarea) {
      const match = textarea.innerText.match(/## Video Title: (.*)/);
      if (match) {
        console.log('[publisher.js] Extracted title from textarea:', match[1]);
        return match[1].trim();
      }
    }
    // Fallback: try to find in conversation
    const markdowns = document.querySelectorAll('div.markdown');
    for (const md of markdowns) {
      const match = md.innerText.match(/## Video Title: (.*)/);
      if (match) {
        console.log('[publisher.js] Extracted title from markdown:', match[1]);
        return match[1].trim();
      }
    }
    console.log('[publisher.js] Fallback to document.title:', document.title);
    return document.title;
  }

  function cleanDataStartEnd(html) {
    // Remove data-start and data-end attributes from all tags
    return html.replace(/\sdata-(start|end)="[^"]*"/g, '');
  }

  function handleAnswer(answerHtml) {
    const title = extractTitle();
    // Clean up data-start and data-end attributes
    const cleanedAnswerHtml = cleanDataStartEnd(answerHtml);
    console.log('[publisher.js] handleAnswer called. Title:', title);
    //console.log('[publisher.js] Answer HTML:', cleanedAnswerHtml);
    chrome.storage.sync.get({
      sendPublisher: true,
      sendWallabag: false,
      wallabagUrl: '',
      wallabagClientId: '',
      wallabagClientSecret: '',
      wallabagUsername: '',
      wallabagPassword: '',
      publisherUrl: ''
    }, async (settings) => {
      // Send to Publisher if enabled
      if (settings.sendPublisher) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = settings.publisherUrl;
        form.target = '_blank';
        const inputTitle = document.createElement('input');
        inputTitle.type = 'hidden';
        inputTitle.name = 'title';
        inputTitle.value = title;
        form.appendChild(inputTitle);
        const inputContent = document.createElement('input');
        inputContent.type = 'hidden';
        inputContent.name = 'content';
        inputContent.value = cleanedAnswerHtml;
        form.appendChild(inputContent);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
        alert('ChatGPT answer published!');
      }
      // Send to Wallabag if enabled
      if (settings.sendWallabag) {
        try {
          await sendToWallabag(settings, title, cleanedAnswerHtml);
          alert('ChatGPT answer sent to Wallabag!');
        } catch (e) {
          alert('Failed to send to Wallabag: ' + e.message);
        }
      }
    });
  }

  // Wallabag API helpers
  async function getWallabagToken(settings) {
    // Try to get cached token
    const tokenData = await new Promise((resolve) => {
      chrome.storage.local.get(["wallabagToken", "wallabagTokenExpires"], resolve);
    });
    const now = Date.now() / 1000;
    if (tokenData.wallabagToken && tokenData.wallabagTokenExpires && tokenData.wallabagTokenExpires > now + 60) {
      return tokenData.wallabagToken;
    }
    // Get new token
    const resp = await fetch(`${settings.wallabagUrl}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: settings.wallabagClientId,
        client_secret: settings.wallabagClientSecret,
        username: settings.wallabagUsername,
        password: settings.wallabagPassword,
      })
    });
    if (!resp.ok) throw new Error("Failed to get Wallabag token");
    const data = await resp.json();
    chrome.storage.local.set({
      wallabagToken: data.access_token,
      wallabagTokenExpires: now + data.expires_in
    });
    return data.access_token;
  }

  async function sendToWallabag(settings, title, content) {
    let formattedContent = `<article class="entry-content">${content}</article>`;
    console.log('[publisher.js] Sending to Wallabag:', formattedContent);
    const token = await getWallabagToken(settings);
    // Extract YouTube video ID from the title/url in the content (look for https://www.youtube.com/watch?v=VIDEO_ID)
    let videoId = null;
    const urlMatch = content.match(/https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})/);
    if (urlMatch) {
      videoId = urlMatch[1];
    }
    // Fallback: try to extract from any youtube.com URL
    if (!videoId) {
      const anyMatch = content.match(/youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([\w-]{11})/);
      if (anyMatch) videoId = anyMatch[1];
    }
    // Generate a 6-character base36 unique ID
    const uniqueId = Math.random().toString(36).slice(2, 8);
    let summaryUrl = 'https://youtube-summary.com/';
    if (videoId) {
      summaryUrl = `https://youtube-summary.com/youtube-id/${videoId}/unique-summary-id/${uniqueId}`;
    }
    const resp = await fetch(`${settings.wallabagUrl}/api/entries.json`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        title: title,
        content: formattedContent,
        url: summaryUrl
      })
    });
    const text = await resp.text();
    console.log('[publisher.js] Wallabag response:', text);
    if (!resp.ok) {
      // Try to extract error from HTML or JSON
      let msg = text;
      try {
        const data = JSON.parse(text);
        msg = data.error_description || data.error || text;
      } catch (e) {
        // Not JSON, likely HTML error page
        if (text.startsWith('<!DOCTYPE')) {
          msg = 'Wallabag returned an HTML error page. Check your Wallabag URL and credentials.';
        }
      }
      throw new Error("Failed to send to Wallabag: " + msg);
    }
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error('Wallabag response was not valid JSON: ' + text);
    }
  }

  let doneTimer = null;
  let lastHtml = null;

  const observer = new MutationObserver(() => {
    console.log('[publisher.js] Mutation observed');
    const markdowns = document.querySelectorAll('div.markdown');
    const last = markdowns[markdowns.length - 1];
    if (!last) {
      console.log('[publisher.js] No markdown found');
      return;
    }
    const answerHtml = last.innerHTML;

    // Instead of looking for a sibling, search the DOM for a panel/copy button that follows the last markdown
    let foundPanel = false;
    // Find all copy buttons
    const copyButtons = Array.from(document.querySelectorAll('[data-testid="copy-turn-action-button"]'));
    for (const btn of copyButtons) {
      // Find the closest answer block above this button
      const answerBlock = btn.closest('div.flex')?.previousElementSibling;
      if (answerBlock === last) {
        foundPanel = true;
        console.log('[publisher.js] Found copy button after last answer block');
        break;
      }
    }
    // Fallback: check for any panel with flex min-h-[46px] or mt-3 w-full that follows the last markdown in the DOM
    if (!foundPanel) {
      // Query separately for valid selectors
      const flexPanels = Array.from(document.querySelectorAll('div.flex'));
      const mt3Panels = Array.from(document.querySelectorAll('div.mt-3.w-full'));
      // Filter flex panels for min-h-[46px] in classList
      for (const panel of flexPanels) {
        if (Array.from(panel.classList).some(cls => cls.startsWith('min-h-')) && panel.classList.contains('min-h-[46px]')) {
          if (panel.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING) {
            foundPanel = true;
            console.log('[publisher.js] Found flex panel with min-h-[46px] after last answer block');
            break;
          }
        }
      }
      // Check mt-3 w-full panels
      if (!foundPanel) {
        for (const panel of mt3Panels) {
          if (panel.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_PRECEDING) {
            foundPanel = true;
            console.log('[publisher.js] Found mt-3 w-full panel after last answer block');
            break;
          }
        }
      }
    }
    if (!foundPanel) {
      // Still generating, clear any pending timer
      if (doneTimer) {
        clearTimeout(doneTimer);
        doneTimer = null;
        console.log('[publisher.js] Action panel not found, timer cleared');
      }
      return;
    }
    // If answer changed, reset timer
    if (answerHtml !== lastHtml) {
      lastHtml = answerHtml;
      if (doneTimer) {
        clearTimeout(doneTimer);
        console.log('[publisher.js] Answer changed, timer reset');
      }
      doneTimer = setTimeout(() => {
        observer.disconnect();
        console.log('[publisher.js] Detected answer completion (action panel found, debounced)');
        handleAnswer(lastHtml);
      }, 500); // short debounce, panel is a strong signal
      console.log('[publisher.js] Timer started for answer completion (action panel found)');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[publisher.js] MutationObserver set up');
})();
