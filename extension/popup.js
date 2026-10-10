/* On-demand scan for pages outside the built-in site list. Uses activeTab: access is granted only for this click. */
const btn = document.getElementById('scan');
const status = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  status.textContent = 'Scanning…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || tab.id === undefined) throw new Error('no tab');
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['lib/popular.js', 'lib/core.js', 'content.js'] });
    status.textContent = 'Done. Results appear at the bottom right of the page. No badge there means no install commands were found.';
  } catch (_) {
    status.textContent = 'This page cannot be scanned (browser pages and the Web Store are off limits to extensions).';
  } finally {
    btn.disabled = false;
  }
});
