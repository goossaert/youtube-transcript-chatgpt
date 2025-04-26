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
3. This will open the transcript panel on the video page, and copy your prompt along with the transcript into a newly open tab with the ChatGPT web interface.
4. It can sometimes happen that the ChatGPT conversation will be empty. If that's the case, just go back to the tab of the video, and press the keyboard shortcut again.


## Options

In the options panel of the extension, you can enter the prompt that you want to use for summarization, along with the OpenAI model that you want to select by default.

To change the keyboard shortcut, go to `chrome://extensions/shortcuts`
