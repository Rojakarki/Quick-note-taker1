window.addEventListener('DOMContentLoaded', async () => {
    const textarea    = document.getElementById('note');
    const titleInput  = document.getElementById('note-title');
    const saveBtn     = document.getElementById('save');
    const saveAsBtn   = document.getElementById('save-as');
    const openFileBtn = document.getElementById('open-file');
    const newNoteBtn  = document.getElementById('new-note');
    const noteList    = document.getElementById('note-list');
    const statusEl    = document.getElementById('save_status');
    const searchInput = document.getElementById('search');
 
    // ── Dark mode ─────────────────────────────────────────────────────────────
    const darkModeBtn = document.getElementById('dark-mode-toggle');
    let isDarkMode = false;
 
    function applyDarkMode(enable) {
        isDarkMode = enable;
        document.body.classList.toggle('dark-mode', enable);
        darkModeBtn.textContent = enable ? 'Light Mode' : 'Dark Mode';
    }
 
    // ── Font size ─────────────────────────────────────────────────────────────
    let currentFontSize = 16;
 
    function applyFontSize(size) {
        currentFontSize = Math.min(42, Math.max(10, size));
        textarea.style.fontSize = `${currentFontSize}px`;
    }
 
    // ── Load settings ─────────────────────────────────────────────────────────
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);
    applyDarkMode(settings.darkMode || false);
 
    // ── Word / character count ────────────────────────────────────────────────
    function updateWordCount() {
        const text = textarea.value;
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent =
            `Words: ${words} | Characters: ${text.length}`;
    }
 
    // ── State ─────────────────────────────────────────────────────────────────
    let notes            = [];
    let currentNoteId    = null;
    let lastSavedContent = '';
    let debounceTimer    = null;
 
    // ── Per-note password storage ─────────────────────────────────────────────
    // Keys are strictly "note_pw_<id>" to avoid any collision with old keys.
    function pwKey(id) {
        return 'note_pw_' + id;
    }
    function getNotePassword(id) {
        const val = localStorage.getItem(pwKey(id));
        return (val !== null && val !== '') ? val : '';
    }
    function setNotePassword(id, pw) {
        if (pw && pw.trim() !== '') {
            localStorage.setItem(pwKey(id), pw.trim());
        } else {
            localStorage.removeItem(pwKey(id));
        }
    }
    function noteIsLocked(id) {
        return getNotePassword(id) !== '';
    }

 
    // ── Lock-screen overlay ───────────────────────────────────────────────────
    const lockScreen = document.getElementById('lock-screen');
    const lockInput  = document.getElementById('lock-input');
    const lockSubmit = document.getElementById('lock-submit');
    const lockError  = document.getElementById('lock-error');
 
    // The note ID currently being unlocked — set before showing the overlay.
    let _pendingUnlockId   = null;
    let _pendingUnlockResolve = null;
 
    function _finishUnlock(success) {
        lockScreen.style.display = 'none';
        lockInput.value          = '';
        lockError.textContent    = '';
        _pendingUnlockId         = null;
        const resolve            = _pendingUnlockResolve;
        _pendingUnlockResolve    = null;
        if (resolve) resolve(success);
    }
 
    lockSubmit.addEventListener('click', () => {
        if (_pendingUnlockId === null) return;
        const expected = getNotePassword(_pendingUnlockId);
        if (lockInput.value === expected) {
            _finishUnlock(true);
        } else {
            lockError.textContent = 'Incorrect password.';
            lockInput.value = '';
            lockInput.focus();
        }
    });
 
    lockInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') lockSubmit.click();
    });
 
    function promptUnlock(id) {
        // Cancel any in-progress prompt first
        if (_pendingUnlockResolve) _finishUnlock(false);
 
        return new Promise(resolve => {
            _pendingUnlockId      = id;
            _pendingUnlockResolve = resolve;
            lockInput.value       = '';
            lockError.textContent = '';
            lockScreen.style.display = 'flex';
            setTimeout(() => lockInput.focus(), 50);
        });
    }
 
    // ── Set-password modal ────────────────────────────────────────────────────
    const modalOverlay    = document.getElementById('lock-modal-overlay');
    const modalTitle      = document.getElementById('lock-modal-title');
    const modalNewInput   = document.getElementById('lock-modal-new');
    const modalConfirmInp = document.getElementById('lock-modal-confirm');
    const modalCurrentInp = document.getElementById('lock-modal-current');
    const modalError      = document.getElementById('lock-modal-error');
    const modalRemoveBtn  = document.getElementById('lock-modal-remove');
    const modalCancelBtn  = document.getElementById('lock-modal-cancel');
    const modalSaveBtn    = document.getElementById('lock-modal-confirm-btn');
    const setLockBtn      = document.getElementById('set-lock');
 
    // The note ID the modal is operating on — captured when modal opens
    let _modalNoteId = null;
 
    function openLockModal() {
        if (!currentNoteId) return;
        _modalNoteId = currentNoteId;
 
        const hasLock = noteIsLocked(_modalNoteId);
        modalTitle.textContent   = hasLock ? 'Change / Remove Password' : 'Set Note Password';
        modalNewInput.value      = '';
        modalConfirmInp.value    = '';
        modalCurrentInp.value   = '';
        modalError.textContent   = '';
        modalCurrentInp.style.display  = hasLock ? 'block' : 'none';
        modalRemoveBtn.style.display   = hasLock ? 'inline-block' : 'none';
 
        modalOverlay.classList.add('visible');
        setTimeout(() => (hasLock ? modalCurrentInp : modalNewInput).focus(), 50);
    }
 
    function closeLockModal() {
        modalOverlay.classList.remove('visible');
        _modalNoteId = null;
    }
 
    modalCancelBtn.addEventListener('click', closeLockModal);
    modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeLockModal(); });
 
    modalSaveBtn.addEventListener('click', () => {
        if (!_modalNoteId) return;
        const hasLock   = noteIsLocked(_modalNoteId);
        const currentPw = modalCurrentInp.value;
        const newPw     = modalNewInput.value.trim();
        const confirmPw = modalConfirmInp.value.trim();
 
        if (hasLock && currentPw !== getNotePassword(_modalNoteId)) {
            modalError.textContent = 'Current password is incorrect.';
            return;
        }
        if (newPw === '') {
            modalError.textContent = 'New password cannot be empty.';
            return;
        }
        if (newPw !== confirmPw) {
            modalError.textContent = 'Passwords do not match.';
            return;
        }
 
        setNotePassword(_modalNoteId, newPw);
        closeLockModal();
        updateLockButton();
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note password saved.';
        statusEl.style.color = 'gray';
    });
 
    modalRemoveBtn.addEventListener('click', () => {
        if (!_modalNoteId) return;
        if (modalCurrentInp.value !== getNotePassword(_modalNoteId)) {
            modalError.textContent = 'Current password is incorrect.';
            return;
        }
        setNotePassword(_modalNoteId, '');
        closeLockModal();
        updateLockButton();
        renderNotesList(searchInput.value);
        statusEl.textContent = 'Note lock removed.';
        statusEl.style.color = 'gray';
    });
 
    setLockBtn.addEventListener('click', () => openLockModal());
 
    function updateLockButton() {
        if (!currentNoteId) {
            setLockBtn.textContent = '🔓 Lock Note';
            setLockBtn.classList.remove('locked');
            return;
        }
        const locked = noteIsLocked(currentNoteId);
        setLockBtn.textContent = locked ? '🔒 Locked' : '🔓 Lock Note';
        setLockBtn.classList.toggle('locked', locked);
    }
 
    // ── Helpers ───────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
 
    // ── Sidebar ───────────────────────────────────────────────────────────────
    function renderNotesList(filter) {
        filter = filter || '';
        noteList.innerHTML = '';
 
        const filtered = filter.trim() === ''
            ? notes
            : notes.filter(n =>
                (n.title || '').toLowerCase().includes(filter.toLowerCase()) ||
                (n.content || '').toLowerCase().includes(filter.toLowerCase())
            );
 
        filtered.forEach(note => {
            const item = document.createElement('div');
            item.className = 'note-item' + (note.id === currentNoteId ? ' active' : '');
 
            const isLocked = noteIsLocked(note.id);
            item.innerHTML = `
                <button class="note-item-delete" data-id="${escapeHtml(note.id)}">&times;</button>
                ${isLocked ? '<span class="note-item-lock-badge">🔒</span>' : ''}
                <div class="note-item-title">${escapeHtml(note.title || 'Untitled')}</div>
                <div class="note-item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
            `;
 
            item.addEventListener('click', async (e) => {
                if (e.target.classList.contains('note-item-delete')) return;
                await switchNote(note.id);
            });
 
            item.querySelector('.note-item-delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                await deleteNote(note.id);
            });
 
            noteList.appendChild(item);
        });
    }
 
    // ── Load note into editor (no password check — already verified) ──────────
    function loadNoteIntoEditor(note) {
        currentNoteId        = note.id;
        titleInput.value     = note.title   || '';
        textarea.value       = note.content || '';
        lastSavedContent     = note.content || '';
        statusEl.textContent = '';
        updateWordCount();
        updateLockButton();
        renderNotesList(searchInput.value);
    }
 
    // ── Switch note ───────────────────────────────────────────────────────────
    async function switchNote(id) {
        // Guard: don't re-open the same note
        if (id === currentNoteId) return;

        // If the lock screen is open and user clicks a different note, close it
        if (_pendingUnlockResolve) {
            _finishUnlock(false);
            // Small delay so the dismissed promise settles before we continue
            await new Promise(r => setTimeout(r, 0));
        }

        if (textarea.value !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }

        const note = notes.find(n => n.id === id);
        if (!note) return;

        if (noteIsLocked(id)) {
            const unlocked = await promptUnlock(id);
            if (!unlocked) return;
        }

        loadNoteIntoEditor(note);
    }
 
    // ── Save ──────────────────────────────────────────────────────────────────
    async function saveCurrentNote() {
        if (!currentNoteId) return;
        clearTimeout(debounceTimer);
 
        const note = {
            id:      currentNoteId,
            title:   titleInput.value.trim() || 'Untitled',
            content: textarea.value
        };
 
        await window.electronAPI.saveNoteJson(note);
        lastSavedContent = textarea.value;
 
        const idx = notes.findIndex(n => n.id === currentNoteId);
        if (idx !== -1) {
            notes[idx] = { ...notes[idx], ...note, updatedAt: new Date().toISOString() };
        }
 
        renderNotesList(searchInput.value);
        statusEl.style.color = 'gray';
        statusEl.textContent = `Saved at ${new Date().toLocaleTimeString()}`;
    }
 
    // ── Delete ────────────────────────────────────────────────────────────────
    async function deleteNote(id) {
        const result = await window.electronAPI.newNote();
        if (!result.confirmed) return;
 
        await window.electronAPI.deleteNote(id);
        setNotePassword(id, '');
        notes = notes.filter(n => n.id !== id);
 
        if (currentNoteId === id) {
            currentNoteId        = null;
            titleInput.value     = '';
            textarea.value       = '';
            lastSavedContent     = '';
            statusEl.textContent = 'Note deleted.';
            updateLockButton();
        }
 
        renderNotesList(searchInput.value);
    }
 
    // ── Export ────────────────────────────────────────────────────────────────
    async function exportNote() {
        const title   = titleInput.value.trim() || 'Untitled';
        const divider = '\u2500'.repeat(title.length);
        const result  = await window.electronAPI.saveAs(`${title}\n${divider}\n\n${textarea.value}`);
        if (result.success) statusEl.textContent = 'Exported ✔';
    }
 
    // ── Import ────────────────────────────────────────────────────────────────
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
            statusEl.textContent = 'Import failed ✖';
            statusEl.style.color = '#e05252';
            return;
        }
 
        notes.unshift(imported);
        loadNoteIntoEditor(imported);   // imported notes are never locked
        statusEl.textContent = 'Imported ✔';
    }
 
    // ── Font size ─────────────────────────────────────────────────────────────
    document.getElementById('font-increase').addEventListener('click', async () => {
        applyFontSize(currentFontSize + 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });
    document.getElementById('font-decrease').addEventListener('click', async () => {
        applyFontSize(currentFontSize - 2);
        await window.electronAPI.saveSettings({ fontSize: currentFontSize });
    });
 
    // ── Dark mode ─────────────────────────────────────────────────────────────
    darkModeBtn.addEventListener('click', async () => {
        applyDarkMode(!isDarkMode);
        await window.electronAPI.saveSettings({ darkMode: isDarkMode });
    });
 
    // ── New note ──────────────────────────────────────────────────────────────
    newNoteBtn.addEventListener('click', async () => {
        if (textarea.value !== lastSavedContent) {
            const result = await window.electronAPI.newNote();
            if (!result.confirmed) return;
        }
 
        const newNote = {
            id:        Date.now().toString(),
            title:     'Untitled',
            content:   '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
 
        await window.electronAPI.saveNoteJson(newNote);
        notes.unshift(newNote);
        loadNoteIntoEditor(newNote);
        titleInput.focus();
        statusEl.textContent = 'New note created.';
    });
 
    // ── Save / SaveAs / Open ──────────────────────────────────────────────────
    saveBtn.addEventListener('click', async () => {
        await saveCurrentNote();
        new Notification('Note Saved', { body: `"${titleInput.value || 'Untitled'}" has been saved.` });
    });
    saveAsBtn.addEventListener('click',   exportNote);
    openFileBtn.addEventListener('click', importFile);
 
    // ── Auto-save ─────────────────────────────────────────────────────────────
    textarea.addEventListener('input', () => {
        updateWordCount();
        statusEl.textContent = 'Unsaved changes...';
        statusEl.style.color = 'gray';
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });
 
    titleInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(saveCurrentNote, 5000);
    });
 
    // ── Search ────────────────────────────────────────────────────────────────
    searchInput.addEventListener('input', () => renderNotesList(searchInput.value));
 
    // ── Menu actions ──────────────────────────────────────────────────────────
    window.electronAPI.onMenuAction('menu-new-note',  () => newNoteBtn.click());
    window.electronAPI.onMenuAction('menu-open-file', () => openFileBtn.click());
    window.electronAPI.onMenuAction('menu-save',      () => saveBtn.click());
    window.electronAPI.onMenuAction('menu-save-as',   () => saveAsBtn.click());
 
    // ── Init ──────────────────────────────────────────────────────────────────
    notes = await window.electronAPI.getNotes();
 
    if (notes.length > 0) {
        const mostRecent = notes.reduce((a, b) =>
            new Date(a.updatedAt) > new Date(b.updatedAt) ? a : b
        );
        // Load the most recent note directly — no password prompt on startup
        loadNoteIntoEditor(mostRecent);
    } else {
        newNoteBtn.click();
    }
 
    renderNotesList(searchInput.value);
});