window.jsPDF = window.jspdf.jsPDF;
function mm(v) { return Number.isFinite(v) ? v : 0; }

// ==== פרמטרים להתאמה מהירה ====
const PDF_ORIENTATION = 'l';   // landscape
const PDF_SIZE = 'a4';
const PAGE_MARGIN_MM = 1;     // מרווח למסך/תצוגה
const EXTRA_SCALE = 1.30;  // הגדלה לתצוגה

// ==== פרמטרים ייעודיים להדפסה (PDF) ====
const PRINT_MIN_MARGIN_MM = 10;   // שוליים בטוחים להדפסה
const PRINT_SAFE_SHRINK = 0.92; // כיווץ קל כדי למנוע חיתוך בקצה הנייר
const PRINT_ALIGN = 'center'; // 'left' | 'center'

// ==== גודל קבוע למסגרות ההערה (צהובות) ====
// שחק עם הערכים עד שזה עוטף את כל הטקסט בהדפסה:
const NOTE_BOX_W = 430;  // רוחב בפיקסלים-סגוליים של ה-SVG
const NOTE_BOX_H = 30;   // גובה בפיקסלים-סגוליים של ה-SVG

// ===== עזרי פונט עברית =====
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

function expandViewBoxToContent(svg, padding = 8) {
    const bbox = svg.getBBox();
    const minX = Math.floor(bbox.x - padding);
    const minY = Math.floor(bbox.y - padding);
    const width = Math.ceil(bbox.width + 2 * padding);
    const height = Math.ceil(bbox.height + 2 * padding);
    svg.setAttribute('viewBox', `${minX} ${minY} ${width} ${height}`);
}

// ===== המרת CSS לערכי attributes (stroke/dash/fill וכו׳) =====
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

// ===== תיקון טקסט עברית (bidi-override) =====
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

/**
 * מרכז מספרי מידות על הקווים האנכיים או אופקיים,
 * כולל תמיכה בטקסטים עם סיבוב (rotate)
 * -- הערות: שמרנו את השינויים שלך והוספנו אופסט קטן
 */
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

// ===== חיצים במקום markers (תמיכה טובה יותר ב-PDF) =====
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

// ===== חישוב התאמה + מיקום (יישור לשמאל/מרכז) =====
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

/**
 * מכריח כל rect.note-box להיות בגודל קבוע NOTE_BOX_W × NOTE_BOX_H,
 * ממורכז סביב text.note-text שבאותו <g> — בלי לשנות stroke-width.
 */
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

// נקודת מידה כחולה שלא נעלמת ב-PDF ולא משתנה בעובי
function addDimDot(svg, x, y, r = 2.2) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x);
    c.setAttribute('cy', y);
    c.setAttribute('r', r);
    // צבעי ברירת מחדל
    c.setAttribute('fill', '#54a5f5');
    c.setAttribute('stroke', '#2c3e50');
    // שומר על קו דק וחד בהדפסה
    c.setAttribute('stroke-width', '0.6');
    c.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.appendChild(c);
}

