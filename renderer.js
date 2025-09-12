// renderer.js — splash gate, inward/right grow, title field (independent), overlay reveal, autosave, quick switcher
(() => {
    if (window.__notesInit) return;
    window.__notesInit = true;

    window.addEventListener('DOMContentLoaded', () => {
        // Inject minimal CSS used by title overlay (keep it here to avoid touching styles.css)
        const style = document.createElement('style');
        style.textContent = `
      /* Editor fade conceal/reveal */
      #editor { transition: opacity 220ms cubic-bezier(.2,.8,.2,1); }
      .editor--concealed { opacity: 0; pointer-events: none; }

      /* Content-reveal overlay (covers editor area; title field stays usable once revealed) */
      .title-overlay {
        position: absolute; left: 0; right: 0; bottom: 0; top: 76px; /* will be adjusted dynamically */
        display: block; opacity: 1;
        transition: opacity 220ms cubic-bezier(.2,.8,.2,1);
        pointer-events: auto; cursor: text;
      }
      .title-overlay--hidden { opacity: 0; pointer-events: none; }

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
        const delNoteBtn = document.getElementById('delNoteBtn');
        const titleInput = document.getElementById('titleInput');
        const editor = document.getElementById('editor');
        const main = document.querySelector('.main-content');
        const minBtn = document.getElementById('minBtn');
        const closeBtn = document.getElementById('closeBtn');

        if (minBtn) minBtn.addEventListener('click', () => window.win?.animateMinimize?.());
        if (closeBtn) closeBtn.addEventListener('click', () => window.win?.close?.());
        if (delNoteBtn) delNoteBtn.addEventListener('click', () => deleteActiveNote());

        if (!container || !sidebar || !notesList || !newNoteBtn || !editor || !main || !titleInput) return;

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

        // ===== Model + persistence =====
        // manualTitle: boolean — true after user edits title explicitly; we stop auto-suggesting
        const model = { notes: [], activeId: null, nextId: 1 };

        // Debounced autosave
        let saveT = null;
        function scheduleSave() {
            clearTimeout(saveT);
            saveT = setTimeout(() => {
                const payload = {
                    version: 2,
                    notes: model.notes,
                    activeId: model.activeId,
                    nextId: model.nextId,
                    savedAt: Date.now(),
                };
                window.notesIO?.save?.(payload);
            }, 500);
        }

        const titleFrom = (t) => (t || '').split(/\r?\n/)[0].trim() || 'Untitled';

        // ===== Title-overlay reveal system (editor only) =====
        let overlay = null;
        let editorConcealed = false;   // is editor hidden by overlay?
        const revealedById = new Set();

        function ensureOverlay() {
            if (overlay) return overlay;
            overlay = document.createElement('div');
            overlay.className = 'title-overlay';
            overlay.innerHTML = `<div class="title-overlay__hint">Click or start typing</div>`;
            main.appendChild(overlay);
            overlay.addEventListener('click', revealEditor);
            updateOverlayTop(); // set correct top initially
            return overlay;
        }
        function updateOverlayTop() {
            const dragH = document.querySelector('.drag-bar')?.clientHeight ?? 32;
            const titleH = document.querySelector('.title-row')?.clientHeight ?? 44;
            if (overlay) overlay.style.top = `${dragH + titleH}px`;
        }
        window.addEventListener('resize', updateOverlayTop);

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
            updateOverlayTop();
        }

        function revealEditor() {
            if (!editorConcealed) return;
            overlay.classList.add('title-overlay--hidden');
            editor.classList.remove('editor--concealed');
            editorConcealed = false;
            if (model.activeId != null) revealedById.add(model.activeId);
            editor.focus();
        }

        // Starter keys reveal + bridge first keystroke into the editor
        document.addEventListener('keydown', (e) => {
            if (splashActive || !editorConcealed) return;

            // If user is typing in an input/textarea or another contenteditable, let it through
            const ae = document.activeElement;
            if (
                ae &&
                (
                    ae.tagName === 'INPUT' ||
                    ae.tagName === 'TEXTAREA' ||
                    (ae.isContentEditable && ae !== editor)
                )
            ) {
                return;
            }

            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key;
            const starter = (k.length === 1) || k === 'Enter' || k === 'Backspace' || k === 'Delete' || k === 'Tab';
            if (!starter) return;

            e.preventDefault();            // don't let the key vanish
            revealEditor();                // shows editor + focuses it

            // insert the key after focus has landed
            setTimeout(() => {
                if (k.length === 1) {
                    document.execCommand('insertText', false, k);
                } else if (k === 'Enter') {
                    document.execCommand('insertLineBreak');
                } else if (k === 'Tab') {
                    document.execCommand('insertText', false, '\t');
                } else if (k === 'Backspace') {
                    document.execCommand('delete');
                } else if (k === 'Delete') {
                    document.execCommand('forwardDelete');
                }
                editor.dispatchEvent(new Event('input', { bubbles: true }));
            }, 0);
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

        function deleteNoteById(id, { confirm = true } = {}) {
            const idx = model.notes.findIndex(n => n.id === id);
            if (idx < 0) return;
            const n = model.notes[idx];

            if (confirm && !window.confirm(`Delete “${n.title || 'Untitled'}”?`)) return;

            // Remove from list
            model.notes.splice(idx, 1);

            // If we deleted the active note, pick a neighbor (or create a fresh one)
            if (model.activeId === id) {
                if (model.notes.length === 0) {
                    model.activeId = null;
                    renderNotes();
                    titleInput.value = 'Untitled';
                    editor.textContent = '';
                    createNote('title');
                } else {
                    const nextIdx = Math.min(idx, model.notes.length - 1);
                    const next = model.notes[nextIdx];
                    renderNotes();
                    selectNote(next.id);
                }
            } else {
                renderNotes();
                scheduleSave();
            }
        }

        function deleteActiveNote(opts) {
            if (model.activeId == null) return;
            deleteNoteById(model.activeId, opts);
        }

        // ===== Notes list rendering =====
        function renderNotes() {
            notesList.innerHTML = '';
            model.notes.forEach(n => {
                const li = document.createElement('li');

                const titleEl = document.createElement('span');
                titleEl.className = 'note-title';
                titleEl.textContent = n.title || 'Untitled';
                titleEl.title = titleEl.textContent;
                li.appendChild(titleEl);

                li.dataset.id = String(n.id);
                if (n.id === model.activeId) li.classList.add('active');
                li.addEventListener('click', () => selectNote(n.id));
                li.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    deleteNoteById(n.id);
                });
                notesList.appendChild(li);
            });
        }

        function selectNote(id) {
            const n = model.notes.find(nn => nn.id === id);
            if (!n) return;
            model.activeId = id;

            // Populate title + content
            titleInput.value = n.title || 'Untitled';
            editor.textContent = n.content || '';

            concealEditorForActiveIfNeeded(n);

            // Focus: title for empty (concealed) notes; editor for populated ones
            if (!splashActive) {
                if (editorConcealed) titleInput.focus();
                else editor.focus();
            }

            renderNotes();
            scheduleSave();
        }

        // Create note, focus target: 'title' | 'editor'
        function createNote(focusTarget = 'title') {
            const id = model.nextId++;
            const n = { id, title: 'Untitled', content: '', manualTitle: false };
            model.notes.unshift(n);
            model.activeId = id;
            renderNotes();

            titleInput.value = n.title;
            editor.textContent = '';

            concealEditorForActiveIfNeeded(n);

            if (!splashActive) {
                if (focusTarget === 'editor' && !editorConcealed) editor.focus();
                else titleInput.focus();
            }
            scheduleSave();
        }

        // Title input: user rename => lock manualTitle, update list + save
        titleInput.addEventListener('input', () => {
            const n = model.notes.find(nn => nn.id === model.activeId);
            if (!n) return;
            const v = titleInput.value.trim();
            n.title = v || 'Untitled';
            n.manualTitle = true;
            renderNotes();
            scheduleSave();
        });
        // Enter in title moves focus to editor
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (editorConcealed) revealEditor();
                else editor.focus();
            }
        });

        // Editor: update content; if title not manually set yet, auto-suggest from first line
        editor.addEventListener('input', () => {
            const n = model.notes.find(nn => nn.id === model.activeId);
            if (!n) return;
            if (editorConcealed) revealEditor();

            n.content = editor.textContent;

            if (!n.manualTitle) {
                const suggested = titleFrom(n.content);
                if (suggested && suggested !== 'Untitled') {
                    n.title = suggested;
                    titleInput.value = suggested;
                }
            }
            renderNotes();
            scheduleSave();
        });

        newNoteBtn.addEventListener('click', () => createNote('title'));

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
            // Restore focus smartly
            if (!editorConcealed) editor.focus(); else titleInput.focus();
        }
        const norm = (s) => (s || '').toLowerCase();
        function score(q, s) {
            q = norm(q); s = norm(s); if (!q) return 0;
            let i = 0, run = 0, pts = 0;
            for (const ch of s) { if (ch === q[i]) { i++; run++; pts += 2; } else if (run) { run = 0; pts--; } }
            return i === q.length ? pts + (s.startsWith(q) ? 5 : 0) : -1;
        }
        function resultsFor(query) {
            const rows = model.notes.map(n => {
                const firstLine = (n.content || '').split(/\r?\n/)[0];
                const best = Math.max(score(query, n.title), score(query, firstLine));
                return { id: n.id, title: n.title || 'Untitled', preview: firstLine, s: best };
            }).filter(r => r.s >= 0).sort((a, b) => b.s - a.s).slice(0, 30);
            return rows;
        }
        function renderQS(q) {
            const trimmed = q.trim();
            const rows = resultsFor(q);

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
                // Create a fresh note whose TITLE is the query; leave content empty
                createNote('editor'); // focus editor next
                const n = model.notes.find(nn => nn.id === model.activeId);
                if (n) {
                    n.title = q || 'Untitled';
                    n.manualTitle = true;
                    titleInput.value = n.title;
                    renderNotes();
                    scheduleSave();
                }
                // Keep editor empty so you can start writing content
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
            else if (e.key === 'Delete') {
                e.preventDefault();
                const it = qsItems[qsSel];
                if (it?.type === 'note') {
                    if (window.confirm(`Delete “${it.row.title}”?`)) {
                        deleteNoteById(it.row.id, { confirm: false });
                        renderQS(qsInput.value); // refresh results
                    }
                }
            }
        });

        // Global delete shortcut (Cmd/Ctrl+Backspace/Delete) when not in QS
        document.addEventListener('keydown', (e) => {
            if (splashActive) return;
            // Don't handle if Quick Switcher is open (it has its own Delete behavior)
            if (typeof qsOpen !== 'undefined' && qsOpen) return;

            const mod = e.ctrlKey || e.metaKey;
            const inField = document.activeElement === editor || document.activeElement === titleInput;
            if (mod && inField && (e.key === 'Backspace' || e.key === 'Delete')) {
                e.preventDefault();
                deleteActiveNote();
            }
        });

        // Load persisted notes on boot (migrate missing flags)
        (async () => {
            try {
                const saved = await window.notesIO?.load?.();
                if (saved && Array.isArray(saved.notes) && saved.notes.length) {
                    model.notes = saved.notes.map(n => ({ manualTitle: false, ...n })); // migrate
                    model.activeId = saved.activeId ?? saved.notes[0]?.id ?? null;
                    model.nextId = saved.nextId ?? (saved.notes.reduce((m, n) => Math.max(m, n.id), 0) + 1);
                    renderNotes();
                    if (model.activeId) selectNote(model.activeId); else createNote('title');
                } else {
                    createNote('title');
                }
            } catch (err) {
                console.error('notes: load failed', err);
                createNote('title');
            }
        })();
    });
})();
