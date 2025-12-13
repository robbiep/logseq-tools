//import '@logseq/libs';

// --- CONFIG & STATE ---
const CONTAINER_ID = 'logseq-visual-props-container';
const STYLE_ID = 'visual-props-css';
let isMarkdownMode = false;
let activeBlockUuid = null;

// --- CSS (omitted for brevity) ---
const CSS = `
.visual-props-hidden-block { display: none !important; }
#${CONTAINER_ID} { background: var(--ls-primary-background-color); border-bottom: 1px solid var(--ls-border-color); padding: 12px 20px; margin-bottom: 10px; border-radius: 4px; }
.vp-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.vp-table tr:hover { background: var(--ls-tertiary-background-color); }
.vp-table td { padding: 6px; border-bottom: 1px solid var(--ls-border-color); vertical-align: middle; }
.vp-input { width: 100%; background: transparent; border: 1px solid transparent; color: var(--ls-primary-text-color); padding: 4px; border-radius: 4px; }
.vp-input:focus { background: var(--ls-secondary-background-color); border-color: var(--ls-link-text-color); outline: none; }
.vp-key-col { width: 25%; font-weight: 600; color: var(--ls-secondary-text-color); }
.vp-val-col { width: 70%; }
.vp-del-col { width: 5%; text-align: center; }
.vp-btn-row { margin-top: 12px; display: flex; gap: 10px; }
.vp-btn { background: var(--ls-secondary-background-color); color: var(--ls-primary-text-color); border: 1px solid var(--ls-border-color); padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; }
.vp-btn:hover { background: var(--ls-tertiary-background-color); }
.vp-del-btn { color: var(--ls-error-text-color); cursor: pointer; font-weight: bold; padding: 4px; border-radius: 4px; font-size: 16px; line-height: 1; }
.vp-del-btn:hover { background: rgba(255, 0, 0, 0.1); }
`;


// --- MAIN ---
const main = async () => {
    // 1. Inject Global Styles
    logseq.provideStyle({ key: STYLE_ID, style: CSS });

    // 2. Define Model Router
    logseq.provideModel({
        /**
         * The single entry point for all UI interactions.
         * The function name 'routePropsEvent' is exposed globally by Logseq, 
         * and is called without the 'logseq.api.' prefix in the HTML.
         */
        async routePropsEvent(e) {
            const element = e;
            const action = element.dataset.action;
            const line = element.dataset.line;
            const type = element.dataset.type;
            const value = element.value;

            switch (action) {
                case 'update':
                    await modifyPropertyLine(parseInt(line), type, value);
                    setTimeout(checkAndRender, 50);
                    break;
                case 'delete':
                    await deletePropertyLine(parseInt(line));
                    setTimeout(checkAndRender, 50);
                    break;
                case 'add':
                    await appendNewProperty();
                    setTimeout(checkAndRender, 100);
                    break;
                case 'toggle':
                    await enableMarkdownMode();
                    break;
                default:
                    console.error('Unknown action:', action);
            }
        },
    });

    // 3. Observers (Same as before)
    logseq.App.onRouteChanged(() => {
        isMarkdownMode = false;
        checkAndRender();
    });

    logseq.DB.onChanged(async (e) => {
        if (!isMarkdownMode) return;
        
        const doc = parent.document;
        // Check if the user is still actively editing a field
        const isEditing = doc.activeElement && 
                          (doc.activeElement.tagName === 'TEXTAREA' || doc.activeElement.tagName === 'INPUT');

        // If the user has clicked away (blur), exit markdown mode.
        if (!isEditing) {
            isMarkdownMode = false;
            await checkAndRender();
        }
    });

    // Initial Load
    checkAndRender();
};

// --- LOGIC: RENDER & PARSE ---

async function checkAndRender() {
    const page = await logseq.Editor.getCurrentPage();
    if (!page) { removeUI(); return; }

    const blocks = await logseq.Editor.getPageBlocksTree(page.name);
    
    activeBlockUuid = null; 
    clearHiddenBlockCSS(); 
    
    if (!blocks || blocks.length === 0) {
        renderTable(null, []);
        return;
    }

    const firstBlock = blocks[0];
    const content = firstBlock.content || "";
    const lines = content.split('\n');
    
    const hasProps = lines.some(l => l.match(/^.+?::/));

    if (hasProps) {
        activeBlockUuid = firstBlock.uuid;
        const props = parseProps(lines);
        
        if (!isMarkdownMode) {
            applyHiddenBlockCSS(activeBlockUuid);
            renderTable(activeBlockUuid, props);
        } else {
             removeUI();
        }
    } else {
        activeBlockUuid = null; 
        if (!isMarkdownMode) {
            renderTable(null, []);
        } else {
             removeUI();
        }
    }
}

function parseProps(lines) {
    return lines.map((text, index) => {
        const match = text.match(/^(.+?)::\s*(.*)$/); 
        if (match) {
            return { index, key: match[1].trim(), value: match[2].trim(), raw: text };
        }
        return null;
    }).filter(p => p !== null); 
}