// ====== פונקציית הייצוא ======
async function downloadPdf() {
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF(PDF_ORIENTATION, 'mm', PDF_SIZE);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        // קריאת נתוני היחידה
        const unitDetails = {
            sideSelect: document.getElementById('sideSelect').value,
            Sapak: document.getElementById('Sapak').value,
            planNum: document.getElementById('planNum').value,
            unitNum: document.getElementById('unitNum').value,
            partName: document.getElementById('partName').value,
            profileType: document.getElementById('profileType').value,
            profileColor: document.getElementById('profileColor').value,
            glassModel: document.getElementById('glassModel').value,
            glassTexture: document.getElementById('glassTexture').value,
            prepFor: document.getElementById('prepFor').value,
        };

        ensureAlefFont(pdf);

        // ====== טיפול ב-SVG ======
        const svgElement = document.getElementById('svg');
        if (!svgElement) { alert('לא נמצא אלמנט SVG לייצוא'); return; }
        const svgClone = svgElement.cloneNode(true);

        withTempInDOM(svgClone, (attached) => {
            inlineComputedStyles(attached);
            fixHebrewText(attached);
            centerDimensionNumbers(attached);
            replaceMarkersWithTriangles(attached);
            forceNoteBoxesSize(attached, NOTE_BOX_W, NOTE_BOX_H);
            expandViewBoxToContent(attached);
        });

        const vb2 = svgClone.viewBox && svgClone.viewBox.baseVal;
        const vbWidth = vb2 && vb2.width ? vb2.width : 1000;
        const vbHeight = vb2 && vb2.height ? vb2.height : 1000;

        const marginForPrint = Math.max(PAGE_MARGIN_MM, PRINT_MIN_MARGIN_MM);
        const displayExtra = Math.min(EXTRA_SCALE, 1.0);
        const box = fitAndPlaceBox(
            pdfWidth, pdfHeight, vbWidth, vbHeight,
            marginForPrint, displayExtra, PRINT_SAFE_SHRINK, PRINT_ALIGN
        );

        const options = { x: box.x, y: box.y, width: box.width, height: box.height, fontCallback: () => 'Alef' };
        let converted = false;

        if (typeof pdf.svg === 'function') {
            await pdf.svg(svgClone, options);
            converted = true;
        } else if (typeof window.svg2pdf === 'function') {
            await window.svg2pdf(svgClone, pdf, options);
            converted = true;
        }

        if (!converted) {
            const xml = new XMLSerializer().serializeToString(svgClone);
            const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
            const imgSrc = 'data:image/svg+xml;base64,' + svg64;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = imgSrc; });
            pdf.addImage(img, 'PNG', box.x, box.y, box.width, box.height);
        }

        // ====== פרטי יחידה ======
        const textX = pdfWidth - marginForPrint;
        let textY = marginForPrint + 10;

        function fixHebrew(text) {
            return text.split('').reverse().join('');
        }

        function addFieldBox(label, value, width = 40, height = 10) {
            if (!value) return;
            pdf.setFont('Alef', 'normal');
            pdf.setFontSize(12);
            pdf.setTextColor(44, 62, 80);
            pdf.setFillColor(245);
            pdf.setDrawColor(200);
            pdf.setLineWidth(0.3);
            pdf.roundedRect(textX - width, textY, width, height, 3, 3, 'FD');

            const fixedValue = (label === 'מספר יחידה'
                || label === 'גוון פרופיל'
                || label === 'מספר תוכנית'
                || label === 'סוג זכוכית')
                ? value
                : fixHebrew(value);

            pdf.text(fixedValue, textX - width / 2, textY + height / 2, { align: 'center', baseline: 'middle' });

            const fixedLabel = fixHebrew(label);
            pdf.setFontSize(12);
            pdf.text(fixedLabel, textX - width / 2, textY - 1.5, { align: 'center' });

            textY += height + 7;
        }

        addFieldBox('הזמנה עבור', document.getElementById('Sapak').selectedOptions[0].text);
        addFieldBox('מספר תוכנית', unitDetails.planNum);
        addFieldBox('מספר יחידה', unitDetails.unitNum);
        addFieldBox('שם מפרק', unitDetails.partName);
        addFieldBox('סוג פרופיל', unitDetails.profileType);
        addFieldBox('גוון פרופיל', unitDetails.profileColor);
        addFieldBox('סוג זכוכית', unitDetails.glassModel);
        addFieldBox('כיוון טקסטורת זכוכית', document.getElementById('glassTexture').selectedOptions[0].text);
        addFieldBox('הכנה עבור', unitDetails.prepFor);

        // ====== הוספת לוגו לפי ספק ======
        function addLogo(pdf) {
            const supplier = unitDetails.Sapak;
            const logo = ProfileConfig.getLogoBySupplier(supplier);
            const logo2 = "data:image/png;base64,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";

            if (!supplier || !logo) return;

            const logoWidth = 25;
            const logoHeight = 25;
            pdf.addImage(logo, "PNG", 10, 10, logoWidth, logoHeight);

            if (unitDetails.profileType === '424' && logo2) {
                const pageHeight = pdf.internal.pageSize.getHeight(); // גובה הדף
                const xPos = 5; // מרחק מהצד השמאלי
                const yPos = pageHeight - 55; // 234 = גובה הלוגו השני, 10 = מרווח מהתחתית
                pdf.addImage(logo2, "PNG", xPos, yPos, 70, 50);
            }
        }

        addLogo(pdf);

        function validateRequiredFields(fields) {
            let allValid = true;
            for (let id of fields) {
                const input = document.getElementById(id);
                if (input) {
                    if (input.value.trim() === '') {
                        alert('אנא מלא את השדה: ' + input.previousElementSibling.textContent);
                        input.style.border = '2px solid red';
                        input.focus();
                        allValid = false;
                        break; // עוצר בלחיצה הראשונה
                    } else {
                        // אם השדה לא ריק – מחזיר את העיצוב הרגיל
                        input.style.border = '';
                    }
                }
            }
            return allValid;
        }

        const requiredFields = ['Sapak', 'planNum', 'unitNum', 'partName', 'profileType', 'profileColor', 'glassModel',];
        if (!validateRequiredFields(requiredFields)) return;

        // ====== שמירה ======
        function savePdf() {
            try {
                pdf.save(unitDetails.planNum + '_' + unitDetails.unitNum + '_' + unitDetails.profileType + '_' + unitDetails.sideSelect + '.pdf');
            } catch (_) {
                const blobUrl = pdf.output('bloburl');
                const a = document.createElement('a');
                a.href = blobUrl; a.download = 'שרטוט.pdf';
                document.body.appendChild(a); a.click(); document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
            }
        }

        savePdf();

    } catch (err) {
        console.error('downloadPdf error:', err);
        alert('אירעה שגיאה בייצוא PDF. בדוק את הקונסול לפרטים.');
    }
}

