window.jsPDF = window.jspdf.jsPDF;
function mm(v){ return Number.isFinite(v) ? v : 0; }

// ==== פרמטרים להתאמה מהירה ====
const PDF_ORIENTATION = 'l';   // landscape
const PDF_SIZE        = 'a4';
const PAGE_MARGIN_MM  = 1;     // מרווח למסך/תצוגה
const EXTRA_SCALE     = 1.30;  // הגדלה לתצוגה

// ==== פרמטרים ייעודיים להדפסה (PDF) ====
const PRINT_MIN_MARGIN_MM = 10;   // שוליים בטוחים להדפסה
const PRINT_SAFE_SHRINK   = 0.92; // כיווץ קל כדי למנוע חיתוך בקצה הנייר
const PRINT_ALIGN         = 'left'; // 'left' | 'center'

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
  } catch (_) {}
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
  const width  = Math.ceil(bbox.width  + 2*padding);
  const height = Math.ceil(bbox.height + 2*padding);
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
    if (['rect','path','polygon','polyline','circle','ellipse'].includes(el.tagName)) {
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

// ===== מרכוז מספרי מידות =====
function centerDimensionNumbers(svgRoot) {
  const numRegex = /^[\d\s\.\-+×xX*]+(?:mm|מ"מ|)$/;
  svgRoot.querySelectorAll('text').forEach(t => {
    const raw = (t.textContent || '');
    const txt = raw.replace(/\s+/g, '');
    if (!txt) return;
    if (numRegex.test(txt)) {
      t.setAttribute('text-anchor', 'middle');
      if (!t.getAttribute('dominant-baseline')) t.setAttribute('dominant-baseline','middle');
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
      const p2 = `${x - s * Math.cos(a - Math.PI/8)},${y - s * Math.sin(a - Math.PI/8)}`;
      const p3 = `${x - s * Math.cos(a + Math.PI/8)},${y - s * Math.sin(a + Math.PI/8)}`;
      const tri = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      tri.setAttribute('points', `${p1} ${p2} ${p3}`);
      tri.setAttribute('fill', stroke);
      tri.setAttribute('stroke', 'none');
      el.parentNode.insertBefore(tri, el.nextSibling);
    };

    const ang = Math.atan2(y2 - y1, x2 - x1);
    if (el.getAttribute('marker-start')) addTri(x1, y1, ang + Math.PI);
    if (el.getAttribute('marker-end'))   addTri(x2, y2, ang);

    el.removeAttribute('marker-start');
    el.removeAttribute('marker-end');
  });
}

// ===== חישוב התאמה + מיקום (יישור לשמאל/מרכז) =====
function fitAndPlaceBox(pdfWidth, pdfHeight, vbWidth, vbHeight, margin=10, extraScale=1.0, printShrink=1.0, align='center') {
  const availW = pdfWidth - 2 * margin;
  const availH = pdfHeight - 2 * margin;
  const vbRatio   = vbWidth / vbHeight;
  const pageRatio = availW / availH;

  let drawW, drawH;
  if (vbRatio > pageRatio) { drawW = availW; drawH = drawW / vbRatio; }
  else                     { drawH = availH; drawW = drawH * vbRatio; }

  drawW *= extraScale; drawH *= extraScale;
  drawW *= printShrink; drawH *= printShrink;

  // ביטחון נוסף
  if (drawW > pdfWidth  - 2*margin) { const s = (pdfWidth  - 2*margin) / drawW; drawW *= s; drawH *= s; }
  if (drawH > pdfHeight - 2*margin) { const s = (pdfHeight - 2*margin) / drawH; drawW *= s; drawH *= s; }

  // מיקום X לפי יישור
  let x;
  if (align === 'left')  x = margin;                 // צמוד לשמאל (עד השוליים)
  else                   x = (pdfWidth - drawW) / 2; // מרכז

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

    // מבטיח עיגון מרכזי לטקסט (כך שהמרכז הוא x/y בפועל)
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');

    // מרכז הטקסט (אחרי כל תיקוני עברית/פונטים)
    const tb = text.getBBox();
    const cx = tb.x + tb.width / 2;
    const cy = tb.y + tb.height / 2;

    // קובע מלבן קבוע-מידה סביב המרכז
    const x = cx - w / 2 - 5;
    const y = cy - h / 2 - 5;

    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width',  String(w));
    rect.setAttribute('height', String(h));

    // חדות קו ללא שינוי עובי תחת סקייל; לא נוגעים ב-stroke-width
    rect.setAttribute('vector-effect', 'non-scaling-stroke');

    // ברירות מחדל רק אם חסר
    if (!rect.getAttribute('stroke')) rect.setAttribute('stroke', '#2c3e50');
    if (!rect.getAttribute('fill'))   rect.setAttribute('fill',  '#fff8b0');

    // אם יש מקווקוו ב-CSS – נשמר כ-inline כדי לא להיעלם ב-PDF
    const rc = getComputedStyle(rect);
    const dash = rc.strokeDasharray && rc.strokeDasharray !== 'none' ? rc.strokeDasharray : null;
    if (dash && !rect.getAttribute('stroke-dasharray')) {
      rect.setAttribute('stroke-dasharray', dash);
    }
  });
}

