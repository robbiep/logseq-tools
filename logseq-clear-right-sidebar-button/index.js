/**
 * Logseq Clear Sidebar Button
 * Adds button to sidebar to clear it. Alternative to using hotkeys
 */
import "@logseq/libs";

function injectButton() {
  const doc = parent.document;
  const sidebarMenu = doc.querySelector(
    '.cp__right-sidebar-settings'
  );
  if (!sidebarMenu) return;

  const BUTTON_ID = 'ls-clear-sidebar-btn';
  // Only create new button if none exists
  if (doc.getElementById(BUTTON_ID)) return;

  // Create button
  const wrapper = doc.createElement('div');
  wrapper.className = 'text-sm';
  const btn = doc.createElement('button');
  btn.id = BUTTON_ID;
  btn.className = 'button cp__right-sidebar-settings-btn ti-trash';
  btn.textContent = 'Clear';


  btn.onclick = () => {
    parent.logseq.api.clear_right_sidebar_blocks();
  };

  wrapper.appendChild(btn);
  sidebarMenu.appendChild(wrapper);
}

function observe() {
  const doc = parent.document;
  const sidebar = doc.querySelector('.cp__right-sidebar');
  if (!sidebar) return;

  const observer = new parent.MutationObserver(() => injectButton());
  observer.observe(sidebar, { childList: true, subtree: true });
}

logseq.ready(() => {
  injectButton();
  observe();
  console.log('Clear sidebar button - plugin loaded')
});
