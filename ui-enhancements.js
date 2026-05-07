/* =============================================================================
   UI enhancements — Vitrina Configurator
   
   Non-invasive layer that sits on top of main.js. Does NOT modify any
   calculation or SVG-drawing logic. Handles:
   
   - Theme toggle (dark/light) with localStorage persistence + system preference
   - Mobile nav drawer (hamburger)
   - Section accordion (collapsible form sections)
   - Empty-state visibility (auto-fades when SVG has content)
   - Corner badge sync (plan/unit/supplier/date)
   - Supplier logo preview next to the supplier select
   - Dropzone drag-and-drop visuals + file pick state
   - Mobile-only default collapse for the "details" section
   - Export buttons disabled state while loading overlay is visible
   ============================================================================= */

(function () {
  'use strict';

  const root = document.documentElement;

  /* ---------- 1) Theme toggle --------------------------------------------- */
  const THEME_KEY = 'vitrina-theme';
  const themeBtn  = document.getElementById('themeToggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');

  function applyTheme(next) {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode / quota */ }
    if (metaTheme) {
      metaTheme.setAttribute('content', next === 'light' ? '#ffffff' : '#0d1117');
    }
  }

  function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (_) {}
    if (saved === 'light' || saved === 'dark') {
      applyTheme(saved);
      return;
    }
    // No saved preference — respect system, default dark
    const prefersLight = window.matchMedia &&
                         window.matchMedia('(prefers-color-scheme: light)').matches;
    applyTheme(prefersLight ? 'light' : 'dark');
  }
  initTheme();

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const cur = root.getAttribute('data-theme') || 'dark';
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
  }

  /* ---------- 2) Mobile nav drawer ---------------------------------------- */
  const navToggle = document.getElementById('navToggle');
  const toolTabs  = document.getElementById('toolTabs');

  if (navToggle && toolTabs) {
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = toolTabs.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    // Click outside → close
    document.addEventListener('click', (e) => {
      if (!toolTabs.classList.contains('is-open')) return;
      if (toolTabs.contains(e.target) || navToggle.contains(e.target)) return;
      toolTabs.classList.remove('is-open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ---------- 3) Section accordion ---------------------------------------- */
  document.querySelectorAll('.section-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const section = btn.closest('.section');
      if (!section) return;
      const collapsed = section.getAttribute('data-collapsed') === 'true';
      section.setAttribute('data-collapsed', String(!collapsed));
      btn.setAttribute('aria-expanded', String(collapsed));
    });
  });

  /* ---------- 4) Empty-state visibility ----------------------------------- */
  // Toggle .has-drawing on the canvas stage whenever the SVG gains/loses content.
  // main.js appends/clears SVG children; we just watch for that.
  const canvasStage = document.getElementById('canvasStage');
  const svgEl      = document.getElementById('svg');

  function updateEmptyState() {
    if (!canvasStage || !svgEl) return;
    const hasChildren = Array.from(svgEl.children).some((n) => n.nodeType === 1);
    canvasStage.classList.toggle('has-drawing', hasChildren);
  }
  if (svgEl) {
    updateEmptyState(); // initial
    new MutationObserver(updateEmptyState)
      .observe(svgEl, { childList: true, subtree: false });
  }

  /* ---------- 5) Corner badge sync ---------------------------------------- */
  const badgePlan     = document.getElementById('badgePlan');
  const badgeUnit     = document.getElementById('badgeUnit');
  const badgeSupplier = document.getElementById('badgeSupplier');
  const badgeProfile  = document.getElementById('badgeProfile');
  const badgeColor    = document.getElementById('badgeColor');
  const badgeGlass    = document.getElementById('badgeGlass');
  const badgeDate     = document.getElementById('badgeDate');

  const initialPlanInput     = document.getElementById('planNum');
  const initialUnitInput     = document.getElementById('unitNum');
  const initialSapakSelect   = document.getElementById('Sapak');
  const initialProfileSelect = document.getElementById('profileType');
  const initialColorInput    = document.getElementById('profileColor');
  const initialGlassInput    = document.getElementById('glassModel');

  function supplierLabel(val) {
    if (val === 'bluran') return 'בלורן';
    if (val === 'nilsen') return 'נילסן';
    return val || '—';
  }

  function todayShort() {
    const d  = new Date();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  }

  // Re-resolve elements each call: main.js replaces #unitNum with a custom
  // dropdown after Excel load, so the original reference goes stale.
  function syncBadges() {
    const planInput     = document.getElementById('planNum');
    const unitInput     = document.getElementById('unitNum');
    const sapakSelect   = document.getElementById('Sapak');
    const profileSelect = document.getElementById('profileType');
    const colorInput    = document.getElementById('profileColor');
    const glassInput    = document.getElementById('glassModel');

    const profileText = (profileSelect && profileSelect.options[profileSelect.selectedIndex] &&
                         profileSelect.options[profileSelect.selectedIndex].textContent.trim()) || '';

    if (badgePlan)     badgePlan.textContent     = (planInput && planInput.value.trim()) || '—';
    if (badgeUnit)     badgeUnit.textContent     = (unitInput && unitInput.value.trim()) || '—';
    if (badgeSupplier) badgeSupplier.textContent = supplierLabel(sapakSelect && sapakSelect.value);
    if (badgeProfile)  badgeProfile.textContent  = profileText || '—';
    if (badgeColor)    badgeColor.textContent    = (colorInput && colorInput.value.trim()) || '—';
    if (badgeGlass)    badgeGlass.textContent    = (glassInput && glassInput.value.trim()) || '—';
    if (badgeDate)     badgeDate.textContent     = todayShort();
  }

  [initialPlanInput, initialUnitInput, initialSapakSelect,
   initialProfileSelect, initialColorInput, initialGlassInput].forEach((el) => {
    if (!el) return;
    el.addEventListener('input',  syncBadges);
    el.addEventListener('change', syncBadges);
  });
  syncBadges();

  // main.js sets planNum/unitNum values programmatically (no events fire) and
  // also rebuilds the unitNum input as a custom dropdown. Watch the form panel
  // for any DOM mutation and re-sync — covers element replacement and lets us
  // attach listeners to the new element so subsequent user picks also update.
  const formPanelForBadges = document.querySelector('.form-panel');
  if (formPanelForBadges) {
    new MutationObserver(() => {
      syncBadges();
      const cur = document.getElementById('unitNum');
      if (cur && cur.dataset.badgeBound !== '1') {
        cur.dataset.badgeBound = '1';
        cur.addEventListener('input',  syncBadges);
        cur.addEventListener('change', syncBadges);
      }
    }).observe(formPanelForBadges, { childList: true, subtree: true });
  }

  // Trigger syncs on a few delays after Excel load: the file is read async,
  // the dropdown is then built, and only then is the unit value populated.
  const excelInputForBadges = document.getElementById('excelFile');
  if (excelInputForBadges) {
    excelInputForBadges.addEventListener('change', () => {
      [50, 300, 800, 1500].forEach((d) => setTimeout(syncBadges, d));
    });
  }

  // Click any badge value to copy it to the clipboard. Skip em-dashes.
  function showCopiedTooltip(host) {
    const tip = document.createElement('span');
    tip.className = 'copied-tooltip';
    tip.textContent = 'הועתק';
    host.appendChild(tip);
    requestAnimationFrame(() => tip.classList.add('show'));
    setTimeout(() => {
      tip.classList.remove('show');
      setTimeout(() => tip.remove(), 200);
    }, 900);
  }
  [badgePlan, badgeUnit, badgeSupplier, badgeProfile, badgeColor, badgeGlass].forEach((el) => {
    if (!el) return;
    el.classList.add('badge-copyable');
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const text = (el.textContent || '').trim();
      if (!text || text === '—') return;
      try { await navigator.clipboard.writeText(text); } catch (_) {}
      showCopiedTooltip(el);
    });
  });

  /* ---------- 6) Supplier logo preview ------------------------------------ */
  // profiles.js exposes SUPPLIER_LOGOS somewhere on the global scope.
  // We try a few locations defensively so we don't crash if the shape differs.
  const supplierPreview = document.getElementById('supplierPreview');

  function readSupplierLogos() {
    if (window.ProfileConfig && window.ProfileConfig.SUPPLIER_LOGOS) {
      return window.ProfileConfig.SUPPLIER_LOGOS;
    }
    if (window.SUPPLIER_LOGOS) return window.SUPPLIER_LOGOS;
    return null;
  }

  function updateSupplierPreview() {
    if (!supplierPreview || !sapakSelect) return;
    const logos = readSupplierLogos();
    const val   = sapakSelect.value;
    supplierPreview.innerHTML = '';
    if (logos && logos[val]) {
      const img = document.createElement('img');
      img.src = logos[val];
      img.alt = supplierLabel(val);
      supplierPreview.appendChild(img);
    }
  }
  if (sapakSelect) {
    sapakSelect.addEventListener('change', updateSupplierPreview);
    updateSupplierPreview();
  }

  /* ---------- 7) Dropzone drag-and-drop visuals --------------------------- */
  const dropzone  = document.getElementById('dropzone');
  const excelFile = document.getElementById('excelFile');
  const fileNameEl = document.querySelector('.file-name');

  if (dropzone && excelFile) {
    ['dragover', 'dragenter'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      // Assign the dropped files to the input so main.js picks them up via its change handler
      try {
        excelFile.files = files;
        excelFile.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
        // Some browsers block programmatic FileList assignment; fall back silently
      }
    });

    // Track file-picked state — observe the file-name text updates by main.js
    // and also react directly to the input's change event.
    function refreshDropzoneState() {
      const hasFile = !!(excelFile.files && excelFile.files.length);
      dropzone.classList.toggle('has-file', hasFile);
    }
    excelFile.addEventListener('change', refreshDropzoneState);
    if (fileNameEl) {
      new MutationObserver(() => {
        const txt = (fileNameEl.textContent || '').trim();
        dropzone.classList.toggle('has-file',
          !!(excelFile.files && excelFile.files.length) ||
          (txt && txt !== 'לא נבחר קובץ'));
      }).observe(fileNameEl, { childList: true, characterData: true, subtree: true });
    }
  }

  /* ---------- 8) (removed) Mobile default collapse ------------------------ */
  // Previously collapsed the "details" section on mobile. Removed per user
  // preference: all sections should be expanded and visible by default.
  // Accordion still works manually via the chevron buttons.

  /* ---------- 9) Export buttons busy state -------------------------------- */
  // Disable download/batch buttons while the loading overlay is visible.
  // main.js toggles #overlay via inline style.display, so we watch that attribute.
  const overlay     = document.getElementById('overlay');
  const downloadBtn = document.getElementById('downloadBtn');
  const batchBtn    = document.getElementById('batchSaveBtn');

  if (overlay) {
    const isVisible = () => overlay.style.display && overlay.style.display !== 'none';
    const sync = () => {
      const vis = isVisible();
      [downloadBtn, batchBtn].forEach((b) => { if (b) b.disabled = vis; });
    };
    new MutationObserver(sync)
      .observe(overlay, { attributes: true, attributeFilter: ['style'] });
    sync();
  }

  /* ---------- 10) Number stepper buttons --------------------------------- */
  // Handle + / − clicks on custom stepper buttons. Uses the native stepUp()
  // and stepDown() methods which respect the input's min/max/step attributes.
  // Dispatches a 'change' event so main.js's existing listener re-draws.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.stepper-btn');
    if (!btn) return;
    const stepper = btn.closest('.stepper');
    if (!stepper) return;
    const input = stepper.querySelector('input[type="number"]');
    if (!input) return;
    if (input.disabled || input.readOnly) return;
    const dir = btn.dataset.step;
    try {
      if (dir === 'up')   input.stepUp();
      else if (dir === 'down') input.stepDown();
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) { /* stepUp can throw if min/max violated */ }
  });

  /* ---------- 11) Custom select dropdowns -------------------------------- */
  // Replace the native browser dropdown (which can't be styled) with a fully
  // themed UI layer. The native <select> stays in the DOM and remains the
  // single source of truth — main.js continues to read .value and
  // .selectedOptions[0].text unchanged. We just hide it visually and sync
  // state via 'change' events.

  function enhanceSelect(sel) {
    if (sel.dataset.enhanced === '1') return;
    sel.dataset.enhanced = '1';

    // Wrap the native select in a .custom-select container
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select';
    sel.parentNode.insertBefore(wrapper, sel);
    wrapper.appendChild(sel);
    sel.classList.add('custom-select-native');
    sel.setAttribute('aria-hidden', 'true');
    sel.setAttribute('tabindex', '-1');

    // Trigger button
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'custom-select-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML =
      '<span class="custom-select-value"></span>' +
      '<svg class="custom-select-chevron" viewBox="0 0 24 24" fill="none" ' +
      'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' +
      '<polyline points="6 9 12 15 18 9"/></svg>';

    // Option menu
    const menu = document.createElement('ul');
    menu.className = 'custom-select-menu';
    menu.setAttribute('role', 'listbox');

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    const valueSpan = trigger.querySelector('.custom-select-value');

    // Generate a tiny SVG thumbnail of the profile so the user can see
    // padding/miter style at a glance. Pulls geometry from PROFILE_SETTINGS.
    function profileThumb(name) {
      const PS = window.ProfileConfig && window.ProfileConfig.PROFILE_SETTINGS;
      const p = PS && PS[name];
      if (!p) return '';
      const W = 22, H = 16;
      // Approximate padding in user units (max 6 px / max 4 px) so all
      // profiles render at a consistent scale.
      const padX = Math.min(6, Math.max(2, p.padSides / 8));
      const padY = Math.min(4, Math.max(2, p.padTopBot / 8));
      const ix = padX, iy = padY, iw = W - 2 * padX, ih = H - 2 * padY;
      const miters = p.hasGerong ? `
        <line x1="0" y1="0" x2="${ix}" y2="${iy}" />
        <line x1="${W}" y1="0" x2="${W - ix}" y2="${iy}" />
        <line x1="0" y1="${H}" x2="${ix}" y2="${H - iy}" />
        <line x1="${W}" y1="${H}" x2="${W - ix}" y2="${H - iy}" />` : '';
      return `<svg class="profile-thumb" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" />
        <rect x="${ix}" y="${iy}" width="${iw}" height="${ih}" />
        ${miters}
      </svg>`;
    }
    const isProfileSelect = sel.id === 'profileType';
    const isUnitSelect    = sel.id === 'unitNum';

    // Read which units have already been exported for the current plan.
    // Mirrors main.js's getExportedUnitsForPlan; we duplicate the lookup
    // so this layer doesn't depend on a global from main.js.
    function getExportedSet() {
      const planNum = (document.getElementById('planNum') || {}).value;
      if (!planNum) return new Set();
      try {
        const raw = localStorage.getItem('vitrina-exported-' + planNum);
        return new Set(raw ? JSON.parse(raw) : []);
      } catch (_) { return new Set(); }
    }

    // (Re)build the menu from the current state of the native select
    function render() {
      menu.innerHTML = '';
      const curVal = sel.value;
      const exported = isUnitSelect ? getExportedSet() : null;
      Array.from(sel.options).forEach((opt) => {
        const li = document.createElement('li');
        li.className = 'custom-select-option';
        li.setAttribute('role', 'option');
        li.dataset.value = opt.value;
        if (isProfileSelect) {
          li.innerHTML = profileThumb(opt.textContent.trim()) +
                         `<span class="custom-select-option-label">${opt.textContent}</span>`;
        } else if (isUnitSelect) {
          const v = String(opt.value).trim();
          li.dataset.unitNum = v;
          li.classList.add('unit-option');
          // Match VitrinaHazit/HK structure exactly: native <input type="radio">
          // sits beside a label-styled span. No CSS-generated indicator —
          // the browser draws the radio so it looks identical to the
          // hand-built dropdown in main.js.
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'unitNumDropdown';
          radio.tabIndex = -1;
          radio.checked = (opt.value === curVal);
          const labelText = document.createElement('span');
          labelText.className = 'unit-label';
          labelText.dataset.unitNum = v;
          if (exported.has(v)) labelText.classList.add('is-exported');
          labelText.textContent = `יחידה ${opt.textContent}`;
          li.appendChild(radio);
          li.appendChild(labelText);
        } else {
          li.textContent = opt.textContent;
        }
        if (opt.value === curVal) li.setAttribute('aria-selected', 'true');
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          if (sel.value !== opt.value) {
            sel.value = opt.value;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
          close();
        });
        menu.appendChild(li);
      });
      const selOpt = sel.options[sel.selectedIndex];
      valueSpan.textContent = selOpt ? selOpt.textContent : '—';
    }

    function open() {
      // Close any other open dropdowns
      document.querySelectorAll('.custom-select.is-open').forEach((w) => {
        if (w !== wrapper) w.classList.remove('is-open');
      });
      wrapper.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function close() {
      wrapper.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (sel.disabled) return;
      wrapper.classList.contains('is-open') ? close() : open();
    });

    trigger.addEventListener('keydown', (e) => {
      if (sel.disabled) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!wrapper.classList.contains('is-open')) open();
      } else if (e.key === 'Escape') {
        close();
      }
    });

    // Reflect the underlying select's disabled state on the wrapper so CSS
    // can lock the trigger visually. Watch the attribute so future changes
    // (main.js toggling .disabled after Excel load) propagate immediately.
    function syncDisabled() {
      wrapper.classList.toggle('is-disabled', !!sel.disabled);
      trigger.disabled = !!sel.disabled;
    }
    new MutationObserver(syncDisabled).observe(sel, {
      attributes: true,
      attributeFilter: ['disabled'],
    });
    syncDisabled();

    // Clicking the label should focus the trigger (not the hidden select)
    sel.addEventListener('focus', () => trigger.focus());

    // Re-render when:
    //   a) main.js populates options (childList mutations on the native select)
    //   b) the native select's value changes (programmatic via main.js line 622)
    new MutationObserver(render).observe(sel, { childList: true });
    sel.addEventListener('change', render);

    // Expose render so external callers (e.g. the Excel-load badge sync)
    // can refresh the trigger label after main.js sets the value
    // programmatically — that path doesn't fire 'change'.
    wrapper.__rerender = render;

    render();
  }

  // Enhance all selects inside the form panel
  document.querySelectorAll('.form-panel select').forEach(enhanceSelect);

  // Watch for late-added selects (e.g. DofenVitrinaPinatit's main.js replaces
  // the unitNum text input with a native <select> only after Excel is loaded)
  // and enhance them too.
  const formPanelForLateSelects = document.querySelector('.form-panel');
  if (formPanelForLateSelects) {
    new MutationObserver((muts) => {
      for (const m of muts) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'SELECT' && node.dataset.enhanced !== '1') {
            enhanceSelect(node);
          } else {
            node.querySelectorAll && node.querySelectorAll('select').forEach((sel) => {
              if (sel.dataset.enhanced !== '1') enhanceSelect(sel);
            });
          }
        }
      }
    }).observe(formPanelForLateSelects, { childList: true, subtree: true });
  }

  // Force-refresh every enhanced select's trigger label. Used after Excel
  // load: main.js sets sideSelect/Sapak values via .value = X (no event
  // fires), so the trigger label otherwise stays stale.
  function rerenderAllCustomSelects() {
    document.querySelectorAll('.custom-select').forEach((w) => {
      if (w.__rerender) w.__rerender();
    });
  }
  const excelInputForSelects = document.getElementById('excelFile');
  if (excelInputForSelects) {
    excelInputForSelects.addEventListener('change', () => {
      [50, 300, 800, 1500].forEach((d) => setTimeout(rerenderAllCustomSelects, d));
    });
  }

  // main.js dispatches this on every successful PDF export so we can refresh
  // the unit-select menu and show the ✓ on the just-exported unit.
  window.addEventListener('vitrina:units-exported-changed', rerenderAllCustomSelects);

  // Any change inside the form panel can trigger main.js to set OTHER
  // selects' values programmatically (e.g. picking a unit fires
  // searchUnit() which sets sideSelect.value, which doesn't fire
  // change). Defer a re-render so those cascading programmatic
  // changes are reflected in the trigger labels.
  const formPanelForRerender = document.querySelector('.form-panel');
  if (formPanelForRerender) {
    formPanelForRerender.addEventListener('change', () => {
      setTimeout(rerenderAllCustomSelects, 0);
    });
  }

  // Close open dropdowns on outside click
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.custom-select.is-open').forEach((w) => {
      if (!w.contains(e.target)) w.classList.remove('is-open');
    });
  });

  // Close open dropdowns on scroll/resize so they don't visually detach
  ['scroll', 'resize'].forEach((ev) => {
    window.addEventListener(ev, () => {
      document.querySelectorAll('.custom-select.is-open').forEach((w) => {
        w.classList.remove('is-open');
        const t = w.querySelector('.custom-select-trigger');
        if (t) t.setAttribute('aria-expanded', 'false');
      });
    }, { passive: true });
  });

  /* ---------- 12) viewBox tightening (all viewports) --------------------- */
  // main.js sets viewBox to ~1044 × 449 units, but the actual drawing only
  // occupies ~6% of that width — the rest is reserved padding for dimension
  // annotations. On both phones and desktops this makes the drawing look
  // smaller than necessary.
  //
  // We tighten the viewBox to the actual bbox of rendered content using the
  // same approach pdf.js already uses in expandViewBoxToContent(). This is
  // SAFE for PDF export because pdf.js operates on a separate cloned SVG and
  // runs its own tightening there independently.
  const svgForViewBox = document.getElementById('svg');

  if (svgForViewBox) {
    let rafScheduled = false;

    function tightenViewBox() {
      if (!svgForViewBox.children.length) return;
      try {
        const bbox = svgForViewBox.getBBox();
        if (!bbox.width || !bbox.height) return;
        const pad = 12;
        const vb =
          `${Math.floor(bbox.x - pad)} ${Math.floor(bbox.y - pad)} ` +
          `${Math.ceil(bbox.width + 2 * pad)} ${Math.ceil(bbox.height + 2 * pad)}`;
        // Avoid re-setting if it's already the tightened viewBox (breaks the
        // feedback loop with the MutationObserver below).
        if (svgForViewBox.getAttribute('viewBox') !== vb) {
          svgForViewBox.setAttribute('viewBox', vb);
        }
      } catch (_) { /* getBBox can throw if not rendered yet */ }
    }

    function scheduleTighten() {
      if (rafScheduled) return;
      rafScheduled = true;
      requestAnimationFrame(() => {
        rafScheduled = false;
        tightenViewBox();
      });
    }

    // Re-apply tightening only when main.js re-renders (childList changes).
    // We deliberately do NOT watch the viewBox attribute: text font-size is
    // set in CSS px, so its bbox in user units depends on the current
    // viewBox-to-viewport ratio. Each tighten shrinks the viewBox, which
    // shrinks text bbox in user units, which gives a slightly different
    // (rounded) vb the next iteration — an infinite oscillation that
    // shows up as the drawing trembling continuously. Watching only
    // childList means our own setAttribute('viewBox', …) below cannot
    // re-trigger us.
    new MutationObserver(scheduleTighten).observe(svgForViewBox, {
      childList: true,
    });

    // Re-tighten on resize / orientation change
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(tightenViewBox, 150);
    });

    // Initial pass
    scheduleTighten();
  }

})();