// נקודת מידה כחולה שלא נעלמת ב-PDF ולא משתנה בעובי
function addDimDot(svg, x, y, r = 2.2) {
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', x);
  c.setAttribute('cy', y);
  c.setAttribute('r',  r);
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
    const pdfWidth  = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    ensureAlefFont(pdf);

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
    const vbWidth  = vb2 && vb2.width  ? vb2.width  : 1000;
    const vbHeight = vb2 && vb2.height ? vb2.height : 1000;

    // שימוש בשוליים ו"כיווץ בטוח" להדפסה + יישור לשמאל
    const marginForPrint   = Math.max(PAGE_MARGIN_MM, PRINT_MIN_MARGIN_MM);
    const displayExtra     = Math.min(EXTRA_SCALE, 1.0); // לא לנפח מעבר ל-1 בהדפסה
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

    try {
      pdf.save('שרטוט.pdf');
    } catch (_) {
      const blobUrl = pdf.output('bloburl');
      const a = document.createElement('a');
      a.href = blobUrl; a.download = 'שרטוט.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    }
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

  const padding = 14; // היה 10 – נותן עוד ביטחון להדפסה
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
  const innerW = frontW - 2 * sideM;
  const scale = 0.16;
  const padX = 500, padY = 50;
  const W = frontW * scale, H = cabH * scale;
  const sideSelect = document.getElementById('sideSelect').value;

  const svg = document.getElementById('svg');
  const overlay = document.querySelector('.svg-overlay');
  overlay && (overlay.style.display = 'none');

  svg.innerHTML = `
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <circle cx="5" cy="5" r="4" fill="#54a5f5"/>
    </marker>
  </defs>
  `;

  const paddingInner = 4;
  const innerX = padX + paddingInner;
  const innerY = padY + paddingInner;
  const innerWW = W - 2 * paddingInner;
  const innerH = H - 2 * paddingInner;

  // מסגרות
  svg.insertAdjacentHTML('beforeend', `<rect x="${padX}" y="${padY}" width="${W}" height="${H}" fill="none" stroke="#2c3e50" stroke-width="0.5"/>`);
  svg.insertAdjacentHTML('beforeend', `<rect x="${innerX}" y="${innerY}" width="${innerWW}" height="${innerH}" fill="none" stroke="#2c3e50" stroke-width="0.5"/>`);

  // קווים אלכסוניים
  svg.insertAdjacentHTML('beforeend', `
    <line x1="${padX}" y1="${padY}" x2="${innerX}" y2="${innerY}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX+W}" y1="${padY}" x2="${innerX+innerWW}" y2="${innerY}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX}" y1="${padY+H}" x2="${innerX}" y2="${innerY+innerH}" stroke="#2c3e50" stroke-width="0.5"/>
    <line x1="${padX+W}" y1="${padY+H}" x2="${innerX+innerWW}" y2="${innerY+innerH}" stroke="#2c3e50" stroke-width="0.5"/>
  `);

  // ✅ קידוחים עגולים בדלת
  const drillR = 1;
  const drillOffsetRight = 10; // הזזה אופקית לשרשרת ימין
  const drillOffsetSide = 5;   // הזזה אופקית ל-50 מכל צד

  // --- קידוחים לאורך השרשרת הימנית (או שמאל לפי sideSelect) ---
  let yDrill = padY + rEdge*scale/2 + 10;
  let xRightDrill = padX + W - drillOffsetRight + 8;
  if (sideSelect === "left"){
    xRightDrill = padX + drillOffsetRight - 8; // שרשרת שמאל
  }
  svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightDrill}" cy="${yDrill}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
  for(let i=0; i<rMidCount; i++){
      yDrill += rMidStep * scale;
      svg.insertAdjacentHTML('beforeend', `<circle cx="${xRightDrill}" cy="${yDrill}" r="${drillR}" fill="none" stroke="#2c3e50" stroke-width="1"/>`);
  }
  yDrill += rEdge*scale/2;

  // --- קידוחים עבור ה-50 מכל צד (תחתון) ---
  const drillMarginBottom = 4;
  const yBottom50 = padY + H - drillMarginBottom - drillR + 3;
  const xLeftDrill = padX + sideM*scale/2 + 5;
  const xRightSideDrill = padX + W - sideM*scale/2 - 5;
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
  for(let i=0; i<shelves; i++){ shelfYs.push(yCursor); yCursor += lStep*scale; }
  for(const y of shelfYs){
      svg.insertAdjacentHTML('beforeend', `<line x1="${padX}" y1="${y}" x2="${padX+W}" y2="${y}" stroke="#2c3e50" stroke-width="1" stroke-dasharray="4 2"/>`);
  }

// ממדים ורוחב
const dimY1 = padY + H + 50;
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${padX}" y1="${dimY1}" x2="${padX+W}" y2="${dimY1}"></line>`);
// נקודות רוחב כולל
addDimDot(svg, padX, dimY1);
addDimDot(svg, padX + W, dimY1);
svg.insertAdjacentHTML('beforeend', `<text x="${padX+W/2}" y="${dimY1+16}" text-anchor="middle">${frontW}</text>`);

const dimY2 = dimY1 + 28;
const x1 = padX;
const x2 = padX + sideM * scale;
const x3 = padX + W - sideM * scale;
const x4 = padX + W;
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x1}" y1="${dimY2}" x2="${x2}" y2="${dimY2}"></line>`);
svg.insertAdjacentHTML('beforeend', `<text x="${(x1+x2)/2}" y="${dimY2+16}" text-anchor="middle">${sideM}</text>`);
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x2}" y1="${dimY2}" x2="${x3}" y2="${dimY2}"></line>`);
svg.insertAdjacentHTML('beforeend', `<text x="${(x2+x3)/2}" y="${dimY2+16}" text-anchor="middle">${innerW}</text>`);
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${x3}" y1="${dimY2}" x2="${x4}" y2="${dimY2}"></line>`);
svg.insertAdjacentHTML('beforeend', `<text x="${(x3+x4)/2}" y="${dimY2+16}" text-anchor="middle">${sideM}</text>`);

