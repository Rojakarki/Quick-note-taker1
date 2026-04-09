window.addEventListener('DOMContentLoaded', async () => {
    const textarea = document.getElementById('note');
    const saveBtn = document.getElementById('save');
    const saveAsBtn = document.getElementById('save-as');
    const statusEl = document.getElementById('status');

    const savedNote = await window.electronAPI.loadNote() || "";
    textarea.value = savedNote;
    let lastSavedText = textarea.value;
    let debouncerTimer;

    const updateStatus = (msg, autoClear = false) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        if (autoClear) {
            setTimeout(() => {
                if (statusEl.textContent === msg) statusEl.textContent = 'Ready';
            }, 3000);
        }
    };

    const performSave = async (isAuto = false) => {
        const currentText = textarea.value;
        if (currentText === lastSavedText) return;

        try {
            updateStatus(isAuto ? 'Auto-saving...' : 'Saving...');
            await window.electronAPI.saveNote(currentText);
            lastSavedText = currentText;
            
            const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            updateStatus(`Saved ${isAuto ? 'automatically' : ''} at ${now}`, true);
        } catch (err) {
            console.error('Save failed', err);
            updateStatus('Error: Save failed');
        }
    };

    saveBtn.addEventListener('click', () => performSave(false));

    saveAsBtn.addEventListener('click', async () => {
        const currentText = textarea.value;
        const result = await window.electronAPI.saveAs(currentText);
        if (result.success) {
            updateStatus('File exported successfully!', true);
        }
    });

    textarea.addEventListener('input', () => {
        updateStatus('Typing...');
        
        clearTimeout(debouncerTimer);
        debouncerTimer = setTimeout(() => {
            performSave(true);
        }, 2000);
    });
});
