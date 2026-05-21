window.addEventListener('DOMContentLoaded', async () => {

    const textarea    = document.getElementById('note');
    const titleInput  = document.getElementById('note-title');
    const saveBtn     = document.getElementById('save');
    const saveAsBtn   = document.getElementById('save-as');
    const openFileBtn = document.getElementById('open-file');
    const newNoteBtn  = document.getElementById('new-note');
    const noteList    = document.getElementById('note-list');
    const statusEl    = document.getElementById('save_status');

    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);

    function updateWordCount(){
    const text = textarea.value;
    const characters = text.length;
    const words = text.trim() === ''? 0 : text.trim().split(/\s+/).length;
    const wordCountEl=document.getElementById('word-count');
    wordCountEl.textContent=`Words: ${words} | Characters : ${characters}`;
    }
    textarea.addEventListener('input', () =>{
        updateWordCount();
        statusEl.textCount();
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });
    async function switchNote(id) {
        textarea.value = note.content || '';
        updateWordCount();
    }

    const fontIncreaseBtn = document.getElementById('font-increase');
    const fontDecreaseBtn = document.getElementById('font-decrease');

    function applyFontSize(size){
        currentFontSize = Math.min(42, Math.max(10,size));
        textarea.style.fontSize = `${currentFontSize}px`;
    }

    fontIncreaseBtn.addEventListener('click', async () =>{
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings ({fontSize: currentFontSize});
    })

    fontDecreaseBtn.addEventListener("click",async () =>{
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize});
    })

    // State
    let notes           = [];         // all notes loaded from JSON
    let currentNoteId   = null;       // id of the note being edited
    let lastSavedContent = '';        // tracks unsaved changes
    let debounceTimer   = null;

    // ── Helpers ────────────────────────────────────────────────────────────────

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── Sidebar ────────────────────────────────────────────────────────────────

    // NEW: Render the note list in the sidebar
    function renderNotesList() {
        noteList.innerHTML = ''; // clear existing list

        notes.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');

            item.innerHTML = `
                <button class="note-item-delete" data-id="${note.id}">\u00d7</button>
                <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                <div class="note-item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
            `;

            // Click note to open it
            item.addEventListener('click', async (e) => {
                if (e.target.classList.contains('note-item-delete')) return;
                await switchNote(note.id);
            });

            // Delete button
            item.querySelector('.note-item-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteNote(note.id);
            });

            noteList.appendChild(item);
        });
    }

    // ── Switch note ────────────────────────────────────────────────────────────

    // NEW: Switch to a different note (with unsaved changes warning)
    async function switchNote(id) {
        // Check for unsaved changes first
        if (textarea.value !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return; // user cancelled – stay on current note
        }

        // Load the selected note
        const note = notes.find(n => n.id === id);
        if (!note) return;

        currentNoteId        = note.id;
        titleInput.value     = note.title   || '';
        textarea.value       = note.content || '';
        lastSavedContent     = note.content || '';
        statusEl.textContent = '';

        renderNotesList(); // refresh sidebar to show active state
    }

    // ── Save ───────────────────────────────────────────────────────────────────

    // NEW: Save the currently open note to JSON
    async function saveCurrentNote() {
        if (!currentNoteId) return;

        clearTimeout(debounceTimer);

        const note = {
            id:      currentNoteId,
            title:   titleInput.value.trim() || 'Untitled',
            content: textarea.value
        };

        const result = await window.electronAPI.saveNoteJson(note);

        if (!result.success) {
            statusEl.textContent = 'Save failed \u2716';
            statusEl.style.color = '#e05252';
            return;
        }

        lastSavedContent = textarea.value;

        // Update the note in the local array too
        const index = notes.findIndex(n => n.id === currentNoteId);
        if (index !== -1) {
            notes[index] = { ...notes[index], ...note, updatedAt: new Date().toISOString() };
        }

        renderNotesList();
        statusEl.style.color  = 'gray';
        statusEl.textContent  = `Saved at ${new Date().toLocaleTimeString()}`;
    }

    // ── Delete ─────────────────────────────────────────────────────────────────

    // NEW: Delete a note
    async function deleteNote(id) {
        const result = await window.electronAPI.newNote(); // reuse warning dialog
        if (!result.confirmed) return;

        await window.electronAPI.deleteNote(id);
        notes = notes.filter(n => n.id !== id);

        // If we deleted the current note, clear the editor
        if (currentNoteId === id) {
            currentNoteId        = null;
            titleInput.value     = '';
            textarea.value       = '';
            lastSavedContent     = '';
            statusEl.textContent = 'Note deleted.';
        }

        renderNotesList();
    }

    // ── Export ─────────────────────────────────────────────────────────────────

    async function exportNote() {
        const title   = titleInput.value.trim() || 'Untitled';
        const divider = '\u2500'.repeat(title.length);
        const text    = `${title}\n${divider}\n\n${textarea.value}`;

        const result = await window.electronAPI.saveAs(text);
        if (result.success) statusEl.textContent = 'Exported \u2714';
    }

    // ── Import ─────────────────────────────────────────────────────────────────

    async function importFile() {
        const result = await window.electronAPI.openFile();
        if (!result.success) return;

        const now = new Date().toISOString();
        const imported = {
            id:        Date.now().toString(),
            title:     result.filePath.split(/[\\/]/).pop().replace(/\.txt$/i, ''),
            content:   result.content,
            createdAt: now,
            updatedAt: now
        };

        const saveResult = await window.electronAPI.saveNoteJson(imported);
        if (!saveResult.success) {
            statusEl.textContent = 'Import failed \u2716';
            statusEl.style.color = '#e05252';
            return;
        }

        notes.unshift(imported);
        await switchNote(imported.id);
        statusEl.textContent = 'Imported \u2714';
    }

    // ── Event listeners ────────────────────────────────────────────────────────

    // UPDATED: New Note button – creates a new note in JSON storage
    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }

        // Create a new note object
        const newNote = {
            id:        Date.now().toString(),
            title:     'Untitled',
            content:   '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await window.electronAPI.saveNoteJson(newNote);
        notes.unshift(newNote);         
        currentNoteId        = newNote.id;
        titleInput.value     = '';
        textarea.value       = '';
        lastSavedContent     = '';
        renderNotesList();
        titleInput.focus();             
        statusEl.textContent = 'New note created.';
    });

    // UPDATED: Save button
    saveBtn.addEventListener('click', async () => {
        await saveCurrentNote();
    });

    saveAsBtn.addEventListener('click',   exportNote);
    openFileBtn.addEventListener('click', importFile);

    // UPDATED: Auto-save with debounce
    textarea.addEventListener('input', () => {
        statusEl.textContent = 'Unsaved changes...';
        statusEl.style.color = 'gray';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });

    // Also auto-save when title changes
    titleInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });

    // NEW: Menu action listeners
    window.electronAPI.onMenuAction('menu-new-note',  () => newNoteBtn.click());
    window.electronAPI.onMenuAction('menu-open-file', () => openFileBtn.click());
    window.electronAPI.onMenuAction('menu-save',      () => saveBtn.click());
    window.electronAPI.onMenuAction('menu-save-as',   () => saveAsBtn.click());

    

    // ── Init ──────────────────────────────────────────────────────────────────

    // UPDATED: Load all notes on startup
    notes = await window.electronAPI.getNotes();

    if (notes.length > 0) {
        // Open the most recently updated note
        const mostRecent = notes.reduce((a, b) =>
            new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b
        );
        await switchNote(mostRecent.id);
    } else {
        // No notes yet – trigger New Note automatically
        newNoteBtn.click();
    }

    

    renderNotesList();
});