// עיגולים כחולים בין המידות האופקיות (תחתון)
addDimDot(svg, x1, dimY2); // עיגול בתחילת השרשרת
addDimDot(svg, x2, dimY2);
addDimDot(svg, x3, dimY2);
addDimDot(svg, x4, dimY2); // עיגול בסוף השרשרת

// גובה כולל
const xTotal = padX - 100;
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xTotal-10}" y1="${padY}" x2="${xTotal-10}" y2="${padY+H}"></line>`);
// נקודות גובה כולל
addDimDot(svg, xTotal-10, padY);
addDimDot(svg, xTotal-10, padY+H);
svg.insertAdjacentHTML('beforeend', `<text x="${xTotal-20}" y="${padY+H/2}" transform="rotate(-90,${xTotal-20},${padY+H/2})">${cabH}</text>`);

// שרשראות ומדידות (ימין/שמאל)
let xRightDim, xLeftDim;
if (sideSelect === "right"){
	xRightDim = padX + W + 70; 
	xLeftDim = padX - 70; 
	} else { 
	xRightDim = padX - 70; 
	xLeftDim = padX + W + 70; 
	}

// שרשרת ימין
let yR = padY;
addDimDot(svg, xRightDim, yR); // נקודה בתחילת השרשרת הימנית
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${yR + rEdge*scale}"></line>`);
addDimDot(svg, xRightDim, yR + (rEdge*scale));
svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 28}" y="${yR+(rEdge*scale)/2+4}">${rEdge}</text>`);
yR += rEdge*scale;
for(let i=0;i<rMidCount;i++){
  svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${yR + rMidStep*scale}"></line>`);
  addDimDot(svg, xRightDim, yR + (rMidStep*scale));
  svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 28}" y="${yR+(rMidStep*scale)/2+4}">${rMidStep.toFixed(0)}</text>`);
  yR += rMidStep*scale;
}
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xRightDim}" y1="${yR}" x2="${xRightDim}" y2="${padY+H}"></line>`);
addDimDot(svg, xRightDim, padY+H); // נקודה בסוף השרשרת הימנית
svg.insertAdjacentHTML('beforeend', `<text x="${xRightDim + 28}" y="${yR+(padY+H-yR)/2+4}">${rEdge}</text>`);