function addNoteRotated(svg, x, y, text, angle = 90) {
    // מחשבים BBox זמני כדי להתאים את הריבוע
    const tempText = document.createElementNS("http://www.w3.org/2000/svg", "text");
    tempText.setAttribute("class", "note-text");
    tempText.setAttribute("x", x);
    tempText.setAttribute("y", y);
    tempText.setAttribute("text-anchor", "middle");
    tempText.setAttribute("dominant-baseline", "middle");
    tempText.textContent = text;
    svg.appendChild(tempText);

    const bbox = tempText.getBBox();
    svg.removeChild(tempText);

    const padding = 10;
    const rectX = bbox.x - padding;
    const rectY = bbox.y - padding;
    const rectW = bbox.width + padding * 2;
    const rectH = bbox.height + padding * 2;

    svg.insertAdjacentHTML("beforeend", `
    <g transform="rotate(${angle}, ${x}, ${y})">
      <rect class="note-box"
            x="${rectX}" y="${rectY}"
            width="${rectW}" height="${rectH}"></rect>
      <text class="note-text"
            x="${x}" y="${y}"
            text-anchor="middle"
            dominant-baseline="middle">
        ${text}
      </text>
    </g>
  `);
}

function draw() {
    const frontW = mm(+document.getElementById('frontW').value);
    const cabH = mm(+document.getElementById('cabH').value);
    const shelves = Math.max(1, Math.floor(+document.getElementById('shelves').value));
    const sideM = 50;
    const rEdge = mm(+document.getElementById('rEdge').value);
    const rMidCount = Math.max(1, mm(+document.getElementById('rMidCount').value) - 1);
    const rMidStep = (cabH - 2 * rEdge) / rMidCount;
    const gaps = shelves + 1;
    const C = 30, T = 21, B = 9;
    const baseStep = (cabH - C) / gaps;
    const lTop = baseStep + T;
    const lBot = baseStep + B;
    const lStep = baseStep;
    const scale = 0.16;
    const padX = 500, padY = 50;
    const W = frontW * scale, H = cabH * scale;
    const sideSelect = document.getElementById('sideSelect').value;

    const svg = document.getElementById('svg');
    const overlay = document.querySelector('.svg-overlay');
    overlay && (overlay.style.display = 'none');

    svg.innerHTML = `
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="0" markerHeight="0" orient="auto">
      <circle cx="5" cy="5" r="4" fill="#54a5f5"/>
    </marker>
  </defs>
  `;

    const profileType = document.getElementById('profileType').selectedOptions[0].text;
    const settings = ProfileConfig.getProfileSettings(profileType);

    const prepForInput = document.getElementById("prepFor");
    if (prepForInput) {
        prepForInput.value = settings.defaultPrepFor; // הערך האוטומטי
    }

    // חישוב מיקום וגודל פנימי
    const innerX = padX + settings.padSides * scale;
    const innerY = padY + settings.padTopBot * scale;
    const innerWW = W - 2 * settings.padSides * scale;
    const innerH = H - 2 * settings.padTopBot * scale;

    // מסגרת חיצונית
    svg.insertAdjacentHTML('beforeend', `<rect x="${padX}" 
									  y="${padY}"
									  width="${W}"
									  height="${H}"
									  fill="${settings.outerFrameFill}"
									  stroke="${settings.outerFrameStroke}"
									  stroke-width="${settings.outerFrameStrokeWidth}"/>`);

    //מסגרת פנימית
    svg.insertAdjacentHTML('beforeend', `<rect x="${innerX}"
									  y="${innerY}"
									  width="${innerWW}"
									  height="${innerH}"
									  fill="${settings.innerFrameFill}"
									  stroke="${settings.innerFrameStroke}"
									  stroke-width="${settings.innerFrameStrokeWidth}"/>`);

    // טקסט במרכז
    svg.insertAdjacentHTML('beforeend', `
    <text
    x="${padX + W / 2}"
    y="${padY + H + 100}"
    text-anchor="middle">
    ${settings.CenterNotes}
    </text>
`);

    if (settings.hasGerong) {
        // מסגרת עם גרונג - כמו בדגם קואדרו לדוגמה
        svg.insertAdjacentHTML('beforeend',
            `<line x1="${padX}" y1="${padY}" x2="${innerX}" y2="${innerY}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX + W}" y1="${padY}" x2="${innerX + innerWW}" y2="${innerY}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX}" y1="${padY + H}" x2="${innerX}" y2="${innerY + innerH}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX + W}" y1="${padY + H}" x2="${innerX + innerWW}" y2="${innerY + innerH}" stroke="#2c3e50" stroke-width="0.5"/>`
        );
    }
    else {
        //מסגרת ללא גרונג - כמו בדגם זירו לדוגמה
        svg.insertAdjacentHTML('beforeend',
            `<!-- קו עליון -->
        <line x1="${innerX - settings.padSides * scale}" y1="${innerY}" x2="${innerX + innerWW + settings.padSides * scale}" y2="${innerY}" stroke="#2c3e50" stroke-width="0.5"/>
        <!-- קו תחתון -->
        <line x1="${innerX - settings.padSides * scale}" y1="${innerY + innerH}" x2="${innerX + innerWW + settings.padSides * scale}" y2="${innerY + innerH}" stroke="#2c3e50" stroke-width="0.5"/>
        <!-- קו צד שמאל -->
        <line x1="${innerX}" y1="${innerY}" x2="${innerX}" y2="${innerY + innerH}" stroke="#2c3e50" stroke-width="0.5"/>
        <!-- קו צד ימין -->
        <line x1="${innerX + innerWW}" y1="${innerY}" x2="${innerX + innerWW}" y2="${innerY + innerH}" stroke="#2c3e50" stroke-width="0.5"/>`
        );
    }

    // ✅ קידוחים עגולים בדלת
    const drillR = 0.5;
    const drillOffsetRight = 9.5; // הזזה אופקית לשרשרת ימין
    let frontDrillOffset = settings.frontDrillOffset;

    // --- קידוחים לאורך השרשרת הימנית (או שמאל לפי sideSelect) ---
    let yDrill = padY + rEdge * scale;
    let xRightDrill = padX + W - drillOffsetRight + frontDrillOffset;
    if (sideSelect === "left") {
        xRightDrill = padX + drillOffsetRight - frontDrillOffset; // שרשרת שמאל
    }
    svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightDrill}" cy="${yDrill}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
    for (let i = 0; i < rMidCount; i++) {
        yDrill += rMidStep * scale;
        svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightDrill}" cy="${yDrill}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
    }
    yDrill += rEdge * scale / 2;

    // --- קידוחים עבור ה-50 מכל צד (תחתון) ---
    const drillMarginBottom = 1;
    const yBottom50 = padY + H - drillMarginBottom - drillR;
    const xLeftDrill = padX + sideM * scale / 2 + 5;
    const xRightSideDrill = padX + W - sideM * scale / 2 - 5;
    svg.insertAdjacentHTML('beforeend', `<circle cx="${xLeftDrill}" cy="${yBottom50}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
    svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightSideDrill}" cy="${yBottom50}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);

    // --- קידוחים עבור ה-50 מכל צד (עליון) ---
    const drillMarginTop = 1;
    const yTop50 = padY + drillMarginTop + drillR;
    svg.insertAdjacentHTML('beforeend', `<circle cx="${xLeftDrill}" cy="${yTop50}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
    svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightSideDrill}" cy="${yTop50}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);

    // --- קווי מדף ---
    const shelfYs = [];
    let yCursor = padY + lTop * scale;
    for (let i = 0; i < shelves; i++) { shelfYs.push(yCursor); yCursor += lStep * scale; }
    for (const y of shelfYs) {
        svg.insertAdjacentHTML('beforeend', `<line x1="${padX}" y1="${y}" x2="${padX + W}" y2="${y}" stroke="#2c3e50" stroke-width="1" stroke-dasharray="4 2"/>`);
    }

    // ממדים ורוחב
    const dimY1 = padY + H + 30;
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${padX}" y1="${dimY1}" x2="${padX + W}" y2="${dimY1}"></line>`);

    // נקודות רוחב כולל
    addDimDot(svg, padX, dimY1);
    addDimDot(svg, padX + W, dimY1);
    svg.insertAdjacentHTML('beforeend', `<text x="${padX + W / 2}" y="${dimY1 + 16}" text-anchor="middle">${frontW}</text>`);

    const dimY2 = dimY1 + 28;
    const x1 = padX;
    const x2 = padX + sideM * scale;
    const x3 = padX + W - sideM * scale;
    const x4 = padX + W;
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x1}" y1="${dimY2}" x2="${x2}" y2="${dimY2}"></line>`);
    svg.insertAdjacentHTML('beforeend', `<text x="${(x1 + x2) / 2}" y="${dimY2 + 16}" text-anchor="middle">${sideM}</text>`);
    //svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x2}" y1="${dimY2}" x2="${x3}" y2="${dimY2}"></line>`);
    //svg.insertAdjacentHTML('beforeend', `<text x="${(x2+x3)/2}" y="${dimY2+16}" text-anchor="middle">${innerW}</text>`);
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x3}" y1="${dimY2}" x2="${x4}" y2="${dimY2}"></line>`);
    svg.insertAdjacentHTML('beforeend', `<text x="${(x3 + x4) / 2}" y="${dimY2 + 16}" text-anchor="middle">${sideM}</text>`);

    // עיגולים כחולים בין המידות האופקיות (תחתון)
    addDimDot(svg, x1, dimY2); // עיגול בתחילת השרשרת
    addDimDot(svg, x2, dimY2);
    addDimDot(svg, x3, dimY2);
    addDimDot(svg, x4, dimY2); // עיגול בסוף השרשרת

    // גובה כולל
    const xTotal = padX - 55;
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xTotal - 10}" y1="${padY}" x2="${xTotal - 10}" y2="${padY + H}"></line>`);
    // נקודות גובה כולל
    addDimDot(svg, xTotal - 10, padY);
    addDimDot(svg, xTotal - 10, padY + H);
    svg.insertAdjacentHTML('beforeend', `
  <text 
    x="${xTotal - 20}" 
    y="${padY + H / 2}" 
    transform="rotate(-90,${xTotal - 20},${padY + H / 2})" 
    text-anchor="middle" 
    dominant-baseline="middle">
    ${cabH}
  </text>
`);

    // שרשראות ומדידות (ימין/שמאל)
    let xRightDim, xLeftDim;
    if (sideSelect === "right") {
        xRightDim = padX + W + 30;
        xLeftDim = padX - 30;
    } else {
        xRightDim = padX - 40;
        xLeftDim = padX + W + 40;
    }

    // שרשרת ימין
    let yR = padY;
    addDimDot(svg, xRightDim, yR);
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR + 2}" x2="${xRightDim}" y2="${yR + rEdge * scale}"></line>`);
    addDimDot(svg, xRightDim, yR + (rEdge * scale));
    svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (rEdge * scale) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (rEdge * scale) / 2})">${rEdge}</text>`);
    yR += rEdge * scale;

    for (let i = 0; i < rMidCount; i++) {
        // אם זו המידה שברצונך להסתיר
        if (i === 0) {
            yR += rMidStep * scale;   // רק עדכון y
            addDimDot(svg, xRightDim, yR); // נקודה נשמרת
            continue;
        }

        // קו
        svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR + 2}" x2="${xRightDim}" y2="${yR + rMidStep * scale}"></line>`);

        // נקודה
        addDimDot(svg, xRightDim, yR + (rMidStep * scale));

        // טקסט
        svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (rMidStep * scale) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (rMidStep * scale) / 2})">${rMidStep.toFixed(0)}</text>`);

        yR += rMidStep * scale;
    }

    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR + 2}" x2="${xRightDim}" y2="${padY + H}"></line>`);
    addDimDot(svg, xRightDim, padY + H);
    svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (padY + H - yR) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (padY + H - yR) / 2})">${rEdge}</text>`);

    // שרשרת ימין - כולל מידה אחרונה
    //let yR = padY;
    //addDimDot(svg, xRightDim, yR); // נקודה בתחילת השרשרת הימנית
    //svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${yR + rEdge * scale}"></line>`);
    //addDimDot(svg, xRightDim, yR + (rEdge * scale));
    //svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (rEdge * scale) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (rEdge * scale) / 2})">${rEdge}</text>`);
    //yR += rEdge * scale;

    //for (let i = 0; i < rMidCount; i++) {
    //    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${yR + rMidStep * scale}"></line>`);
    //    addDimDot(svg, xRightDim, yR + (rMidStep * scale));
    //    svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (rMidStep * scale) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (rMidStep * scale) / 2})">${rMidStep.toFixed(0)}</text>`);
    //    yR += rMidStep * scale;
    //}
    //svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${padY + H}"></line>`);
    //addDimDot(svg, xRightDim, padY + H);
    //svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 20}" y="${yR + (padY + H - yR) / 2 + 7}" dominant-baseline="middle" transform="rotate(-90, ${xRightDim + 10}, ${yR + (padY + H - yR) / 2})">${rEdge}</text>`);

    // שרשרת שמאל - בוטלה המידה האחרונה עקב סטיות
    let yL = padY;
    //addDimDot(svg, xLeftDim, yL);
    //svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL}" x2="${xLeftDim}" y2="${yL + lTop * scale}"></line>`);
    addDimDot(svg, xLeftDim, yL + (lTop * scale));
    //svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim - 10}" y="${yL + (lTop*scale)/2}" dominant-baseline="middle" transform="rotate(-90, ${xLeftDim - 10}, ${yL + (lTop*scale)/2})">${lTop.toFixed(0)}</text>`);
    yL += lTop * scale;

    for (let i = 0; i < gaps - 2; i++) {
        svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL + 2}" x2="${xLeftDim}" y2="${yL + lStep * scale}"></line>`);
        addDimDot(svg, xLeftDim, yL + (lStep * scale));
        svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim}" y="${yL + (lStep * scale) / 2 - 7}" dominant-baseline="middle" transform="rotate(-90, ${xLeftDim - 10}, ${yL + (lStep * scale) / 2})">${lStep.toFixed(0)}</text>`);
        yL += lStep * scale;
    }
    svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL + 2}" x2="${xLeftDim}" y2="${padY + H}"></line>`);
    addDimDot(svg, xLeftDim, padY + H);
    svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim}" y="${yL + (padY + H - yL) / 2 - 7}" dominant-baseline="middle" transform="rotate(-90, ${xLeftDim - 10}, ${yL + (padY + H - yL) / 2})">${lBot.toFixed(0)}</text>`);

    const trueLeft = padX - 60;     // הקו הקיצוני בשמאל
    const trueRight = padX + W + 30; // הקו הקיצוני בימין
    const noteHeight = padY + H / 2;
    const noteOffset = 50;

    if (sideSelect === "right") {
        // מצב רגיל
        addNoteRotated(svg, trueRight + noteOffset, noteHeight, settings.rightNotes, 90);
        addNoteRotated(svg, trueLeft - noteOffset, noteHeight, settings.LeftNotes, -90);
    } else {
        // מצב שמאל – מתחלף
        addNoteRotated(svg, trueLeft - noteOffset, noteHeight, settings.rightNotes, -90);
        addNoteRotated(svg, trueRight + noteOffset, noteHeight, settings.LeftNotes, 90);
    }

    // סיכום מידות
    const readoutContent = document.getElementById('readout-content');
    if (readoutContent) {
        readoutContent.innerHTML = `
      <div class="readout-item">גובה חזית: <strong>${cabH} מ״מ</strong></div>
      <div class="readout-item">רוחב חזית: <strong>${frontW} מ״מ</strong></div>
    `;
        const readout = document.getElementById('readout');
        if (readout) readout.style.display = 'block';
    }
}

