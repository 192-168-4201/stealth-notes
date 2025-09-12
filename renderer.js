// renderer.js — splash gate, inward/right grow, title-overlay reveal, autosave
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        // Inject minimal CSS for overlay/reveal without touching styles.css
        const style = document.createElement('style');
        style.textContent = `
      /* Editor fade conceal/reveal */
      #editor { transition: opacity 220ms cubic-bezier(.2,.8,.2,1); }
      .editor--concealed { opacity: 0; pointer-events: none; }

      /* Title overlay that sits above the editor pane */
      .title-overlay {
        position: absolute; inset: 0; border-radius: 14px;
        display: block;
        opacity: 1; transition: opacity 220ms cubic-bezier(.2,.8,.2,1);
        pointer-events: auto; cursor: text;
      }
      .title-overlay--hidden { opacity: 0; pointer-events: none; }

      /* Title text top-left */
      .title-overlay__text {
        position: absolute; top: 16px; left: 20px; right: 20px;
        font-size: 18px; font-weight: 600; color: rgba(255,255,255,.92);
        text-shadow: 0 2px 10px rgba(0,0,0,.35);
        user-select: none;
      }
      /* Optional hint center-bottom */
      .title-overlay__hint {
        position: absolute; bottom: 8%; left: 0; right: 0;
        text-align: center; font-size: .9rem; letter-spacing: .04em;
        color: rgba(255,255,255,.85); text-shadow: 0 2px 10px rgba(0,0,0,.45);
        user-select: none;
      }
    `;
        document.head.appendChild(style);

        // Splash
        const splash = document.getElementById('splash');
        let splashActive = !!splash;
        if (splashActive) document.documentElement.classList.add('app--splashing');

        // DOM
        const container = document.querySelector('.app-container');
        const sidebar = document.getElementById('sidebar');
        const notesList = document.getElementById('notesList');
        const newNoteBtn = document.getElementById('newNoteBtn');
        const editor = document.getElementById('editor');
        const main = document.querySelector('.main-content');
        const minBtn = document.getElementById('minBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minBtn) minBtn.addEventListener('click', () => window.win?.animateMinimize?.());
        if (closeBtn) closeBtn.addEventListener('click', () => window.win?.close?.());

        if (!container || !sidebar || !notesList || !newNoteBtn || !editor || !main) return;

        // Tunables
        const REQUEST_W = 280;               // == --sidebar-w in CSS
        const ANIM_MS = 260;
        const TRIGGER = 18;
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
                document.documentElement.classList.remove('app--splashing');
                // Do NOT force-focus editor here; we'll reveal/focus on click/type.
            };
            const dur = getComputedStyle(splash).transitionDuration;
            if (!dur || dur === '0s') finalize();
            else splash.addEventListener('transitionend', finalize, { once: true });
        }
        splash?.addEventListener('click', dismissSplash);
        document.addEventListener('keydown', () => { if (splashActive) dismissSplash(); });

        // ===== Title-overlay reveal system =====
        let overlay = null;
        let editorConcealed = false;                  // is editor currently hidden by overlay?
        const revealedById = new Set();               // ephemeral per-note reveal memory (not persisted)

        function ensureOverlay() {
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.className = 'title-overlay';
            overlay.innerHTML = `
        <div class="title-overlay__text" id="titleOverlayText">New note</div>
        <div class="title-overlay__hint">Click or start typing</div>
      `;
            // Keep overlay inside the main-content so it only covers the editor pane
            main.appendChild(overlay);
            overlay.addEventListener('click', revealEditor);
            return overlay;
        }

        function setOverlayTitle(text) {
            ensureOverlay();
            const el = overlay.querySelector('#titleOverlayText');
            el.textContent = text || 'New note';
        }

        function concealEditorForActiveIfNeeded(activeNote) {
            ensureOverlay();
            const shouldConceal =
                !splashActive &&
                activeNote &&
                (!activeNote.content || activeNote.content.length === 0) &&
                !revealedById.has(activeNote.id);

            if (shouldConceal) {
                overlay.classList.remove('title-overlay--hidden');
                editor.classList.add('editor--concealed');
                editorConcealed = true;
            } else {
                overlay.classList.add('title-overlay--hidden');
                editor.classList.remove('editor--concealed');
                editorConcealed = false;
            }
        }

        function revealEditor() {
            if (!editorConcealed) return;
            overlay.classList.add('title-overlay--hidden');
            editor.classList.remove('editor--concealed');
            editorConcealed = false;
            if (model.activeId != null) revealedById.add(model.activeId);
            editor.focus();
        }

        // Any “starter” key should reveal
        document.addEventListener('keydown', (e) => {
            if (splashActive || !editorConcealed) return;
            // Skip pure modifier presses
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            // Keys that should reveal: characters, Enter, Backspace/Delete, Tab
            const k = e.key;
            const starter = (k.length === 1) || k === 'Enter' || k === 'Backspace' || k === 'Delete' || k === 'Tab';
            if (starter) {
                // Let the fade run, then send the key into the editor
                revealEditor();
            }
        });

        // If somehow input fires while concealed, reveal immediately
        editor.addEventListener('beforeinput', () => { if (editorConcealed) revealEditor(); });

        // ===== Sidebar grow/shrink (with fullscreen inward) =====
        let state = 'closed';
        let opening = false;
        let closing = false;
        let openBarrierUntil = 0;
        const OPEN_SETTLE_MS = 80;

        let lastMouse = { x: 0, y: 0 };
        let wantCloseAfterOpen = false;
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

            sidebar.classList.add('is-visible');

            // Predict right-edge capacity and pre-apply remainder shift
            const cap = (await window.win?.rightGrowCapacity?.()) | 0;
            const expectedUsed = Math.min(REQUEST_W, Math.max(0, cap));
            const predictedRemainder = Math.max(0, REQUEST_W - expectedUsed);
            setShift(predictedRemainder);
            main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

            // Ask main to grow; record actual
            const used = await window.win?.smoothGrowRight?.(REQUEST_W, ANIM_MS) || 0;
            lastGrowUsed = used;

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

            const fs = await window.win?.isFullScreen?.();
            if (!fs) {
                await window.win?.smoothShrinkRight?.(lastGrowUsed, ANIM_MS);
            } else {
                main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;
            }

            lastGrowUsed = 0;
            setShift(0);
            main.style.removeProperty('width');

            state = 'closed';
            closing = false;
        }

        // Edge hover open/close
        document.addEventListener('mousemove', (e) => {
            if (splashActive) return;
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
                showSidebar(); return;
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

        // Fullscreen toggles
        document.addEventListener('keydown', (e) => {
            if (splashActive) return;
            if (e.key === 'F11') {
                e.preventDefault();
                window.win?.toggleFullScreen?.();
            }
        });
        document.querySelector('.drag-bar')?.addEventListener('dblclick', () => {
            if (!splashActive) window.win?.toggleFullScreen?.();
        });

        // ---------- minimal notes model + persistence ----------
        const model = { notes: [], activeId: null, nextId: 1 };

        // Debounced autosave
        let saveT = null;
        function scheduleSave() {
            clearTimeout(saveT);
            saveT = setTimeout(() => {
                const payload = {
                    version: 1,
                    notes: model.notes,
                    activeId: model.activeId,
                    nextId: model.nextId,
                    savedAt: Date.now(),
                };
                window.notesIO?.save?.(payload);
            }, 500);
        }

        const titleFrom = (t) => (t || '').split(/\r?\n/)[0].trim() || 'Untitled';

        function renderNotes() {
            notesList.innerHTML = '';
            model.notes.forEach(n => {
                const li = document.createElement('li');

                const titleEl = document.createElement('span');
                titleEl.className = 'note-title';
                titleEl.textContent = n.title;
                titleEl.title = n.title;
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

            // Update overlay title BEFORE content swap
            setOverlayTitle(n.title);

            editor.textContent = n.content || '';
            // Decide conceal/reveal for this note
            concealEditorForActiveIfNeeded(n);

            if (!splashActive && !editorConcealed) editor.focus();
            renderNotes();
            scheduleSave();
        }

        function createNote(focus = true) {
            const id = model.nextId++;
            const n = { id, title: 'Untitled', content: '' };
            model.notes.unshift(n);
            model.activeId = id;
            renderNotes();

            // Editor starts empty
            editor.textContent = '';
            setOverlayTitle(n.title);
            concealEditorForActiveIfNeeded(n);

            if (focus && !splashActive && !editorConcealed) editor.focus();
            scheduleSave();
        }

        editor.addEventListener('input', () => {
            const n = model.notes.find(nn => nn.id === model.activeId);
            if (!n) return;
            // If user typed while concealed (race), reveal now
            if (editorConcealed) revealEditor();

            n.content = editor.textContent;
            n.title = titleFrom(n.content);
            setOverlayTitle(n.title);
            renderNotes();
            scheduleSave();
        });

        newNoteBtn.addEventListener('click', () => createNote(true));

        // Load persisted notes on boot
        (async () => {
            try {
                const saved = await window.notesIO?.load?.();
                if (saved && Array.isArray(saved.notes) && saved.notes.length) {
                    model.notes = saved.notes;
                    model.activeId = saved.activeId ?? saved.notes[0]?.id ?? null;
                    model.nextId = saved.nextId ?? (saved.notes.reduce((m, n) => Math.max(m, n.id), 0) + 1);
                    renderNotes();
                    if (model.activeId) selectNote(model.activeId); else createNote(false);
                } else {
                    createNote(false);
                }
            } catch (err) {
                console.error('notes: load failed', err);
                createNote(false);
            }
        })();
    });
})();
