// renderer.js — atomic open; smart grow; remainder shifts content when tight to right edge
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        // Splash refs
        const splash = document.getElementById('splash');
        const splashLogo = document.getElementById('splashLogo');
        let splashActive = !!splash;

        const container = document.querySelector('.app-container');
        const sidebar = document.getElementById('sidebar');
        const notesList = document.getElementById('notesList');
        const newNoteBtn = document.getElementById('newNoteBtn');
        const editor = document.getElementById('editor');
        const main = document.querySelector('.main-content');
        const minBtn = document.getElementById('minBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minBtn) minBtn.addEventListener('click', () => window.win?.animateMinimize?.());
        if (closeBtn) closeBtn.addEventListener('click', () => window.win?.close());

        if (!container || !sidebar || !notesList || !newNoteBtn || !editor || !main) return;

        const REQUEST_W = 280;   // == --sidebar-w in CSS
        const ANIM_MS = 260;
        const TRIGGER = 18;    // slightly wider edge band
        const CLOSE_M = 40;
        const EASE = 'cubic-bezier(.2,.8,.2,1)';

        // --- Splash logic ---
        function dismissSplash() {
            if (!splash || !splashActive) return;
            splash.classList.add('is-hidden');
            const finalize = () => {
                splash?.removeEventListener('transitionend', finalize);
                splash?.remove();
                splashActive = false;
                // Now that splash is gone, place caret in editor so you can type immediately
                editor?.focus();
            };
            // remove after transition (or immediately if no transition)
            if (getComputedStyle(splash).transitionDuration === '0s') finalize();
            else splash.addEventListener('transitionend', finalize, { once: true });
        }
        // click anywhere on splash (logo is non-interactive so container gets it)
        splash?.addEventListener('click', dismissSplash);
        // also allow any key to dismiss for accessibility
        document.addEventListener('keydown', (e) => {
            if (splashActive) dismissSplash();
        });

        // state
        let state = 'closed';
        let opening = false;
        let closing = false;
        let openBarrierUntil = 0;
        const OPEN_SETTLE_MS = 80;

        // pointer tracking
        let lastMouse = { x: 0, y: 0 };
        let wantCloseAfterOpen = false;

        // how much the window actually grew last time
        let lastGrowUsed = 0;

        const nextFrame = () => new Promise(requestAnimationFrame);
        const setShift = (px) => document.documentElement.style.setProperty('--content-shift', `${px}px`);


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

            // Show immediately for perceived speed
            sidebar.classList.add('is-visible');

            // Predict how much we can actually grow, and set the remainder shift UP FRONT,
            // so the inward slide animates in sync with any window growth.
            const cap = (await window.win?.rightGrowCapacity?.()) | 0;
            const expectedUsed = Math.min(REQUEST_W, Math.max(0, cap));
            const predictedRemainder = Math.max(0, REQUEST_W - expectedUsed);
            setShift(predictedRemainder);

            // Ensure the CSS transition duration matches ANIM_MS
            main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

            // Ask main to grow; it returns how many px it actually managed to grow.
            const used = await window.win?.smoothGrowRight?.(REQUEST_W, ANIM_MS) || 0;
            lastGrowUsed = used;

            // Correct the shift only if prediction was off (rare)
            const remainder = Math.max(0, REQUEST_W - used);
            if (remainder !== predictedRemainder) setShift(remainder);

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

            // If fullscreen, there’s nothing to shrink (we grew inward). Otherwise, shrink what we used.
            const fs = await window.win?.isFullScreen?.();
            if (!fs) {
                await window.win?.smoothShrinkRight?.(lastGrowUsed, ANIM_MS);
            } else {
                // keep transition consistent for the slide-back
                main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;
            }

            lastGrowUsed = 0;
            setShift(0);

            main.style.removeProperty('width');

            state = 'closed';
            closing = false;
        }

        document.addEventListener('mousemove', (e) => {
            if (splashActive) return; // pause edge-UI until splash is gone
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

            if (state === 'open' && !opening && !closing &&
                performance.now() >= openBarrierUntil && x < r.right - CLOSE_M) {
                hideSidebar();
            }
        });

        sidebar.addEventListener('mouseleave', (e) => {
            if (splashActive) return;
            const r = editor.getBoundingClientRect();
            if (state === 'open' && !opening && !closing &&
                performance.now() >= openBarrierUntil && e.clientX > r.right) {
                hideSidebar();
            }
        });

        // --- Fullscreen toggles ---
        // F11 toggles fullscreen
        document.addEventListener('keydown', (e) => {
            if (splashActive) return; // ignore FS toggles until splash dismissed
            if (e.key === 'F11') {
                e.preventDefault();
                window.win?.toggleFullScreen?.();
            }
        });
        // Double-click the drag bar to toggle fullscreen
        document.querySelector('.drag-bar')?.addEventListener('dblclick', () => {
            window.win?.toggleFullScreen?.();
        });

        // ---------- minimal notes model ----------
        const model = { notes: [], activeId: null, nextId: 1 };
        const titleFrom = (t) => (t || '').split(/\r?\n/)[0].trim() || 'Untitled';

        function renderNotes() {
            notesList.innerHTML = '';
            model.notes.forEach(n => {
                const li = document.createElement('li');

                const titleEl = document.createElement('span');
                titleEl.className = 'note-title'; // fade text only
                titleEl.textContent = n.title;
                titleEl.title = n.title;          // tooltip full title
                li.appendChild(titleEl);

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
            if (!splashActive) editor.focus();
            renderNotes();
        }

        function createNote(focus = true) {
            const id = model.nextId++;
            const n = { id, title: 'Untitled', content: '' };
            model.notes.unshift(n);
            model.activeId = id;
            renderNotes();
            editor.textContent = '';
            if (focus && !splashActive) editor.focus();
        }

        editor.addEventListener('input', () => {
            const n = model.notes.find(nn => nn.id === model.activeId);
            if (!n) return;
            n.content = editor.textContent;
            n.title = titleFrom(n.content);
            renderNotes();
        });

        newNoteBtn.addEventListener('click', () => createNote(true));
        // On first load, don't steal focus while splash is up
        createNote(false);
    });
})();