// חיבור כפתורים
const calcBtn = document.getElementById('calcBtn');
if (calcBtn) {
    calcBtn.addEventListener('click', () => {
        calcBtn.classList.add('loading');
        setTimeout(() => { draw(); calcBtn.classList.remove('loading'); }, 300);
    });
}

const downloadBtn = document.getElementById('downloadBtn');
if (downloadBtn) {
    downloadBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try { await downloadPdf(); }
        catch (err) {
            console.error('[downloadPdf] failed:', err);
            alert('אירעה שגיאה בייצוא PDF. ראה קונסול.');
        }
    });
}

const sapakSelect = document.getElementById("Sapak");
const profileSelect = document.getElementById("profileType");
const sideSelect = document.getElementById("sideSelect");
const frontW = document.getElementById("frontW");
const cabH = document.getElementById("cabH");
const shelves = document.getElementById("shelves");
const CabineoLocation = document.getElementById("rEdge");
const CabineoCount = document.getElementById("rMidCount");
const unitContainer = document.getElementById("unitNum").parentElement;

let unitNumInput = document.getElementById("unitNum"); // משתנה שמצביע כרגע ל-input
let excelRows = []; // נשמור כאן את הנתונים מהקובץ

function fillProfileOptions() {
    const selectedSapak = sapakSelect.value;
    const options = ProfileConfig.getProfilesBySupplier(selectedSapak);

    profileSelect.innerHTML = "";

    options.forEach(profile => {
        const optionEl = document.createElement("option");
        optionEl.value = profile;
        optionEl.textContent = profile;
        profileSelect.appendChild(optionEl);
    });

    // אחרי שמילאנו מחדש – נעדכן גם את השרטוט
    draw();
}

