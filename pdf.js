const PDF_ORIENTATION = 'l';       // landscape
const PDF_SIZE = 'a4';             // Paper size
const PAGE_MARGIN_MM = 1;          // Margin in mm
const EXTRA_SCALE = 1.30;          // Extra scaling factor for better readability

// הגדרות הדפסה
const PRINT_MIN_MARGIN_MM = 10;   // Minimum margin in mm to avoid cutting
const PRINT_SAFE_SHRINK = 0.92;   // Shrink factor to ensure content fits within safe area
const PRINT_ALIGN = 'center';     // Horizontal alignment: 'left', 'center', 'right'

// Note box dimensions
const NOTE_BOX_W = 430;           // Fixed width in pixels-purple of the SVG
const NOTE_BOX_H = 30;            // Fixed height in pixels-purple of the SVG

// Ensures the PDF uses the "Alef" font for Hebrew text.
// Tries the font from the PDF's existing font list.
// If not available, tries a global registration function.
// If still not available, attempts to add the font from a Base64 string.
// Warns if the font could not be set.
function ensureAlefFont(pdf) {
    try {
        const list = pdf.getFontList ? pdf.getFontList() : null;
        const hasAlef = !!(list && (list.Alef || list['Alef']));
        if (hasAlef) { pdf.setFont('Alef', 'normal'); return; }
    } catch (_) { }
    if (typeof window.registerAlefFontOn === 'function') {
        const ok = window.registerAlefFontOn(pdf);
        if (ok) { pdf.setFont('Alef', 'normal'); return; }
    }
    if (typeof alefBase64 === 'string' && alefBase64.length > 100) {
        try {
            pdf.addFileToVFS('Alef-Regular.ttf', alefBase64);
            pdf.addFont('Alef-Regular.ttf', 'Alef', 'normal');
            pdf.setFont('Alef', 'normal');
            return;
        } catch (e) { console.warn('Font registration from base64 failed:', e); }
    }
    console.warn('Alef font not found; Hebrew may not render correctly.');
}

// Temporarily adds an SVG node to the DOM (off-screen and invisible).
// Executes a provided function `work` with the SVG node.
// Ensures the SVG node is removed from the DOM afterwards, even if an error occurs.
function withTempInDOM(svgNode, work) {
    const holder = document.createElement('div');
    holder.style.position = 'fixed';
    holder.style.left = '-10000px';
    holder.style.top = '-10000px';
    holder.style.opacity = '0';
    document.body.appendChild(holder);
    holder.appendChild(svgNode);
    try { return work(svgNode); }
    finally { document.body.removeChild(holder); }
}

// Adjusts the SVG's viewBox to tightly fit its content.
// Adds optional padding around the content (default is 8 units).
// Calculates the bounding box and sets the viewBox accordingly.
function expandViewBoxToContent(svg, padding = 8) {
    const bbox = svg.getBBox();
    const minX = Math.floor(bbox.x - padding);
    const minY = Math.floor(bbox.y - padding);
    const width = Math.ceil(bbox.width + 2 * padding);
    const height = Math.ceil(bbox.height + 2 * padding);
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
}

