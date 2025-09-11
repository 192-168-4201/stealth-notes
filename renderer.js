// renderer.js — Stealth Notes: open is atomic; auto-close if pointer is already left.
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        const container = document.querySelector('.app-container');
        const sidebar = document.getElementById('sidebar');
        const notesList = document.getElementById('notesList');
        const newNoteBtn = document.getElementById('newNoteBtn');
        const editor = document.getElementById('editor');
        const main = document.querySelector('.main-content');
        const minBtn = document.getElementById('minBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minBtn) minBtn.addEventListener('click', () => window.win?.minimize());
        if (closeBtn) closeBtn.addEventListener('click', () => window.win?.close());

        if (!container || !sidebar || !notesList || !newNoteBtn || !editor || !main) return;

        const REQUEST_W = 280;  // == --sidebar-w in styles.css
        const ANIM_MS = 260;
        const TRIGGER = 14;
        const CLOSE_M = 40;

        let state = 'closed';
        let opening = false;
        let closing = false;

        let openBarrierUntil = 0;
        const OPEN_SETTLE_MS = 80;

        let lastMouse = { x: 0, y: 0 };
        let wantCloseAfterOpen = false;

        const nextFrame = () => new Promise(requestAnimationFrame);

        async function lockEditorWidthSafely() {
            main.style.removeProperty('width');
            await nextFrame();
            const w = editor.offsetWidth;
            main.style.width = `${w}px`;
        }

        function pointerShouldCloseNow() {
            const r = editor.getBoundingClientRect();
            return lastMouse.x < r.right - CLOSE_M;
        }

        async function showSidebar() {
            if (state !== 'closed' || opening || closing) return;

            opening = true;
            state = 'opening';

            await lockEditorWidthSafely();
            await window.win?.smoothGrowRight?.(REQUEST_W, ANIM_MS); // now truly waits for end
            sidebar.classList.add('is-visible');

            state = 'open';
            opening = false;
            openBarrierUntil = performance.now() + OPEN_SETTLE_MS;

            const shouldAutoClose = wantCloseAfterOpen || pointerShouldCloseNow();
            wantCloseAfterOpen = false;
            if (shouldAutoClose) hideSidebar();
        }

        async function hideSidebar() {
            if (state !== 'open' || opening || closing || performance.now() < openBarrierUntil) return;

            closing = true;
            state = 'closing';

            sidebar.classList.remove('is-visible');
            await window.win?.smoothShrinkRight?.(REQUEST_W, ANIM_MS);
            main.style.removeProperty('width');

            state = 'closed';
            closing = false;
        }

        document.addEventListener('mousemove', (e) => {
            lastMouse.x = e.clientX;
            lastMouse.y = e.clientY;

            const r = editor.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const insideY = y >= r.top && y <= r.bottom;
            const nearRight = x <= r.right && x >= r.right - TRIGGER;

            if (state === 'opening' && x < r.right - CLOSE_M) {
                wantCloseAfterOpen = true;
            }

            if (state === 'closed' && insideY && nearRight && !opening && !closing) {
                showSidebar();
                return;
            }

            if (
                state === 'open' &&
                !opening &&
                !closing &&
                performance.now() >= openBarrierUntil &&
                x < r.right - CLOSE_M
            ) {
                hideSidebar();
            }
        });

        sidebar.addEventListener('mouseleave', (e) => {
            const r = editor.getBoundingClientRect();
            if (
                state === 'open' &&
                !opening &&
                !closing &&
                performance.now() >= openBarrierUntil &&
                e.clientX > r.right
            ) {
                hideSidebar();
            }
        });



        // notes (unchanged)
        const model = { notes: [], activeId: null, nextId: 1 };
        const titleFrom = (t) => (t || '').split(/\r?\n/)[0].trim() || 'Untitled';

        function renderNotes() {
            notesList.innerHTML = '';
            model.notes.forEach(n => {
                const li = document.createElement('li');
                const titleEl = document.createElement('span');
                titleEl.className = 'note-title';
                titleEl.textContent = n.title;
                titleEl.title = n.title;           // full title on hover
                li.appendChild(titleEl);
                li.dataset.id = String(n.id);
                li.title = n.title;   // show full title on hover
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
    });
})();
