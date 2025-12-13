// Logseq Enhanced Properties Plugin
// Provides tabular editing interface for page properties

const pluginId = "logseq-enhanced-properties";

const main = async () => {
  console.log(`${pluginId} loaded`);

  // CSS for the property table interface
  logseq.provideStyle(`
    .enhanced-props-container {
      margin: 16px 0;
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
      padding: 8px;
      font-weight: 600;
      border-bottom: 2px solid var(--ls-border-color);
      color: var(--ls-primary-text-color);
    }

    .enhanced-props-table td {
      padding: 8px;
      border-bottom: 1px solid var(--ls-border-color);
    }

    .enhanced-props-table tr:last-child td {
      border-bottom: none;
    }

    .enhanced-props-input {
      width: 100%;
      padding: 6px 8px;
      background: var(--ls-primary-background-color);
      border: 1px solid var(--ls-border-color);
      border-radius: 4px;
      color: var(--ls-primary-text-color);
      font-family: inherit;
      font-size: inherit;
    }

    .enhanced-props-input:focus {
      outline: none;
      border-color: var(--ls-link-text-color);
    }

    .enhanced-props-btn {
      padding: 6px 12px;
      background: var(--ls-primary-background-color);
      border: 1px solid var(--ls-border-color);
      border-radius: 4px;
      color: var(--ls-primary-text-color);
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s;
    }

    .enhanced-props-btn:hover {
      background: var(--ls-quaternary-background-color);
    }

    .enhanced-props-btn-primary {
      background: var(--ls-link-text-color);
      color: white;
      border-color: var(--ls-link-text-color);
    }

    .enhanced-props-btn-primary:hover {
      opacity: 0.9;
    }

    .enhanced-props-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      align-items: center;
    }

    .enhanced-props-delete {
      color: var(--ls-error-text-color);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }

    .enhanced-props-delete:hover {
      background: var(--ls-quaternary-background-color);
    }

    .enhanced-props-empty {
      text-align: center;
      padding: 20px;
      color: var(--ls-secondary-text-color);
      font-style: italic;
    }

    /* Hide property blocks when table is visible */
    body[data-enhanced-props-mode="table"] .page-blocks-inner > .ls-block:first-child {
      display: none !important;
    }
  `);

  let currentPage = null;
  let properties = [];
  let propertyBlockUuid = null;
  let isMarkdownMode = false;
  let editCheckInterval = null;

  // Parse properties from markdown content
  const parseProperties = (content) => {
    if (!content) return [];
    const props = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('-') && !line.includes('::')) break; // Hit content section
      
      // Remove leading dash if present
      const cleanLine = line.startsWith('-') ? line.substring(1).trim() : line;
      
      const match = cleanLine.match(/^([^:]+)::\s*(.*)$/);
      if (match) {
        props.push({
          key: match[1].trim(),
          value: match[2].trim()
        });
      } else if (!line.includes('::')) {
        break; // No longer in properties section
      }
    }
    
    return props;
  };

  // Serialize properties back to markdown format
  const serializeProperties = (props) => {
    return props.map(p => `${p.key}:: ${p.value}`).join('\n');
  };

  // Get content after properties
  const getContentAfterProps = (content) => {
    if (!content) return '';
    const lines = content.split('\n');
    let i = 0;
    
    // Skip properties
    for (; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cleanLine = line.startsWith('-') ? line.substring(1).trim() : line;
      if (line.startsWith('-') && !line.includes('::')) break;
      if (!cleanLine.match(/^[^:]+::\s*.*$/)) break;
    }
    
    // Skip empty lines between properties and content
    while (i < lines.length && !lines[i].trim()) {
      i++;
    }
    
    return lines.slice(i).join('\n');
  };

  // Update page content with new properties
  const updatePageProperties = async (pageName, newProps) => {
    const page = await logseq.Editor.getPage(pageName);
    if (!page) return;

    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    const currentContent = blocks.map(b => b.content).join('\n') || '';
    
    const contentAfterProps = getContentAfterProps(currentContent);
    const propsText = serializeProperties(newProps);
    
    let newContent = propsText;
    if (contentAfterProps.trim()) {
      newContent += '\n\n' + contentAfterProps;
    }

    // Clear existing blocks
    for (const block of blocks) {
      await logseq.Editor.removeBlock(block.uuid);
    }

    // Insert new content
    if (newContent.trim()) {
      const block = await logseq.Editor.insertBlock(page.name, newContent, {
        isPageBlock: true,
        sibling: false
      });
      if (block && newProps.length > 0) {
        propertyBlockUuid = block.uuid;
      }
    }

    properties = newProps;
  };

  // Set mode (table or markdown)
  const setMode = (mode) => {
    const doc = parent.document;
    doc.body.setAttribute('data-enhanced-props-mode', mode);
    isMarkdownMode = (mode === 'markdown');
  };

  // Watch for editing of the property block
  const watchForPropertyEditing = async (pageName) => {
    if (editCheckInterval) {
      clearInterval(editCheckInterval);
    }

    editCheckInterval = setInterval(async () => {
      const currentBlock = await logseq.Editor.getCurrentBlock();
      
      if (currentBlock && currentBlock.uuid === propertyBlockUuid) {
        // Currently editing the property block - hide table
        if (!isMarkdownMode) {
          setMode('markdown');
        }
      } else {
        // Not editing the property block anymore
        if (isMarkdownMode) {
          // Re-fetch properties and show table
          if (propertyBlockUuid) {
            const block = await logseq.Editor.getBlock(propertyBlockUuid);
            if (block) {
              properties = parseProperties(block.content);
            }
          }
          
          setMode('table');
          await renderPropertiesUI(pageName);
        }
      }
    }, 200);
  };

  // Create the HTML for the properties UI
  const createPropertiesHTML = (pageName, props) => {
    const safePageName = pageName.replace(/[^a-zA-Z0-9]/g, '-');
    
    return `
      <div class="enhanced-props-container" data-page="${pageName}" id="enhanced-props-${safePageName}">
        ${props.length === 0 ? 
          `<div class="enhanced-props-empty">No properties yet</div>` :
          `<table class="enhanced-props-table">
            <thead>
              <tr>
                <th style="width: 30%">Property</th>
                <th style="width: 60%">Value</th>
                <th style="width: 10%"></th>
              </tr>
            </thead>
            <tbody id="props-tbody-${safePageName}">
              ${props.map((prop, idx) => `
                <tr data-idx="${idx}">
                  <td>
                    <input 
                      class="enhanced-props-input prop-key" 
                      value="${prop.key.replace(/"/g, '&quot;')}"
                      data-idx="${idx}"
                    />
                  </td>
                  <td>
                    <input 
                      class="enhanced-props-input prop-value" 
                      value="${prop.value.replace(/"/g, '&quot;')}"
                      data-idx="${idx}"
                    />
                  </td>
                  <td>
                    <span class="enhanced-props-delete" data-idx="${idx}">🗑️</span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
        }
        <div class="enhanced-props-actions">
          <button class="enhanced-props-btn enhanced-props-btn-primary" id="add-prop-${safePageName}">
            + Add new property
          </button>
          <button class="enhanced-props-btn" id="toggle-markdown-${safePageName}">
            Edit as markdown
          </button>
        </div>
      </div>
    `;
  };

  // Attach event listeners to the UI
  const attachEventListeners = (pageName, safePageName) => {
    const doc = parent.document;
    const container = doc.getElementById(`enhanced-props-${safePageName}`);
    
    if (!container) return;

    // Prevent clicks inside the container from bubbling to Logseq
    container.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    
    container.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Add property button
    const addBtn = doc.getElementById(`add-prop-${safePageName}`);
    if (addBtn) {
      addBtn.onclick = async () => {
        const newProps = [...properties, { key: 'new-property', value: '' }];
        await updatePageProperties(pageName, newProps);
        await renderPropertiesUI(pageName);
      };
    }

    // Toggle markdown mode
    const toggleBtn = doc.getElementById(`toggle-markdown-${safePageName}`);
    
    if (toggleBtn) {
      toggleBtn.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        // Get the first block (property block)
        const blocks = await logseq.Editor.getPageBlocksTree(pageName);
        if (blocks && blocks.length > 0) {
          propertyBlockUuid = blocks[0].uuid;
          
          // Switch to markdown mode (hide table, show block)
          setMode('markdown');
          
          // Wait a bit for the block to be visible, then enter edit mode
          setTimeout(async () => {
            await logseq.Editor.editBlock(propertyBlockUuid);
            watchForPropertyEditing(pageName);
          }, 100);
        } else {
          // No blocks exist, create one
          const propsText = properties.length > 0 
            ? serializeProperties(properties)
            : 'new-property:: ';
          
          const block = await logseq.Editor.insertBlock(pageName, propsText, {
            isPageBlock: true,
            sibling: false
          });
          
          if (block) {
            propertyBlockUuid = block.uuid;
            setMode('markdown');
            
            setTimeout(async () => {
              await logseq.Editor.editBlock(propertyBlockUuid);
              watchForPropertyEditing(pageName);
            }, 100);
          }
        }
      };
    }

    // Delete buttons
    const deleteButtons = doc.querySelectorAll(`#enhanced-props-${safePageName} .enhanced-props-delete`);
    deleteButtons.forEach(btn => {
      btn.onclick = async () => {
        const idx = parseInt(btn.getAttribute('data-idx'));
        const newProps = properties.filter((_, i) => i !== idx);
        await updatePageProperties(pageName, newProps);
        await renderPropertiesUI(pageName);
      };
    });

    // Input change handlers for keys
    const keyInputs = doc.querySelectorAll(`#enhanced-props-${safePageName} .prop-key`);
    keyInputs.forEach(input => {
      input.onclick = (e) => {
        e.stopPropagation();
      };
      
      input.onkeydown = (e) => {
        e.stopPropagation();
      };
      
      input.onblur = async () => {
        const idx = parseInt(input.getAttribute('data-idx'));
        if (idx >= 0 && idx < properties.length) {
          properties[idx].key = input.value;
          await updatePageProperties(pageName, properties);
        }
      };
      
      input.onkeypress = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      };
    });

    // Value inputs
    const valueInputs = doc.querySelectorAll(`#enhanced-props-${safePageName} .prop-value`);
    valueInputs.forEach(input => {
      input.onclick = (e) => {
        e.stopPropagation();
      };
      
      input.onkeydown = (e) => {
        e.stopPropagation();
      };
      
      input.oninput = (e) => {
        e.stopPropagation();
      };
      
      input.onblur = async () => {
        const idx = parseInt(input.getAttribute('data-idx'));
        if (idx >= 0 && idx < properties.length) {
          properties[idx].value = input.value;
          await updatePageProperties(pageName, properties);
        }
      };
      
      input.onkeypress = async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const idx = parseInt(input.getAttribute('data-idx'));
          if (idx >= 0 && idx < properties.length) {
            properties[idx].value = input.value;
            await updatePageProperties(pageName, properties);
            input.blur();
          }
        }
      };
    });
  };

  // Inject UI into the page DOM
  const injectUI = (pageName, html) => {
    const doc = parent.document;
    const safePageName = pageName.replace(/[^a-zA-Z0-9]/g, '-');
    
    // Remove existing UI if present
    const existing = doc.getElementById(`enhanced-props-${safePageName}`);
    if (existing) {
      existing.remove();
    }

    // Find the page-blocks-inner container
    const pageBlocksInner = doc.querySelector('.page-blocks-inner');
    if (!pageBlocksInner) {
      console.log('page-blocks-inner not found');
      return false;
    }

    // Create and insert the UI
    const container = doc.createElement('div');
    container.innerHTML = html;
    const uiElement = container.firstElementChild;
    
    // Insert at the beginning of page-blocks-inner
    pageBlocksInner.insertBefore(uiElement, pageBlocksInner.firstChild);
    
    console.log('UI injected successfully under page-blocks-inner');
    return true;
  };

  // Render the property table UI
  const renderPropertiesUI = async (pageName) => {
    console.log('renderPropertiesUI called for:', pageName);
    
    // Don't render if we're in markdown mode
    if (isMarkdownMode) {
      console.log('Skipping render - in markdown mode');
      return;
    }
    
    const page = await logseq.Editor.getPage(pageName);
    if (!page) {
      console.log('Page not found:', pageName);
      return;
    }

    const blocks = await logseq.Editor.getPageBlocksTree(pageName);
    const content = blocks.map(b => b.content).join('\n') || '';
    properties = parseProperties(content);
    
    // Store the first block UUID
    if (blocks.length > 0) {
      propertyBlockUuid = blocks[0].uuid;
    }

    console.log('Parsed properties:', properties);

    const safePageName = pageName.replace(/[^a-zA-Z0-9]/g, '-');
    const html = createPropertiesHTML(pageName, properties);
    
    // Try to inject UI, retry if page not ready
    let attempts = 0;
    const maxAttempts = 20;
    
    const tryInject = () => {
      attempts++;
      console.log(`Injection attempt ${attempts}/${maxAttempts}`);
      
      const success = injectUI(pageName, html);
      if (success) {
        setMode('table');
        attachEventListeners(pageName, safePageName);
        // Start watching for property block edits
        watchForPropertyEditing(pageName);
      } else if (attempts < maxAttempts) {
        setTimeout(tryInject, 200);
      } else {
        console.log('Failed to inject UI after maximum attempts');
      }
    };
    
    tryInject();
  };

  // Listen for page changes
  logseq.App.onRouteChanged(async ({ path }) => {
    console.log('Route changed:', path);
    
    // Clean up
    if (editCheckInterval) {
      clearInterval(editCheckInterval);
      editCheckInterval = null;
    }
    isMarkdownMode = false;
    setMode('table');
    
    if (path.startsWith('/page/')) {
      const pageName = decodeURIComponent(path.replace('/page/', ''));
      currentPage = pageName;
      setTimeout(() => renderPropertiesUI(pageName), 500);
    }
  });

  // Initial render for current page
  setTimeout(async () => {
    const currentPath = window.location.hash;
    console.log('Initial path:', currentPath);
    if (currentPath.includes('/page/')) {
      const pageName = decodeURIComponent(currentPath.split('/page/')[1]);
      currentPage = pageName;
      await renderPropertiesUI(pageName);
    }
  }, 1500);

  console.log(`${pluginId} initialization complete`);
};

logseq.ready(main).catch(console.error);