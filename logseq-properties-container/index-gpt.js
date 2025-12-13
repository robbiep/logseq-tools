// Logseq Enhanced Properties Plugin (Focus/Blur Version)
const pluginId = "logseq-enhanced-properties";

const main = async () => {
  console.log(`${pluginId} loaded`);

  /********************
   * Styles
   ********************/
  logseq.provideStyle(`
    .enhanced-props-container {
      margin: 12px 0 16px 0;
      padding: 12px;
      background: var(--ls-secondary-background-color);
      border-radius: 8px;
      border: 1px solid var(--ls-border-color);
    }

    .enhanced-props-table {
      width: 100%;
      border-collapse: collapse;
    }

    .enhanced-props-table th {
      text-align: left;
      padding: 6px 8px;
      font-weight: 600;
      border-bottom: 1px solid var(--ls-border-color);
    }

    .enhanced-props-table td {
      padding: 6px 8px;
      border-bottom: 1px solid var(--ls-border-color);
    }

    .enhanced-props-input {
      width: 100%;
      background: var(--ls-primary-background-color);
      border: 1px solid var(--ls-border-color);
      border-radius: 4px;
      padding: 4px 6px;
      font-family: inherit;
      font-size: inherit;
    }

    .enhanced-props-input:focus {
      outline: none;
      border-color: var(--ls-link-text-color);
    }

    .enhanced-props-actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }

    .enhanced-props-btn {
      padding: 4px 10px;
      border-radius: 4px;
      border: 1px solid var(--ls-border-color);
      background: var(--ls-primary-background-color);
      cursor: pointer;
    }

    .enhanced-props-btn-primary {
      background: var(--ls-link-text-color);
      color: white;
      border-color: var(--ls-link-text-color);
    }

    .enhanced-props-delete {
      cursor: pointer;
      color: var(--ls-error-text-color);
    }

    .prop-row.dragging {
  opacity: 0.4;
}

.prop-row.drag-over {
  outline: 2px dashed var(--ls-link-text-color);
}

.drag-handle {
  cursor: grab;
  user-select: none;
}

  `);

  /********************
   * State
   ********************/
  let currentPage = null;
  let propertyBlockUuid = null;
  let properties = [];
  let mode = 'table'; // table | markdown

  /********************
   * Helpers
   ********************/

  const isJournalPage = async () => {
    const { journalDay } = await logseq.App.getCurrentPage();
    return journalDay
  };

  const parseProperties = (content = '') => {
    return content
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(line => {
        const m = line.match(/^([^:]+)::\s*(.*)$/);
        if (!m) return null;
        return { key: m[1].trim(), value: m[2].trim() };
      })
      .filter(Boolean);
  };

  const serializeProperties = (props) =>
    props.map(p => `${p.key}:: ${p.value}`).join('\n');

  const setMode = (next) => {
    mode = next;
    parent.document.body.setAttribute('data-enhanced-props-mode', next);
    applyVisibility();
  };

  const applyVisibility = () => {
    // hide/show property block
    const blockEl = propertyBlockUuid
      ? parent.document.querySelector(`.ls-block[class~="${propertyBlockUuid}"]`)
      : null;
    const tableEl = parent.document.querySelector('.enhanced-props-container');

    if (tableEl) tableEl.style.display = mode === 'table' ? '' : 'none';
    if (blockEl) blockEl.style.display = mode === 'table' ? 'none' : '';
  };

  const getPropertyBlock = async (pageName) => {
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    if (!blocks || blocks.length === 0) return null;

    const first = blocks[0];
    if (first.content.includes('::')) return first;
    return null;
  };

  const ensurePropertyBlock = async (pageName) => {
    if (propertyBlockUuid) return;

    // Get the current first block of the page
    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    const firstBlock = blocks && blocks.length > 0 ? blocks[0] : null;

    let block;
    if (firstBlock) {
      // Insert new block **before** the first block
      block = await logseq.Editor.insertBlock(firstBlock.uuid, '', { sibling: true, before: true });
    } else {
      // Page is empty, insert normally
      block = await logseq.Editor.insertBlock(pageName, '', { isPageBlock: true });
    }

    if (block) {
      propertyBlockUuid = block.uuid;
      properties = [];
    }
  };

  const renderPropValue = (value) => {
    if (!value) return '';
    console.log(value)

    // [[pageName]] -> <a href="/page/pageName">pageName</a>
    value = value.replace(/\[\[([^\]]+)\]\]/g, (_, pageName) => {
      const encoded = encodeURIComponent(pageName);
      return `<a href="#/page/${encoded}" class="prop-link">${pageName}</a>`;
    });

    // [alias](location) -> <a href="location">alias</a>
    value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, alias, loc) => {
      return `<a href="${loc}" class="prop-link">${alias}</a>`;
    });

    // #tagName → page link
    value = value.replace(/(^|[^\w\/])#([a-zA-Z0-9\-]+)/g, (_, prefix, tag) => {
      console.log('tag ' + prefix + tag)
      return `${prefix}<a href="#/page/${encodeURIComponent(tag)}" class="prop-link">#${tag}</a>`;
    });


    return value;
  };





  /********************
   * UI Rendering
   ********************/

  const renderUI = async (pageName) => {
    if (mode === 'markdown' || await isJournalPage()) return;

    const doc = parent.document;
    const safeId = pageName.replace(/[^a-zA-Z0-9]/g, '-');

    // Remove existing table
    const existing = doc.getElementById(`enhanced-props-${safeId}`);
    if (existing) existing.remove();

    const pageInner = doc.querySelector('.page-blocks-inner');
    if (!pageInner) return;

    const html = `
      <div class="enhanced-props-container" id="enhanced-props-${safeId}">
        ${properties.length === 0
        ? '<div style="opacity:.6">No properties</div>'
        : `<table class="enhanced-props-table">
              <thead>
                <tr><th/><th>Property</th><th>Value</th><th></th></tr>
              </thead>
<tbody>
  ${properties.map((p, i) => `
    <tr data-idx="${i}" draggable="true" class="prop-row">
      <td class="drag-handle">☰</td>
      <td><input class="enhanced-props-input prop-key" value="${p.key.replace(/"/g, '&quot;')}" /></td>
      <td>
        <div class="prop-value-container" data-idx="${i}">
          <input class="enhanced-props-input prop-value" value="${p.value.replace(/"/g, '&quot;')}" />
        </div>
      </td>
      <td><span class="enhanced-props-delete" data-idx="${i}">🗑</span></td>
    </tr>
  `).join('')}
</tbody>
            </table>`}
        <div class="enhanced-props-actions">
          <button class="enhanced-props-btn enhanced-props-btn-primary" id="add-prop-${safeId}">+ Add new property</button>
          <button class="enhanced-props-btn" id="edit-md-${safeId}">Edit as Markdown</button>
        </div>
      </div>
    `;

    const wrapper = doc.createElement('div');
    wrapper.innerHTML = html;
    pageInner.insertBefore(wrapper.firstElementChild, pageInner.firstChild);

    attachHandlers(pageName, safeId);
    setMode('table');
  };


  // ATTACH HANDLERS
  const attachHandlers = (pageName, safeId) => {
    const doc = parent.document;

    // Input box link handling
    doc.querySelectorAll('.prop-value-container').forEach(container => {
      const idx = Number(container.dataset.idx);
      const input = container.querySelector('input.prop-value');

      const renderLinks = (text) => {
        return renderPropValue(text);
      };

      const swapToRender = () => {
        let span = container.querySelector('.prop-value-render');
        if (!span) {
          span = document.createElement('span');
          span.className = 'prop-value-render';
          span.style.cursor = 'pointer';
          span.style.display = 'inline-block';
          span.style.width = '100%';
          container.appendChild(span);

          // Click the span to enter edit mode
          span.addEventListener('click', () => {
            span.style.display = 'none';
            input.style.display = '';
            input.focus();
          });

          // Click links inside span
          span.addEventListener('click', e => {
            const a = e.target.closest('a.prop-link');
            if (!a) return;
            e.stopPropagation();
            const href = a.getAttribute('href');
            if (href.startsWith('#/page/')) {
              logseq.App.pushState('page', { name: decodeURIComponent(href.replace('#/page/', '')) });
            } else {
              window.open(href, '_blank');
            }
          });
        }

        span.innerHTML = renderLinks(input.value);
        input.style.display = 'none';
        span.style.display = 'inline-block';
      };

      const swapToEdit = () => {
        input.style.display = '';
        input.focus();
      };

      // On blur, save and render
      input.addEventListener('blur', async () => {
        properties[idx].value = input.value;
        await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
        swapToRender();
      });

      // Enter/Esc finalize edit
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          input.blur();
        }
      });

      // Initial render
      swapToRender();
    });

    // Input box drag and drop
    const rows = [...doc.querySelectorAll('.prop-row')];
    let dragIndex = null;

    rows.forEach(row => {
      const rowIndex = Number(row.dataset.idx);

      row.addEventListener('dragstart', e => {
        dragIndex = rowIndex;
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      row.addEventListener('dragover', e => {
        e.preventDefault();
        row.classList.add('drag-over');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('drag-over');
      });

      row.addEventListener('drop', async e => {
        e.preventDefault();
        row.classList.remove('drag-over');

        const dropIndex = Number(row.dataset.idx);
        if (dragIndex === null || dragIndex === dropIndex) return;

        const moved = properties.splice(dragIndex, 1)[0];
        properties.splice(dropIndex, 0, moved);

        await logseq.Editor.updateBlock(
          propertyBlockUuid,
          serializeProperties(properties)
        );

        renderUI(pageName);
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('dragging');
        dragIndex = null;
      });
    });




    // Add new property
    doc.getElementById(`add-prop-${safeId}`).onclick = async () => {
      await ensurePropertyBlock(pageName);

      // Add new property
      properties.push({ key: 'new-property', value: '' });
      await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));

      renderUI(pageName);
    };

    // Edit as Markdown
    doc.getElementById(`edit-md-${safeId}`).onclick = async () => {
      await ensurePropertyBlock(pageName);



      setMode('markdown');
      await logseq.Editor.editBlock(propertyBlockUuid);
      watchPropertyBlockEditing();
    };

    // Key/value inputs
    doc.querySelectorAll('.prop-key').forEach((el, i) => {
      el.onkeydown = async e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          properties[i].key = el.value;
          await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
          el.blur();
        }
      };
      el.onblur = async () => {
        properties[i].key = el.value;
        await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
      };
    });

    doc.querySelectorAll('.prop-value').forEach((el, i) => {
      el.onkeydown = async e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          properties[i].value = el.value;
          await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
          el.blur();
        }
      };
      el.onblur = async () => {
        properties[i].value = el.value;
        await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
      };
    });

    // Delete property
    doc.querySelectorAll('.enhanced-props-delete').forEach(btn => {
      btn.onclick = async () => {
        const idx = Number(btn.dataset.idx);
        properties.splice(idx, 1);
        await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
        renderUI(pageName);
      };
    });

    doc.querySelectorAll('.prop-value').forEach((input, i) => {
      // On blur, save and update block
      input.onblur = async () => {
        properties[i].value = input.value;
        await logseq.Editor.updateBlock(propertyBlockUuid, serializeProperties(properties));
      };

      // On key press (Enter/Esc) finalize edit
      input.onkeydown = async (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          input.blur();
        }
      };

      // On click, detect if user clicked [[page]] or [alias](url)
      input.onclick = (e) => {
        const sel = window.getSelection();
        if (!sel.rangeCount) return;
        const value = input.value;
        const cursor = input.selectionStart;

        // Check for [[pageName]]
        const regex = /\[\[([^\]]+)\]\]/g;
        let match;
        while ((match = regex.exec(value)) !== null) {
          if (cursor >= match.index && cursor <= match.index + match[0].length) {
            const pageName = match[1];
            logseq.App.pushState('page', { name: pageName });
            e.preventDefault();
            return;
          }
        }

        // Check for [alias](url)
        const regex2 = /\[([^\]]+)\]\(([^)]+)\)/g;
        while ((match = regex2.exec(value)) !== null) {
          if (cursor >= match.index && cursor <= match.index + match[0].length) {
            const url = match[2];
            window.open(url, '_blank');
            e.preventDefault();
            return;
          }
        }
      };
    });

  };

  /********************
   * Watch property block focus/blur
   ********************/

  const watchPropertyBlockEditing = () => {
    if (!propertyBlockUuid) return;

    const blockEl = parent.document.querySelector(`.ls-block[class~="${propertyBlockUuid}"]`);
    const tableEl = parent.document.querySelector('.enhanced-props-container');
    if (!blockEl || !tableEl) return;

    const observer = new MutationObserver(async () => {
      const editorWrapper = blockEl.querySelector('.editor-wrapper');
      const isEditing = !!editorWrapper;

      if (isEditing) {
        // Hide table while editing
        tableEl.style.display = 'none';
      } else {
        // Editing finished
        const block = await logseq.Editor.getBlock(propertyBlockUuid);
        if (!block) return;


        // Delay re-render to allow DOM updates
        setTimeout(() => {
          properties = parseProperties(block.content);
          setMode('table');
          renderUI(currentPage);
        }, 50);

        observer.disconnect(); // stop observing until next edit
      }
    });

    observer.observe(blockEl, { attributes: true, subtree: true, childList: true });
  };




  /********************
   * Routing
   ********************/
  logseq.App.onRouteChanged(async (e) => {
    const path = e?.path ?? '';
    if (!path.startsWith('/page/')) return;

    currentPage = decodeURIComponent(path.replace('/page/', ''));
    const propBlock = await getPropertyBlock(currentPage);
    propertyBlockUuid = propBlock?.uuid ?? null;
    properties = propBlock ? parseProperties(propBlock.content) : [];

    setTimeout(() => renderUI(currentPage), 300);
  });

  console.log(`${pluginId} ready`);
};

logseq.ready(main).catch(console.error);