// מילוי בפעם הראשונה לפי הספק שנבחר כבר
fillProfileOptions();

// מאזין לשינוי בספק
sapakSelect.addEventListener("change", fillProfileOptions);
profileSelect.addEventListener("change", fillProfileOptions);
sideSelect.addEventListener("change", fillProfileOptions);
frontW.addEventListener("change", fillProfileOptions);
cabH.addEventListener("change", fillProfileOptions);
shelves.addEventListener("change", fillProfileOptions);
CabineoLocation.addEventListener("change", fillProfileOptions);
CabineoCount.addEventListener("change", fillProfileOptions);

// טעינת קובץ Excel
excelFile.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    // חילוץ מספר תוכנית מהשם
    const match = file.name.match(/^([A-Za-z0-9]+)_/);
    if (match) {
        document.getElementById('planNum').value = match[1];
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        // range: 6 => להתחיל מהשורה 7 (B7) שבה יש כותרות
        excelRows = XLSX.utils.sheet_to_json(sheet, { range: 6 });

        console.log("עמודות שהתקבלו:", Object.keys(excelRows[0]));
        console.log("דוגמה לשורה ראשונה:", excelRows[0]);

        // הפיכת השדה unitNum לרשימה נפתחת אם הוא עדיין input
        if (unitNumInput.tagName.toLowerCase() === "input") {
            const select = document.createElement("select");
            select.id = "unitNum";

            // מספרי היחידות מהקובץ, מסוננים
            const units = [...new Set(
                excelRows
                    .map(r => String(r['יחידה']).trim())
                    .filter(u => u && u !== "undefined")
            )];

            units.forEach((unit, index) => {
                const option = document.createElement("option");
                option.value = unit;
                option.textContent = unit;
                select.appendChild(option);

                // בחר אוטומטית את הערך הראשון
                if (index === 0) select.value = unit;
            });

            // מחליפים את השדה ב-DOM
            unitContainer.replaceChild(select, unitNumInput);
            unitNumInput = select;
        }

        // מאזינים לשינוי ברשימה
        unitNumInput.addEventListener("change", function () {
            searchUnit(this.value);
        });

        // ניסיון ראשוני אם כבר יש מספר יחידה בשדה
        searchUnit(unitNumInput.value);
    };
    reader.readAsArrayBuffer(file);
});

