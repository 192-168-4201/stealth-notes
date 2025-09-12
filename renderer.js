// renderer.js — splash gate, inward/right grow, title-overlay reveal, autosave, quick switcher
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        // Inject minimal CSS used by title overlay
        const style = document.createElement('style');
        style.textContent = `
      /* Editor fade conceal/reveal */
      #editor { transition: opacity 220ms cubic-bezier(.2,.8,.2,1); }
      .editor--concealed { opacity: 0; pointer-events: none; }

      /* Title overlay that sits above the editor pane */
      .title-overlay {
        position: absolute; inset: 0; border-radius: 14px;
        display: block; opacity: 1;
        transition: opacity 220ms cubic-bezier(.2,.8,.2,1);
        pointer-events: auto; cursor: text;
      }
      .title-overlay--hidden { opacity: 0; pointer-events: none; }

      .title-overlay__text {
        position: absolute; top: 16px; left: 20px; right: 20px;
        font-size: 18px; font-weight: 600; color: rgba(255,255,255,.92);
        text-shadow: 0 2px 10px rgba(0,0,0,.35);
        user-select: none;
      }
      .title-overlay__hint {
        position: absolute; bottom: 8%; left: 0; right: 0; text-align: center;
        font-size: .9rem; letter-spacing: .04em;
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
            };
            const dur = getComputedStyle(splash).transitionDuration;
            if (!dur || dur === '0s') finalize();
            else splash.addEventListener('transitionend', finalize, { once: true });
        }
        splash?.addEventListener('click', dismissSplash);
        document.addEventListener('keydown', () => { if (splashActive) dismissSplash(); });

        // ===== Title-overlay reveal system =====
        let overlay = null;
        let editorConcealed = false;
        const revealedById = new Set(); // session memory

        function ensureOverlay() {
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.className = 'title-overlay';
            overlay.innerHTML = `
        <div class="title-overlay__text" id="titleOverlayText">New note</div>
        <div class="title-overlay__hint">Click or start typing</div>
      `;
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
        // Starter keys reveal
        document.addEventListener('keydown', (e) => {
            if (splashActive || !editorConcealed) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            const starter = (k.length === 1) || k === 'Enter' || k === 'Backspace' || k === 'Delete' || k === 'Tab';
            if (starter) revealEditor();
        });
        editor.addEventListener('beforeinput', () => { if (editorConcealed) revealEditor(); });

        // ===== Sidebar grow/shrink (with fullscreen inward) =====
        let state = 'closed', opening = false, closing = false;
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
            opening = true; state = 'opening';
            await lockEditorWidthSafely();
            sidebar.classList.add('is-visible');

            const cap = (await window.win?.rightGrowCapacity?.()) | 0;
            const expectedUsed = Math.min(REQUEST_W, Math.max(0, cap));
            const predictedRemainder = Math.max(0, REQUEST_W - expectedUsed);
            setShift(predictedRemainder);
            main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

            const used = await window.win?.smoothGrowRight?.(REQUEST_W, ANIM_MS) || 0;
            lastGrowUsed = used;

            const remainder = Math.max(0, REQUEST_W - used);
            if (remainder !== predictedRemainder) setShift(remainder);

            state = 'open'; opening = false;
            openBarrierUntil = performance.now() + OPEN_SETTLE_MS;

            const shouldAutoClose = wantCloseAfterOpen || pointerShouldCloseNow();
            wantCloseAfterOpen = false;
            if (shouldAutoClose) hideSidebar();
        }
        async function hideSidebar() {
            if (state !== 'open' || opening || closing || performance.now() < openBarrierUntil) return;
            closing = true; state = 'closing';
            sidebar.classList.remove('is-visible');

            const fs = await window.win?.isFullScreen?.();
            if (!fs) await window.win?.smoothShrinkRight?.(lastGrowUsed, ANIM_MS);
            else main.style.transition = `transform ${ANIM_MS}ms ${EASE}`;

            lastGrowUsed = 0;
            setShift(0);
            main.style.removeProperty('width');

            state = 'closed'; closing = false;
        }
        document.addEventListener('mousemove', (e) => {
            if (splashActive) return;
            lastMouse.x = e.clientX; lastMouse.y = e.clientY;

            const r = editor.getBoundingClientRect();
            const x = e.clientX, y = e.clientY;
            const insideY = y >= r.top && y <= r.bottom;
            const nearRight = x <= r.right && x >= r.right - TRIGGER;

            if (state === 'opening' && x < r.right - CLOSE_M) wantCloseAfterOpen = true;
            if (state === 'closed' && insideY && nearRight && !opening && !closing) { showSidebar(); return; }
            if (state === 'open' && !opening && !closing && performance.now() >= openBarrierUntil && x < r.right - CLOSE_M) hideSidebar();
        });
        sidebar.addEventListener('mouseleave', (e) => {
            if (splashActive) return;
            const r = editor.getBoundingClientRect();
            if (state === 'open' && !opening && !closing && performance.now() >= openBarrierUntil && e.clientX > r.right) hideSidebar();
        });

        // Fullscreen toggles
        document.addEventListener('keydown', (e) => {
            if (splashActive) return;
            if (e.key === 'F11') { e.preventDefault(); window.win?.toggleFullScreen?.(); }
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

            setOverlayTitle(n.title);
            editor.textContent = n.content || '';
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

            editor.textContent = '';
            setOverlayTitle(n.title);
            concealEditorForActiveIfNeeded(n);

            if (focus && !splashActive && !editorConcealed) editor.focus();
            scheduleSave();
        }

        editor.addEventListener('input', () => {
            const n = model.notes.find(nn => nn.id === model.activeId);
            if (!n) return;
            if (editorConcealed) revealEditor();
            n.content = editor.textContent;
            n.title = titleFrom(n.content);
            setOverlayTitle(n.title);
            renderNotes();
            scheduleSave();
        });

        newNoteBtn.addEventListener('click', () => createNote(true));

        // --- Quick Switcher (Ctrl/Cmd+K) ---
        const qs = document.getElementById('qs');
        const qsInput = document.getElementById('qsInput');
        const qsList = document.getElementById('qsList');

        let qsOpen = false, qsSel = 0;
        let qsItems = []; // [{type:'create',query}|{type:'note',row}]

        function openQS() {
            if (splashActive || !qs) return;
            qsOpen = true;
            qs.classList.remove('hidden');
            qsInput.value = '';
            qsSel = 0;
            renderQS('');
            qsInput.focus();
        }
        function closeQS() {
            if (!qs) return;
            qsOpen = false;
            qs.classList.add('hidden');
            // Don't steal focus if title overlay is up
            if (!editorConcealed) editor.focus();
        }
        const norm = (s) => (s || '').toLowerCase();
        function score(q, s) { // tiny fuzzy
            q = norm(q); s = norm(s); if (!q) return 0;
            let i = 0, run = 0, pts = 0;
            for (const ch of s) { if (ch === q[i]) { i++; run++; pts += 2; } else if (run) { run = 0; pts--; } }
            return i === q.length ? pts + (s.startsWith(q) ? 5 : 0) : -1;
        }
        function resultsFor(query) {
            const rows = model.notes.map(n => {
                const firstLine = (n.content || '').split(/\r?\n/)[0];
                const best = Math.max(score(query, n.title), score(query, firstLine));
                return { id: n.id, title: n.title, preview: firstLine, s: best };
            }).filter(r => r.s >= 0).sort((a, b) => b.s - a.s).slice(0, 30);
            return rows;
        }
        function renderQS(q) {
            const trimmed = q.trim();
            const rows = resultsFor(q);

            // Always offer "Create" when query has text and no exact-title match
            const hasExact = !!model.notes.find(n => norm(n.title) === norm(trimmed));
            const offerCreate = !!trimmed && !hasExact;

            qsItems = [];
            qsList.innerHTML = '';

            if (offerCreate) {
                qsItems.push({ type: 'create', query: trimmed });
                const li = document.createElement('li');
                if (qsSel === 0) li.classList.add('k');
                li.innerHTML = `<span class="qs__title">Create:</span><span class="qs__preview">${trimmed}</span>`;
                li.addEventListener('click', () => openItem(0));
                qsList.appendChild(li);
            }

            rows.forEach((r, idx) => {
                qsItems.push({ type: 'note', row: r });
                const li = document.createElement('li');
                const itemIndex = (offerCreate ? 1 : 0) + idx;
                if (itemIndex === qsSel) li.classList.add('k');
                li.innerHTML = `<span class="qs__title">${r.title}</span><span class="qs__preview">${r.preview}</span>`;
                li.addEventListener('click', () => openItem(itemIndex));
                qsList.appendChild(li);
            });

            // Keep selection within bounds
            qsSel = Math.min(qsSel, Math.max(0, qsItems.length - 1));
            if (qsItems.length && !qsList.querySelector('li.k')) {
                qsList.querySelectorAll('li')[qsSel]?.classList.add('k');
            }
        }
        function openItem(idx) {
            const item = qsItems[Math.max(0, idx)];
            if (!item) return;
            const q = qsInput.value.trim();

            if (item.type === 'create') {
                closeQS();
                createNote(true);
                editor.textContent = q;
                // Fire a real input so title/notes list update & autosave kicks in
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                return;
            }
            closeQS();
            selectNote(item.row.id);
        }
        qsInput?.addEventListener('input', e => { qsSel = 0; renderQS(e.target.value); });
        qs?.addEventListener('click', e => { if (e.target === qs) closeQS(); });
        document.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); qsOpen ? closeQS() : openQS(); return; }
            if (!qsOpen) return;
            if (e.key === 'Escape') { e.preventDefault(); closeQS(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); qsSel = Math.min(qsSel + 1, Math.max(0, qsItems.length - 1)); renderQS(qsInput.value); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); qsSel = Math.max(qsSel - 1, 0); renderQS(qsInput.value); }
            else if (e.key === 'Enter') { e.preventDefault(); openItem(qsSel); }
        });

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
