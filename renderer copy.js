// renderer.js
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        // Element selections remain the same
        const container = document.querySelector('.app-container');
        const sidebar = document.getElementById('sidebar');
        const notesList = document.getElementById('notesList');
        const newNoteBtn = document.getElementById('newNoteBtn');
        const editor = document.getElementById('editor');
        const rootStyle = document.documentElement.style;

        if (!container || !sidebar || !editor || !notesList || !newNoteBtn) return;

        // --- constants ---
        const REQUEST_W = 280;
        const ANIM_MS = 260;
        const TRIGGER = 14;
        const CLOSE_M = 40;

        // --- REMOVED COMPLEX HELPERS ---
        // The positionSidebarToEditorRight and alignDuringAnimation functions have been removed.

        // --- state ---
        let state = 'closed';

        // --- NEW, SIMPLIFIED FUNCTIONS ---
        async function showSidebar() {
            if (state !== 'closed') return;
            state = 'opening';

            // STEP 1: "Snapshot" the right edge, just as you described.
            const editorRect = editor.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const rightEdgeX = abs(containerRect.right-editorRect.right);

            // STEP 2: Use that value to "pre-position" the sidebar.
            sidebar.style.left = `${rightEdgeX}px`;
            sidebar.style.width = `${REQUEST_W}px`;

            // STEP 3: Slide the main content left and grow the window.
            rootStyle.setProperty('--content-shift', `-${REQUEST_W}px`);
            sidebar.classList.add('is-visible');
            // This function's ONLY job is to tell the window to grow.
            await window.win?.smoothGrowRight?.(REQUEST_W, ANIM_MS);

            state = 'open';
        }

        async function hideSidebar() {
            if (state !== 'open') return;
            state = 'closing';

            // This function's ONLY job is to tell the window to shrink.
            await window.win?.smoothShrinkRight?.(REQUEST_W, ANIM_MS);
            rootStyle.setProperty('--content-shift', '0px');
            sidebar.classList.remove('is-visible')

            state = 'closed';
        }

        // --- Right-edge trigger logic (Unchanged) ---
        document.addEventListener('mousemove', (e) => {
            const r = editor.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const insideY = y >= r.top && y <= r.bottom;
            const nearRight = x <= r.right && x >= r.right - TRIGGER;

            if (state === 'closed' && insideY && nearRight) {
                showSidebar();
            } else if (state === 'open' && x < r.right - CLOSE_M) {
                hideSidebar();
            }
        });

        sidebar.addEventListener('mouseleave', (e) => {
            const r = editor.getBoundingClientRect();
            if (state === 'open' && e.clientX > r.right) {
                hideSidebar();
            }
        });

        // --- Notes model logic (Unchanged) ---
        if (notesList && newNoteBtn) {
            const model = { notes: [], activeId: null, nextId: 1 };
            const titleFrom = (t) => (t || '').split(/\r?\n/)[0].trim() || 'Untitled';

            function renderNotes() {
                notesList.innerHTML = '';
                model.notes.forEach(n => {
                    const li = document.createElement('li');
                    li.textContent = n.title;
                    li.dataset.id = String(n.id);
                    if (n.id === model.activeId) li.classList.add('active');
                    li.addEventListener('click', () => selectNote(n.id));
                    notesList.appendChild(li);
                });
            }
            function selectNote(id) {
                const n = model.notes.find(nn => nn.id === id);
                if (!n) return;
                model.activeId = id;
                editor.textContent = n.content || '';
                editor.focus();
                renderNotes();
            }
            function createNote() {
                const id = model.nextId++;
                const n = { id, title: 'Untitled', content: '' };
                model.notes.unshift(n);
                model.activeId = id;
                renderNotes();
                editor.textContent = '';
                editor.focus();
            }
            editor.addEventListener('input', () => {
                const n = model.notes.find(nn => nn.id === model.activeId);
                if (!n) return;
                n.content = editor.textContent;
                n.title = titleFrom(n.content);
                renderNotes();
            });
            newNoteBtn.addEventListener('click', createNote);
            createNote();
        }
    });
})();