// חיפוש שורה לפי מספר יחידה
function searchUnit(unitNum) {
    if (!excelRows.length || !unitNum) return;

    const row = excelRows.find(r => {
        const val = r['יחידה'];
        if (val === undefined) return false;
        return String(val).trim() === String(unitNum).trim();
    });

    if (!row) return;

    frontW.value = row['רוחב'] || '';
    cabH.value = row['אורך'] || '';

    // קביעת כיוון דלת לפי שם החלק
    if (row['שם החלק']) {
        const partName = row['שם החלק'].toLowerCase();
        if (partName.includes('ימין')) sideSelect.value = 'left';
        else if (partName.includes('שמאל')) sideSelect.value = 'right';
    }

    // סוג חומר -> גוון + סוג פרופיל
    if (row['סוג החומר']) {
        const [color, type] = row['סוג החומר'].split('_');
        document.getElementById('profileColor').value = color || '';

        // חיפוש ספק לפי סוג הפרופיל
        let foundSupplier = null;
        for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
            if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(type)) {
                foundSupplier = supplier;
                break;
            }
        }

        if (foundSupplier) {
            // עדכון הספק בשדה עם שם בעברית
            sapakSelect.value = foundSupplier;
            fillProfileOptions(); // עדכון הרשימה בהתאם לספק
        }

        profileSelect.value = type || '';
    }

    if (row['מלואה']) {
        document.getElementById('glassModel').value = row['מלואה'];
    }

    draw();
}