// Inlines computed CSS styles into SVG elements as attributes.
// Ensures all elements have a font-family, stroke, stroke-width, dash array, and fill as needed.
// Sets non-scaling strokes so line thickness stays constant when scaling.
// Applies special styling rules for dimension lines (class "dim") and note boxes (class "note-box").
// Prevents overwriting existing fills unless necessary.
function inlineComputedStyles(svgRoot) {
    svgRoot.querySelectorAll('*').forEach(el => {
        const cs = window.getComputedStyle(el);

        // טקסטים — פונט
        if (!el.getAttribute('font-family')) el.setAttribute('font-family', 'Alef');

        // קו/מילוי
        const stroke = cs.stroke && cs.stroke !== 'none' ? cs.stroke : null;
        const strokeWidth = cs.strokeWidth && cs.strokeWidth !== '0px' ? parseFloat(cs.strokeWidth) : null;
        const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray : null;
        const fillCss = cs.fill && cs.fill !== 'rgba(0, 0, 0, 1)' ? cs.fill : null;

        if (stroke) el.setAttribute('stroke', stroke);
        if (strokeWidth) el.setAttribute('stroke-width', strokeWidth);
        if (dash) el.setAttribute('stroke-dasharray', dash);

        // עובי קו קבוע למרות סקייל
        el.setAttribute('vector-effect', 'non-scaling-stroke');

        // קווי מידות
        if (el.classList && el.classList.contains('dim')) {
            if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#2c3e50');
            if (!el.getAttribute('stroke-width')) el.setAttribute('stroke-width', '0.6');
        }

        // טיפול במילוי — לא לדרוס fill קיים שכבר הוגדר על האלמנט (למשל לעיגולים כחולים)
        if (['rect', 'path', 'polygon', 'polyline', 'circle', 'ellipse'].includes(el.tagName)) {
            if (el.classList && el.classList.contains('note-box')) {
                if (fillCss) el.setAttribute('fill', fillCss);
                if (!el.getAttribute('stroke')) el.setAttribute('stroke', '#2c3e50');
                if (!el.getAttribute('stroke-dasharray') && dash) el.setAttribute('stroke-dasharray', dash);
            } else {
                if (fillCss) {
                    el.setAttribute('fill', fillCss);
                } else if (!el.hasAttribute('fill')) {
                    el.setAttribute('fill', 'none');
                }
            }
        }
    });
}

// Fixes Hebrew text rendering in an SVG.
// Detects Hebrew characters in <text> elements and reverses their content for correct display.
// Sets text direction and Unicode bidi attributes for proper right-to-left rendering.
// Ensures the font-family is set to "Alef" for Hebrew text.
// Sets the SVG root direction to RTL.
function fixHebrewText(svgRoot) {
    const hebrewRegex = /[\u0590-\u05FF]/;
    svgRoot.querySelectorAll('text').forEach(t => {
        const txt = (t.textContent || '').trim();
        if (!txt) return;
        if (hebrewRegex.test(txt)) {
            const reversed = txt.split('').reverse().join('');
            t.textContent = reversed;
            t.setAttribute('direction', 'ltr');
            t.setAttribute('unicode-bidi', 'bidi-override');
            t.setAttribute('font-family', 'Alef');
        }
    });
    svgRoot.setAttribute('direction', 'rtl');
}

