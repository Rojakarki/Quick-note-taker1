window.addEventListener('DOMContentLoaded', async () => {
    // ── Element refs ──────────────────────────────────────────────────────────
    // #note is now a contenteditable div, not a textarea.
    // We access its rich content via .innerHTML and plain text via .innerText.
    const noteEl      = document.getElementById('note');
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
        noteEl.style.fontSize = `${currentFontSize}px`;
    }

    // ── Load settings ─────────────────────────────────────────────────────────
    const settings = await window.electronAPI.getSettings();
    applyFontSize(settings.fontSize || 16);
    applyDarkMode(settings.darkMode || false);

    // ── Word / character count ────────────────────────────────────────────────
    // Use innerText so formatting tags don't inflate the count.
    function updateWordCount() {
        const text = noteEl.innerText || '';
        const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
        document.getElementById('word-count').textContent =
            `Words: ${words} | Characters: ${text.length}`;
    }

    // ── State ─────────────────────────────────────────────────────────────────
    let notes            = [];
    let currentNoteId    = null;
    let lastSavedContent = '';   // stores innerHTML
    let debounceTimer    = null;

    // ── Per-note password storage ─────────────────────────────────────────────
    function pwKey(id) { return 'note_pw_' + id; }
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
    function noteIsLocked(id) { return getNotePassword(id) !== ''; }

    // ── Lock-screen overlay ───────────────────────────────────────────────────
    const lockScreen = document.getElementById('lock-screen');
    const lockInput  = document.getElementById('lock-input');
    const lockSubmit = document.getElementById('lock-submit');
    const lockError  = document.getElementById('lock-error');

    let _pendingUnlockId      = null;
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

    let _modalNoteId = null;

    function openLockModal() {
        if (!currentNoteId) return;
        _modalNoteId = currentNoteId;

        const hasLock = noteIsLocked(_modalNoteId);
        modalTitle.textContent  = hasLock ? 'Change / Remove Password' : 'Set Note Password';
        modalNewInput.value     = '';
        modalConfirmInp.value   = '';
        modalCurrentInp.value   = '';
        modalError.textContent  = '';
        modalCurrentInp.style.display = hasLock ? 'block' : 'none';
        modalRemoveBtn.style.display  = hasLock ? 'inline-block' : 'none';

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

    // ── Rich Text Editor ──────────────────────────────────────────────────────
    // execCommand is deprecated but universally supported in Electron's
    // Chromium environment and still the correct approach for contenteditable.

    function execFormat(command, value) {
        noteEl.focus();
        document.execCommand(command, false, value || null);
        updateFormatButtons();
    }

    // Update active state of formatting buttons to reflect current cursor state
    function updateFormatButtons() {
        document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
            const cmd = btn.dataset.cmd;
            try {
                const active = document.queryCommandState(cmd);
                btn.classList.toggle('active', active);
            } catch (e) {
                // queryCommandState not supported for all commands — ignore
            }
        });
    }

    // Format toolbar button clicks
    document.querySelectorAll('.fmt-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('mousedown', e => {
            // Prevent the editor from losing focus before execCommand runs
            e.preventDefault();
            execFormat(btn.dataset.cmd);
        });
    });

    // Clear formatting button
    document.getElementById('clear-format-btn').addEventListener('mousedown', e => {
        e.preventDefault();
        noteEl.focus();
        document.execCommand('removeFormat', false, null);
        // Also remove list formatting
        if (document.queryCommandState('insertUnorderedList')) {
            document.execCommand('insertUnorderedList', false, null);
        }
        if (document.queryCommandState('insertOrderedList')) {
            document.execCommand('insertOrderedList', false, null);
        }
        updateFormatButtons();
    });

    // Keyboard shortcuts inside the rich-text editor
    noteEl.addEventListener('keydown', e => {
        const ctrl = e.ctrlKey || e.metaKey;
        if (!ctrl) return;
        switch (e.key.toLowerCase()) {
            case 'b':
                e.preventDefault();
                execFormat('bold');
                break;
            case 'i':
                e.preventDefault();
                execFormat('italic');
                break;
            case 'u':
                e.preventDefault();
                execFormat('underline');
                break;
        }
    });

    // Update toolbar state when the cursor moves or selection changes
    noteEl.addEventListener('keyup',    updateFormatButtons);
    noteEl.addEventListener('mouseup',  updateFormatButtons);
    noteEl.addEventListener('focus',    updateFormatButtons);
    document.addEventListener('selectionchange', () => {
        // Only update when focus is inside our editor
        if (document.activeElement === noteEl) updateFormatButtons();
    });

    // ── Sidebar ───────────────────────────────────────────────────────────────
    function renderNotesList(filter) {
        filter = filter || '';
        noteList.innerHTML = '';

        const filtered = filter.trim() === ''
            ? notes
            : notes.filter(n =>
                (n.title   || '').toLowerCase().includes(filter.toLowerCase()) ||
                // Search plain text so HTML tags don't interfere
                (n.content || '').replace(/<[^>]+>/g, ' ').toLowerCase().includes(filter.toLowerCase())
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

    // ── Get current editor HTML content ──────────────────────────────────────
    function getEditorContent() {
        return noteEl.innerHTML;
    }

    // ── Set editor HTML content ───────────────────────────────────────────────
    function setEditorContent(html) {
        // If the stored content looks like plain text (no HTML tags), wrap it
        // so legacy plain-text notes display correctly.
        if (html && !/<[a-z][\s\S]*>/i.test(html)) {
            // Plain text: preserve newlines as <br>
            noteEl.innerHTML = html
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\n/g, '<br>');
        } else {
            noteEl.innerHTML = html || '';
        }
    }

    // ── Load note into editor (no password check — already verified) ──────────
    function loadNoteIntoEditor(note) {
        currentNoteId    = note.id;
        titleInput.value = note.title || '';
        setEditorContent(note.content || '');
        lastSavedContent = getEditorContent();
        statusEl.textContent = '';
        updateWordCount();
        updateLockButton();
        updateFormatButtons();
        renderNotesList(searchInput.value);
    }

    // ── Switch note ───────────────────────────────────────────────────────────
    async function switchNote(id) {
        if (id === currentNoteId) return;

        if (_pendingUnlockResolve) {
            _finishUnlock(false);
            await new Promise(r => setTimeout(r, 0));
        }

        if (getEditorContent() !== lastSavedContent) {
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
            content: getEditorContent()   // saves full HTML with formatting
        };

        await window.electronAPI.saveNoteJson(note);
        lastSavedContent = note.content;

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
            noteEl.innerHTML     = '';
            lastSavedContent     = '';
            statusEl.textContent = 'Note deleted.';
            updateLockButton();
        }

        renderNotesList(searchInput.value);
    }

    // ── Export (Save-as .txt) ─────────────────────────────────────────────────
    // Strip HTML tags for plain text export
    async function exportNote() {
        const title   = titleInput.value.trim() || 'Untitled';
        const divider = '\u2500'.repeat(title.length);
        // Convert HTML to plain text for .txt export
        const tmp     = document.createElement('div');
        tmp.innerHTML = getEditorContent();
        // Replace <br> and block elements with newlines before stripping tags
        tmp.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        tmp.querySelectorAll('p, div, li').forEach(el => {
            el.insertAdjacentText('afterend', '\n');
        });
        const plainText = tmp.innerText || tmp.textContent || '';
        const result = await window.electronAPI.saveAs(`${title}\n${divider}\n\n${plainText}`);
        if (result.success) statusEl.textContent = 'Exported ✔';
    }

    // ── Import ────────────────────────────────────────────────────────────────
    async function importFile() {
        const result = await window.electronAPI.openFile();
        if (!result.success) return;

        const now = new Date().toISOString();
        // Imported plain text: convert newlines to <br> for the rich editor
        const htmlContent = result.content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');

        const imported = {
            id:        Date.now().toString(),
            title:     result.filePath.split(/[\\/]/).pop().replace(/\.txt$/i, ''),
            content:   htmlContent,
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
        loadNoteIntoEditor(imported);
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
        if (getEditorContent() !== lastSavedContent) {
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

    // ── Auto-save on editor input ─────────────────────────────────────────────
    noteEl.addEventListener('input', () => {
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
        loadNoteIntoEditor(mostRecent);
    } else {
        newNoteBtn.click();
    }

    renderNotesList(searchInput.value);
});