// חיפוש בלייב כשכותבים בשדה יחידה
unitNumInput.addEventListener("input", function () {
    searchUnit(this.value);
});

const batchSaveBtn = document.getElementById("batchSaveBtn");

function showOverlay() {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    document.getElementById('overlayText').textContent = "שומר קבצים...";
    document.getElementById('overlayAnimation').textContent = "⏳";
}

function hideOverlayPending() {
    const overlay = document.getElementById('overlay');
    document.getElementById('overlayText').textContent = "קבצים נשלחו להורדה. אנא אשרו הורדות בדפדפן.";
    document.getElementById('overlayAnimation').textContent = "⬇️";
    setTimeout(() => {
        overlay.style.display = 'none';
    }, 3000); // 3 שניות לפני הסתרה
}

batchSaveBtn.addEventListener("click", async function () {
    if (!excelRows.length) return alert("אין קובץ Excel טעון!");

    showOverlay(); // מציג חלון המתנה

    // יצירת PDF לכל יחידה עם small delay כדי לייבא ערכים ל-DOM
    for (const row of excelRows) {
        if (!row['יחידה']) continue;

        const unitNumber = row['יחידה'];
        const partName = row['שם החלק'] || '';
        const material = row['סוג החומר'] || '';
        const glass = row['מלואה'] || '';

        // עדכון שדות כמו קודם
        frontW.value = row['רוחב'] || '';
        cabH.value = row['אורך'] || '';

        const doorSide = partName.includes('ימין') ? 'right' :
            partName.includes('שמאל') ? 'left' : '';
        sideSelect.value = doorSide;

        let profileType = '';
        let profileColor = '';
        if (material.includes('_')) [profileColor, profileType] = material.split('_');
        document.getElementById('profileColor').value = profileColor;

        let foundSupplier = null;
        for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
            if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(profileType)) {
                foundSupplier = supplier;
                break;
            }
        }
        if (foundSupplier) {
            sapakSelect.value = foundSupplier;
            fillProfileOptions();
        }

        profileSelect.value = profileType;
        document.getElementById('glassModel').value = glass;

        // עדכון שדה היחידה
        if (unitNumInput.tagName === 'SELECT') unitNumInput.value = unitNumber;
        else unitNumInput.value = unitNumber;

        const planNumber = document.getElementById('planNum').value;
        const fileName = `${planNumber}_${unitNumber}_${profileType}_${doorSide}.pdf`;

        // מחכה קצת בין קבצים כדי לעדכן DOM
        await new Promise(resolve => setTimeout(resolve, 50));

        generatePDFForUnit(fileName);
    }

    hideOverlayPending(); // מציג ✓ בסוף
});

function generatePDFForUnit(unitNumber) {
    // הפונקציה שלך שמייצרת PDF על פי הערכים הנוכחיים בשדות
    draw(); // אם צריך לעדכן את השרטוט לפני ההורדה
    // כאן הקוד ליצירת PDF והורדתו
    downloadPdf();
}

const excelFileInput = document.getElementById('excelFile');
const fileNameSpan = document.querySelector('.file-name');

excelFileInput.addEventListener('change', () => {
    if (excelFileInput.files.length > 0) {
        fileNameSpan.textContent = excelFileInput.files[0].name;
    } else {
        fileNameSpan.textContent = "לא נבחר קובץ";
    }
});

// הפעלה ראשונית
draw();