# youtube-transcript-chatgpt

A Chrome extension that extracts the transcript from a YouTube video page and sends it into a ChatGPT conversation for summarization. It doesn't require any API or backend server, it lives fully in the web browser.


## How to install it

1. Download the source code of this repository in a directory on your computer
2. Open a Chrome tab and go to `chrome://extensions/`
3. Click "Load unpacked"
4. Select the directory on your computer with the source code


## How to use it

1. Open Chrome and navigate to any video page on YouTube.
2. Trigger the extension via the keyboard shortcut: Control+Shift+X on Windows and Command+Shift+X on Mac
3. This opens the transcript panel and puts your prompt and the transcript into a new ChatGPT tab. Review the draft, then send it yourself.
4. If the video has no transcript, the extension shows an error on the YouTube page.
5. If ChatGPT cannot retain the draft, an error appears in the new ChatGPT tab. Reload the extension after updating its files.


## Options

In the options panel, you can enter prompts for summarization. The model slug is optional; leave it blank to use your ChatGPT default. ChatGPT may ignore model slugs it no longer supports.

To change the keyboard shortcut, go to `chrome://extensions/shortcuts`
