// Conceptual Reagent/React Component Structure

function PropertyTable({ pageName, properties, blockId, onUpdateProperties }) {
  // properties: A map of properties (e.g., {key1: "value1"})
  // blockId: The ID of the block containing the properties (or null if none)
  
  // --- State Hooks (Conceptual) ---
  const [currentProperties, setCurrentProperties] = useState(properties || {});
  const [isMarkdownMode, setIsMarkdownMode] = useState(false);
  const [editing, setEditing] = useState({ row: null, col: null }); 
  
  // --- Functions ---

  // Requirement 6: Updates properties in the component state AND in Logseq.
  const handleCellChange = (rowIndex, colKey, newValue) => {
    const propertyKeys = Object.keys(currentProperties);
    const keyToUpdate = propertyKeys[rowIndex];
    
    // Create new property map
    let newProperties = {...currentProperties};
    
    if (colKey === 'key') {
      // Logic for changing the key name
      const values = newProperties[keyToUpdate];
      delete newProperties[keyToUpdate];
      newProperties[newValue] = values;
    } else if (colKey === 'value') {
      // Logic for changing the value
      newProperties[keyToUpdate] = newValue;
    }
    
    setCurrentProperties(newProperties);
    setEditing({ row: null, col: null });
    
    // *** Crucial Step: Call the ClojureScript function to write back to the MD file ***
    // This function must handle parsing the map into the `key:: value` format
    // and updating the correct block/page properties in Logseq's database/file.
    onUpdateProperties(newProperties, blockId); 
  };
  
  // Requirement 3: Add new property
  const handleAddProperty = () => {
    const newKey = `new_key_${Object.keys(currentProperties).length + 1}`;
    setCurrentProperties({...currentProperties, [newKey]: ""});
    // Immediately set to edit the new key
    const newRowIndex = Object.keys(currentProperties).length; 
    setEditing({ row: newRowIndex, col: 'key' });
    // Also, call onUpdateProperties to ensure the new empty property is saved
  };
  
  // Requirement 7: Toggle to Markdown Mode
  const handleToggleMarkdown = () => {
    // Hide table, show/create the markdown block, and focus it.
    setIsMarkdownMode(true);
    // In real Logseq, this would also trigger a focus event on the relevant block.
  };

  // Requirement 8: When markdown block unfocuses, refresh and show table
  // This is handled externally by a Logseq block listener, which would call:
  // onMarkdownBlockUnfocused(latestProperties) {
  //   setCurrentProperties(latestProperties);
  //   setIsMarkdownMode(false);
  // }
  
  // --- Rendering ---
  
  if (isMarkdownMode) {
    // Requirement 7: Table is hidden when in Markdown Mode
    return null; 
  }
  
  const propertiesArray = Object.entries(currentProperties);
  
  // Requirement 1 & 2: Render the table
  return (
    <div className="logseq-property-table-container">
      <div className="logseq-property-table-controls">
        {/* Requirement 7: Edit as Markdown button */}
        <button onClick={handleToggleMarkdown}>Edit as Markdown</button>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Key</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {propertiesArray.map(([key, value], index) => {
            const isEditingKey = editing.row === index && editing.col === 'key';
            const isEditingValue = editing.row === index && editing.col === 'value';

            // Requirement 5: Editable fields
            return (
              <tr key={key + index}>
                {/* Key Column */}
                <td 
                  onClick={() => setEditing({ row: index, col: 'key' })}
                  className={isEditingKey ? 'editing' : ''}
                >
                  {isEditingKey ? (
                    <input
                      type="text"
                      defaultValue={key}
                      autoFocus
                      // Requirement 5: Enter/Esc/Blur applies changes
                      onBlur={(e) => handleCellChange(index, 'key', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.target.blur();
                        }
                      }}
                    />
                  ) : (
                    <span title="Click to edit">{key}</span>
                  )}
                </td>

                {/* Value Column */}
                <td 
                  onClick={() => setEditing({ row: index, col: 'value' })}
                  className={isEditingValue ? 'editing' : ''}
                >
                  {isEditingValue ? (
                    <input
                      type="text"
                      defaultValue={value}
                      autoFocus
                      // Requirement 5: Enter/Esc/Blur applies changes
                      onBlur={(e) => handleCellChange(index, 'value', e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.target.blur();
                        }
                      }}
                    />
                  ) : (
                    <span title="Click to edit">{value || <em>No value</em>}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Requirement 3: Add new property button */}
      <button onClick={handleAddProperty}>+ Add new property</button>
    </div>
  );
}

// export default PropertyTable;