// שרשרת שמאל
let yL = padY;
addDimDot(svg, xLeftDim, yL); // נקודה בתחילת השרשרת השמאלית
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL}" x2="${xLeftDim}" y2="${yL + lTop*scale}"></line>`);
addDimDot(svg, xLeftDim, yL + (lTop*scale));
svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim - 15}" y="${yL+(lTop*scale)/2+4}">${lTop.toFixed(0)}</text>`);
yL += lTop*scale;
for(let i=0;i<gaps-2;i++){
  svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL}" x2="${xLeftDim}" y2="${yL + lStep*scale}"></line>`);
  addDimDot(svg, xLeftDim, yL + (lStep*scale));
  svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim - 15}" y="${yL+(lStep*scale)/2+4}">${lStep.toFixed(0)}</text>`);
  yL += lStep*scale;
}
svg.insertAdjacentHTML('beforeend', `<line class="dim" x1="${xLeftDim}" y1="${yL}" x2="${xLeftDim}" y2="${padY+H}"></line>`);
addDimDot(svg, xLeftDim, padY+H); // נקודה בסוף השרשרת השמאלית
svg.insertAdjacentHTML('beforeend', `<text x="${xLeftDim - 15}" y="${yL+(padY+H-yL)/2+4}">${lBot.toFixed(0)}</text>`);

  // הערות
if (sideSelect === "right") {
  addNoteRotated(svg, xRightDim + 60, padY + H / 2, "הכנה למחברי קבינאו", 90);
  addNoteRotated(svg, xLeftDim - 90, padY + H / 2, "מידות עבור נושאי מדף עד מרכז קידוח, קוטר קידוח: 2.5 מ\"מ", -90);
}
 else {
    addNoteRotated(svg, xLeftDim - 350, padY + H / 2, "הכנה למחברי קבינאו", 90);
    addNoteRotated(svg, xRightDim + 300, padY + H / 2, "מידות עבור נושאי מדף עד מרכז קידוח, קוטר קידוח: 2.5 מ\"מ", -90);
}

  // סיכום מידות
  const readoutContent = document.getElementById('readout-content');
  if (readoutContent) {
    readoutContent.innerHTML = `
      <div class="readout-item">רוחב פנימי: <strong>${innerW} מ״מ</strong></div>
      <div class="readout-item">חלוקה רוחבית: <strong>${sideM} - ${innerW} - ${sideM} מ״מ</strong></div>
      <div class="readout-item">גובה חללי ימין: <strong>${rEdge} / ${rMidStep.toFixed(0)} / ${rEdge} מ״מ</strong></div>
      <div class="readout-item">גובה חללי שמאל: <strong>${lTop.toFixed(0)} / ${lStep.toFixed(0)} / ${lBot.toFixed(0)} מ״מ</strong></div>
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

// הפעלה ראשונית
draw();