// --- LOGIC: DATA MODIFICATION ---

async function updateBlockContent(uuid, newContent) {
    if (uuid) {
        await logseq.Editor.updateBlock(uuid, newContent);
    }
}

async function modifyPropertyLine(lineIndex, type, newValue) {
    const uuid = activeBlockUuid;
    if (!uuid) return;

    const block = await logseq.Editor.getBlock(uuid);
    if (!block) return;

    let lines = block.content.split('\n');
    
    if (lineIndex >= lines.length) return;

    const currentLine = lines[lineIndex];
    const parts = currentLine.split('::');
    
    if (parts.length >= 1) {
        if (type === 'key') {
            const oldVal = parts.slice(1).join('::');
            lines[lineIndex] = `${newValue}::${oldVal.trim()}`;
        } else {
            const oldKey = parts[0];
            lines[lineIndex] = `${oldKey}:: ${newValue}`;
        }
    }

    await updateBlockContent(uuid, lines.join('\n'));
}

async function deletePropertyLine(lineIndex) {
    const uuid = activeBlockUuid;
    if (!uuid) return;

    const block = await logseq.Editor.getBlock(uuid);
    let lines = block.content.split('\n');

    lines.splice(lineIndex, 1);

    await updateBlockContent(uuid, lines.join('\n'));
}

async function appendNewProperty() {
    let uuid = activeBlockUuid;
    const newLine = 'new-key:: value';
    
    if (uuid) {
        const block = await logseq.Editor.getBlock(uuid);
        const newContent = block.content + '\n' + newLine;
        await updateBlockContent(uuid, newContent);
    } else {
        const page = await logseq.Editor.getCurrentPage();
        const newBlock = await logseq.Editor.insertBlock(page.name, newLine, { before: true });
        if (newBlock) {
             activeBlockUuid = newBlock.uuid;
        }
    }
}

async function enableMarkdownMode() {
    isMarkdownMode = true;
    clearHiddenBlockCSS();
    removeUI();
    
    if (activeBlockUuid) {
        await logseq.Editor.editBlock(activeBlockUuid);
    } else {
        const page = await logseq.Editor.getCurrentPage();
        const newBlock = await logseq.Editor.insertBlock(page.name, 'new-key:: value', { before: true });
        if (newBlock) {
             activeBlockUuid = newBlock.uuid;
             await logseq.Editor.editBlock(activeBlockUuid);
        }
    }
}

// --- UI & DOM MANIPULATION ---

function renderTable(uuid, props) {
    // UPDATED: All HTML events now call the model function 'routePropsEvent(this)' without 'logseq.api.'
    const rowsHtml = props.map(p => `
        <tr>
            <td class="vp-key-col">
                <input class="vp-input" 
                       data-action="update" 
                       data-line="${p.index}" 
                       data-type="key" 
                       value="${p.key}" 
                       onchange="routePropsEvent(this)" />
            </td>
            <td class="vp-val-col">
                <input class="vp-input" 
                       data-action="update" 
                       data-line="${p.index}" 
                       data-type="val" 
                       value="${p.value}" 
                       onchange="routePropsEvent(this)" />
            </td>
            <td class="vp-del-col">
                <div class="vp-del-btn" 
                     data-action="delete" 
                     data-line="${p.index}" 
                     onclick="routePropsEvent(this)">✕</div>
            </td>
        </tr>
    `).join('');

    const html = `
        <div data-uuid="${uuid || ''}">
            <table class="vp-table">
                ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="3" style="text-align:center; opacity:0.6; padding:10px;">No properties</td></tr>'}
            </table>
            <div class="vp-btn-row">
                <button class="vp-btn" data-action="add" onclick="routePropsEvent(this)">+ Add new property</button>
                <button class="vp-btn" data-action="toggle" onclick="routePropsEvent(this)">Edit as Markdown</button>
            </div>
        </div>
    `;

    const doc = parent.document;
    let container = doc.getElementById(CONTAINER_ID);
    
    if (!container) {
        container = doc.createElement('div');
        container.id = CONTAINER_ID;
    }
    
    container.innerHTML = html;

    const targetParent = doc.querySelector('.page-blocks-inner');
    
    if (targetParent) {
        if (targetParent.firstChild !== container) {
            targetParent.prepend(container);
        }
    }
}

function removeUI() {
    const doc = parent.document;
    const el = doc.getElementById(CONTAINER_ID);
    if (el) el.remove();
}

function applyHiddenBlockCSS(uuid) {
    const doc = parent.document;
    clearHiddenBlockCSS();

    const blockEl = doc.querySelector(`div[blockid="${uuid}"]`);
    if (blockEl) {
        blockEl.classList.add('visual-props-hidden-block');
    }
}

function clearHiddenBlockCSS() {
    const doc = parent.document;
    const hidden = doc.querySelectorAll('.visual-props-hidden-block');
    hidden.forEach(el => el.classList.remove('visual-props-hidden-block'));
}

logseq.ready(main).catch(console.error);