// Sidebar + window move in lockstep using the EXACT px the window grew by.
// NaN-safe, container-relative positioning, same-frame start, state-guarded.

(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        const container = document.querySelector('.app-container');
        const sidebar = document.getElementById('sidebar');
        const notesList = document.getElementById('notesList');
        const newNoteBtn = document.getElementById('newNoteBtn');
        const editor = document.getElementById('editor');
        const rootStyle = document.documentElement.style;

        if (!container || !sidebar || !editor) return;

        // --- constants ---
        const REQUEST_W = 280; // desired width; may be clamped by screen edge
        const ANIM_MS = 260;
        const TRIGGER = 14;
        const CLOSE_M = 40;

        // --- helpers ---
        const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

        function positionSidebarToEditorLeft(widthPx) {
            // Prefer explicit width, else inline width, else REQUEST_W; guard NaN.
            let w = (widthPx != null) ? widthPx : parseFloat(sidebar.style.width);
            if (!Number.isFinite(w) || w <= 0) w = REQUEST_W;

            const c = container.getBoundingClientRect();
            const e = editor.getBoundingClientRect();
            const leftRel = Math.round((e.left - c.left) - w);
            sidebar.style.left = leftRel + 'px';
        }

        function alignDuringAnimation(duration = ANIM_MS + 60, wPx) {
            const t0 = performance.now();
            function step(t) {
                positionSidebarToEditorLeft(wPx);
                if (t - t0 < duration) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        window.addEventListener('resize', () => positionSidebarToEditorLeft());
        positionSidebarToEditorLeft();

        // --- state ---
        let state = 'closed';   // 'closed' | 'opening' | 'open' | 'closing'
        let openedPx = 0;       // actual px the window grew last open

        // --- open / close ---
        async function showSidebar() {
            if (state !== 'closed') return;
            state = 'opening';

            // Ask main for the exact px it will grow by (Promise resolves to number)
            const usedPx = await (window.win?.smoothGrowLeft?.(REQUEST_W, ANIM_MS) ?? 0);
            openedPx = usedPx;

            // Keep everything in perfect sync with that exact delta
            sidebar.style.width = `${Math.max(0, usedPx)}px`;
            if (!Number.isFinite(usedPx) || usedPx <= 0) {
                sidebar.style.width = `${REQUEST_W}px`;
            }
            rootStyle.setProperty('--content-shift', `${usedPx}px`);

            // Wait a paint so the editor's translateX applies before we place the sidebar
            await nextFrame();

            positionSidebarToEditorLeft(usedPx);

            // Force layout so the transition animates from hidden (-100%)
            // eslint-disable-next-line no-unused-expressions
            sidebar.getBoundingClientRect();

            // Start sidebar slide and keep alignment glued while window animates
            sidebar.classList.add('is-visible');
            alignDuringAnimation(ANIM_MS + 60, usedPx);

            // Wait for the CSS transition to complete
            await new Promise(res => {
                const done = () => { sidebar.removeEventListener('transitionend', onEnd); res(); };
                const onEnd = (e) => { if (e.propertyName === 'transform') done(); };
                sidebar.addEventListener('transitionend', onEnd);
                setTimeout(done, ANIM_MS + 120);
            });

            positionSidebarToEditorLeft(usedPx);
            state = 'open';
        }

        async function hideSidebar() {
            if (state !== 'open') return;
            state = 'closing';

            const usedPx = openedPx;
            sidebar.classList.remove('is-visible');
            rootStyle.setProperty('--content-shift', '0px');
            alignDuringAnimation(ANIM_MS + 60, usedPx);

            // Shrink the window by the exact same amount
            window.win?.smoothShrinkLeft?.(usedPx, ANIM_MS);

            await new Promise(res => {
                const done = () => { sidebar.removeEventListener('transitionend', onEnd); res(); };
                const onEnd = (e) => { if (e.propertyName === 'transform') done(); };
                sidebar.addEventListener('transitionend', onEnd);
                setTimeout(done, ANIM_MS + 120);
            });

            // Clean up
            sidebar.style.width = '';
            positionSidebarToEditorLeft();
            openedPx = 0;
            state = 'closed';
        }

        // --- edge trigger near the editor's left edge (guarded by state) ---
        document.addEventListener('mousemove', (e) => {
            const r = editor.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const insideY = y >= r.top && y <= r.bottom;
            const nearLeft = x >= r.left && x <= r.left + TRIGGER;

            if (state === 'closed' && insideY && nearLeft) showSidebar();
            else if (state === 'open' && x > r.left + CLOSE_M) hideSidebar();
        });

        sidebar.addEventListener('mouseleave', (e) => {
            const r = editor.getBoundingClientRect();
            if (state === 'open' && e.clientX < r.left) hideSidebar();
        });

        // --- minimal notes model (for list + "New note") ---
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

        // Optional: tiny debug helpers
        window.__notesDebug = { open: showSidebar, close: hideSidebar };
    });
})();
