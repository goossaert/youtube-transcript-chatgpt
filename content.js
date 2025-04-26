// content.js – runs on every YouTube watch page
// Grabs title, URL and transcript directly from the page - no external API.


// ─────────────────────────────────────────────────────────────────────────
// Helper: turn any YouTube/youtu.be/shorts/embed URL into the canonical form
// https://www.youtube.com/watch?v=XXXXXXXXXXX
function getCanonicalYouTubeUrl (rawUrl) {
  try {
    const u = new URL(rawUrl);
    let videoId = "";

    switch (u.hostname.replace(/^www\./, "")) {
      case "youtu.be":                // e.g. https://youtu.be/4sOLhFLfjuc
        videoId = u.pathname.slice(1);
        break;

      case "youtube.com":
        // Standard watch links: https://www.youtube.com/watch?v=_dtnACGlStQ&...
        if (u.searchParams.has("v")) {
          videoId = u.searchParams.get("v");
        } else {
          // Shorts or embed links: /shorts/ID  or  /embed/ID
          const m = u.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/);
          if (m) videoId = m[1];
        }
        break;
    }

    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
  } catch {
    // If URL constructor fails (unlikely), fall back to the original value
    return rawUrl;
  }
}




chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.action !== "getVideoData") return;

  (async () => {
    const title = document.title.replace(/ - YouTube$/, "");
    //const url   = location.href;
    const url   = getCanonicalYouTubeUrl(location.href);

    try {
      // 1️⃣ Reveal extra description controls so the Show‑transcript button is present (if any)
      await ensureDescriptionExpanded();
      // 2️⃣ Open the transcript side‑panel (new or classic UI)
      await ensureTranscriptPanelOpen();
    } catch (e) {
      console.warn("Could not open transcript automatically:", e);
    }

    const transcript = await scrapeTranscript();
    sendResponse({ title, url, transcript });
  })();

  return true; // keep the port open for the async response
});

/********************** UI helpers *************************/

/** Clicks the “More” link in the description so all meta‑data becomes visible. */
async function ensureDescriptionExpanded() {
  const expandBtn = Array.from(
    document.querySelectorAll("tp-yt-paper-button, yt-formatted-string, ytd-button-renderer")
  ).find(el => /\bmore\b/i.test(el.innerText) && el.offsetParent !== null);

  if (expandBtn) {
    expandBtn.click();
    await delay(300); // allow extra DOM to materialise
  }
}

/** Opens the transcript panel using either the dedicated button *or* the overflow menu. */
async function ensureTranscriptPanelOpen() {
  // If panel already exists, nothing to do
  if (document.querySelector("ytd-transcript-renderer")) return;

  // -------- 1️⃣ New UI: dedicated “Show transcript” button --------
  const showBtn = await waitForShowTranscriptButton(2500);
  if (showBtn) {
    const clickTarget = showBtn.tagName === "YTD-BUTTON-RENDERER"
      ? showBtn.querySelector("button") || showBtn
      : showBtn;

    // Scroll into view (in case it is off‑screen)
    clickTarget.scrollIntoView({ block: "center" });
    clickTarget.click();

    await waitFor(() => document.querySelector("ytd-transcript-renderer"));
    return;
  }

  // -------- 2️⃣ Classic UI: overflow (three‑dots) menu --------
  const moreActionsBtn = document.querySelector(
    "#actions ytd-menu-renderer #button-shape button, #actions ytd-menu-renderer tp-yt-paper-icon-button"
  );
  if (!moreActionsBtn) throw new Error("Actions menu not found");
  moreActionsBtn.click();

  await waitFor(() => document.querySelector("ytd-menu-service-item-renderer"));
  const transcriptItem = Array.from(document.querySelectorAll("ytd-menu-service-item-renderer"))
    .find(el => /transcript/i.test(el.innerText));
  if (!transcriptItem) throw new Error("Transcript option not present in menu");
  transcriptItem.click();

  await waitFor(() => document.querySelector("ytd-transcript-renderer"));
}

/** Waits (up to timeout ms) for a dedicated “Show transcript” button to appear and returns it. */
function waitForShowTranscriptButton(timeout = 0) {
  return new Promise(resolve => {
    const found = findShowTranscriptButton();
    if (found || !timeout) return resolve(found || null);

    const start = Date.now();
    const id = setInterval(() => {
      const btn = findShowTranscriptButton();
      if (btn || Date.now() - start > timeout) {
        clearInterval(id);
        resolve(btn || null);
      }
    }, 100);
  });
}

/** Looks for the dedicated “Show transcript” button under the description. */
function findShowTranscriptButton() {
  const elements = document.querySelectorAll("button, ytd-button-renderer");
  for (const el of elements) {
    const label = (el.getAttribute("aria-label") || "") + " " + (el.innerText || "");
    if (/show\s+transcript/i.test(label)) return el;
  }
  return null;
}

/********************** Transcript scraping *************************/

async function scrapeTranscript() {
  try {
    const panel = document.querySelector("ytd-transcript-renderer");
    if (!panel) throw new Error("Transcript panel not open (DOM element missing)");

    // Ensure every segment is rendered (lazy‑load otherwise)
    panel.scrollTo({ top: panel.scrollHeight });
    await delay(400);

    const segments = panel.querySelectorAll("ytd-transcript-segment-renderer");
    if (!segments.length) throw new Error("No transcript segments found");

    return Array.from(segments)
      .map(seg => {
        const [timestamp, ...rest] = seg.innerText.split("\n").map(s => s.trim()).filter(Boolean);
        return `${timestamp || ""} ${rest.join(" ")}`.trim();
      })
      .join("\n");
  } catch (err) {
    console.warn("Transcript scrape failed:", err);
    return "<Transcript unavailable>";
  }
}

/********************** Utility helpers *************************/

/** Waits until predicate() is truthy, rejects after timeout (ms). */
function waitFor(predicate, timeout = 6000, step = 100) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (predicate()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error("waitFor timeout"));
      }
    }, step);
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));
