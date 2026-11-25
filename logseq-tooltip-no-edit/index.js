// Logseq - Prevent editing in tooltip popup
import '@logseq/libs';

function preventTooltipEdit() {
  parent.document.body.addEventListener('focusin', e => {
    const tooltip = e.target.closest('.tippy-popper');
    if (tooltip) {
      e.stopImmediatePropagation();
      e.target.blur();
    }
  }, true);

  parent.document.body.addEventListener('mousedown', e => {
    const tooltip = e.target.closest('.tippy-popper');
    if (tooltip && e.target.tagName !== 'A') {
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, true);
}

function main() {
  logseq.ready(() => {
    preventTooltipEdit();
    console.log('Tooltip no edit - loaded');
  });
}

logseq.useSettingsSchema([]);
main();