// Centers dimension numbers in an SVG along their lines.
// Detects numeric text (including mm or מ"מ units) and sets horizontal alignment to middle.
// Adjusts font size and repositions text based on rotation or standard horizontal placement.
// Applies a vertical or horizontal offset to ensure the numbers are visually centered relative to the lines.
function centerDimensionNumbers(svgRoot) {
    const numRegex = /^[\d\s\.\-+×xX*]+(?:mm|מ"מ|)$/;

    // גודל האופסט מהקו (יכול להיות חיובי או שלילי)
    const offset = 20; // ניתן לשנות את הערך לפי הצורך

    svgRoot.querySelectorAll('text').forEach(t => {
        const raw = t.textContent || '';
        const txt = raw.replace(/\s+/g, '');
        if (!txt) return;

        if (numRegex.test(txt)) {
            // מרכז אופקי
            t.setAttribute('text-anchor', 'middle');

            // ** לשינוי גודל הפונט**
            t.setAttribute('font-size', '12');

            // אם הטקסט מסתובב, לחשב מחדש את ה-x וה-y עם אופסט קטן
            const transform = t.getAttribute('transform');
            if (transform && transform.includes('rotate')) {
                const match = /rotate\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/.exec(transform);
                if (match) {
                    const xRot = parseFloat(match[2]);
                    const yRot = parseFloat(match[3]);
                    // הזזת הטקסט מהקו
                    const angle = parseFloat(match[1]);
                    if (Math.abs(angle) === 90) {
                        // טקסט אנכי: הזזה אופקית
                        t.setAttribute('x', xRot);
                        t.setAttribute('y', yRot + 5);
                    } else {
                        // טקסט אופקי: הזזה אנכית
                        t.setAttribute('x', xRot);
                        t.setAttribute('y', yRot);
                    }
                }
            } else {
                // טקסט אופקי רגיל: הזזה אנכית מהקו
                const y = parseFloat(t.getAttribute('y') || '0');
                t.setAttribute('y', y - offset - 5);
            }
        }
    });
}

// Replaces SVG line markers (arrows) with triangle polygons.
// Processes <line> elements with marker-start or marker-end attributes.
// Calculates triangle positions and angles based on line endpoints and stroke width.
// Inserts triangles into the SVG and removes the original marker attributes.
// Non-line elements with markers have their markers removed without replacement.
function replaceMarkersWithTriangles(svgRoot) {
    const lines = svgRoot.querySelectorAll('line, path, polyline');
    lines.forEach(el => {
        const hasMarker = el.getAttribute('marker-start') || el.getAttribute('marker-end');
        if (!hasMarker) return;

        // נתמוך בעיקר ב-line
        if (el.tagName !== 'line') {
            el.removeAttribute('marker-start');
            el.removeAttribute('marker-end');
            return;
        }

        const x1 = parseFloat(el.getAttribute('x1') || '0');
        const y1 = parseFloat(el.getAttribute('y1') || '0');
        const x2 = parseFloat(el.getAttribute('x2') || '0');
        const y2 = parseFloat(el.getAttribute('y2') || '0');
        const stroke = el.getAttribute('stroke') || '#000';
        const sw = parseFloat(el.getAttribute('stroke-width') || '1');

        const addTri = (x, y, angleRad) => {
            const size = Math.max(2.5 * sw, 3);
            const a = angleRad, s = size;
            const p1 = `${x},${y}`;
            const p2 = `${x - s * Math.cos(a - Math.PI / 8)},${y - s * Math.sin(a - Math.PI / 8)}`;
            const p3 = `${x - s * Math.cos(a + Math.PI / 8)},${y - s * Math.sin(a + Math.PI / 8)}`;
            const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            tri.setAttribute('points', `${p1} ${p2} ${p3}`);
            tri.setAttribute('fill', stroke);
            tri.setAttribute('stroke', 'none');
            el.parentNode.insertBefore(tri, el.nextSibling);
        };

        const ang = Math.atan2(y2 - y1, x2 - x1);
        if (el.getAttribute('marker-start')) addTri(x1, y1, ang + Math.PI);
        if (el.getAttribute('marker-end')) addTri(x2, y2, ang);

        el.removeAttribute('marker-start');
        el.removeAttribute('marker-end');
    });
}

// Calculates dimensions and placement for fitting a box (e.g., SVG) into a PDF page.
// Maintains aspect ratio, applies margins, optional extra scaling, and print shrink factor.
// Adjusts width and height to ensure the box fits within the page bounds.
// Returns x, y coordinates and width/height for placement, with optional horizontal alignment.
function fitAndPlaceBox(pdfWidth, pdfHeight, vbWidth, vbHeight, margin = 10, extraScale = 1.0, printShrink = 1.0, align = 'center') {
    const availW = pdfWidth - 2 * margin;
    const availH = pdfHeight - 2 * margin;
    const vbRatio = vbWidth / vbHeight;
    const pageRatio = availW / availH;

    let drawW, drawH;
    if (vbRatio > pageRatio) { drawW = availW; drawH = drawW / vbRatio; }
    else { drawH = availH; drawW = drawH * vbRatio; }

    drawW *= extraScale; drawH *= extraScale;
    drawW *= printShrink; drawH *= printShrink;

    // ביטחון נוסף
    if (drawW > pdfWidth - 2 * margin) { const s = (pdfWidth - 2 * margin) / drawW; drawW *= s; drawH *= s; }
    if (drawH > pdfHeight - 2 * margin) { const s = (pdfHeight - 2 * margin) / drawH; drawW *= s; drawH *= s; }

    // מיקום X לפי יישור
    let x;
    if (align === 'left') x = margin;
    else x = (pdfWidth - drawW) / 2; // מרכז

    const y = (pdfHeight - drawH) / 2; // נשאר ממורכז אנכית
    return { x, y, width: drawW, height: drawH };
}

// Forces all note boxes in the SVG to a fixed size.
// Centers the text within each box and sets font size and color for readability.
// Applies visual improvements: rounded corners, non-scaling stroke, crisp edges, fill opacity.
// Ensures default stroke and fill colors if not set, and preserves dashed stroke patterns.
// Adds a drop-shadow filter to all note boxes for better visibility.
function forceNoteBoxesSize(svgRoot, w = NOTE_BOX_W, h = NOTE_BOX_H) {
    const groups = svgRoot.querySelectorAll('g');
    groups.forEach(g => {
        const rect = g.querySelector('rect.note-box');
        const text = g.querySelector('text.note-text');
        if (!rect || !text) return;

        // --- טקסט ממורכז וקריא ---
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', '17');
        if (!text.getAttribute('fill')) text.setAttribute('fill', '#111');

        // מבטיח שהטקסט נכנס יפה במסגרת
        const tb = text.getBBox();
        const cx = tb.x + tb.width / 2;
        const cy = tb.y + tb.height / 2;

        // קופסה קבועה סביב הטקסט
        const x = cx - w / 2 - 9;
        const y = cy - h / 2 - 5;

        rect.setAttribute('x', String(x));
        rect.setAttribute('y', String(y));
        rect.setAttribute('width', String(w));
        rect.setAttribute('height', String(h));

        // --- שיפורי נראות ---
        rect.setAttribute('rx', '6'); // פינות עגולות
        rect.setAttribute('ry', '6');
        rect.setAttribute('vector-effect', 'non-scaling-stroke');
        rect.setAttribute('shape-rendering', 'crispEdges');
        rect.setAttribute('fill-opacity', '0.9');

        // צבעים ברירת מחדל (אם לא קיימים)
        if (!rect.getAttribute('stroke')) rect.setAttribute('stroke', '#2c3e50');
        if (!rect.getAttribute('fill')) rect.setAttribute('fill', '#fff8b0');

        // דש-דש נשמר להדפסה
        const rc = getComputedStyle(rect);
        const dash = rc.strokeDasharray && rc.strokeDasharray !== 'none' ? rc.strokeDasharray : null;
        if (dash && !rect.getAttribute('stroke-dasharray')) {
            rect.setAttribute('stroke-dasharray', dash);
        }
    });

    // --- פילטר shadow (אם עדיין לא מוגדר) ---
    if (!svgRoot.querySelector('#noteBoxShadow')) {
        const defs = svgRoot.querySelector('defs') || svgRoot.insertBefore(document.createElementNS('http://www.w3.org/2000/svg', 'defs'), svgRoot.firstChild);
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'noteBoxShadow');
        filter.setAttribute('x', '-10%');
        filter.setAttribute('y', '-10%');
        filter.setAttribute('width', '120%');
        filter.setAttribute('height', '120%');
        const fe = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
        fe.setAttribute('dx', '1');
        fe.setAttribute('dy', '1');
        fe.setAttribute('stdDeviation', '1');
        fe.setAttribute('flood-color', '#888');
        fe.setAttribute('flood-opacity', '0.5');
        filter.appendChild(fe);
        defs.appendChild(filter);
    }

    // להוסיף את הצל לכל note-box
    svgRoot.querySelectorAll('rect.note-box').forEach(r => {
        r.setAttribute('filter', 'url(#noteBoxShadow)');
    });
}