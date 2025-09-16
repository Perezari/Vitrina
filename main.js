window.jsPDF = window.jspdf.jsPDF;
function mm(v) { return Number.isFinite(v) ? v : 0; }

// Variables
const sapakSelect = document.getElementById("Sapak");
const profileSelect = document.getElementById("profileType");
const sideSelect = document.getElementById("sideSelect");
const frontW = document.getElementById("frontW");
const cabH = document.getElementById("cabH");
const shelves = document.getElementById("shelves");
const CabineoLocation = document.getElementById("rEdge");
const CabineoCount = document.getElementById("rMidCount");
const unitContainer = document.getElementById("unitNum").parentElement;
let unitNumInput = document.getElementById("unitNum");
let excelRows = [];
const downloadBtn = document.getElementById('downloadBtn');
const batchSaveBtn = document.getElementById("batchSaveBtn");
batchSaveBtn.style.display = 'none';
const excelFileInput = document.getElementById('excelFile');
const fileNameSpan = document.querySelector('.file-name');

// Adds a small dot (circle) to the SVG at specified coordinates.
// Sets default fill and stroke colors for visibility.
// Ensures the stroke remains thin and sharp when scaling or printing.
// Default radius is 2.2 units, but can be overridden.
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

// Adds a rotated note box with text to the SVG.
// Temporarily measures the text to size the box with padding.
// Inserts a <g> element containing the <rect> and <text>, rotated around the specified coordinates.
// Default rotation angle is 90 degrees.
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
<g transform="rotate(${angle}, ${x}, ${y})"> <rect class="note-box" x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}"></rect> <text class="note-text" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle"> ${text} </text> </g>
    `);
}

// Validates that all required input fields are filled.
// Shows an alert and highlights the first empty field.
// Returns true if all fields have values, false otherwise.
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

// Populates the profile dropdown based on the selected supplier
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

    draw();
}
fillProfileOptions();

// Finds a unit by number and fills the form fields with its properties
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

    let doorSide = '';
    let glass = row['מלואה'] || '';

    // קודם כל ננסה מהשורה עצמה
    if (row['שם החלק']) {
        const partName = row['שם החלק'];
        if (partName.includes('ימין')) doorSide = 'left';
        else if (partName.includes('שמאל')) doorSide = 'right';
    }

    // אם אין מידע מהשורה → נשתמש במטא־דאטה של היחידה
    if (!doorSide && unitsMeta[unitNum]?.doorSide) {
        doorSide = unitsMeta[unitNum].doorSide;
    }
    if (glass === 'NO_ZIP' && unitsMeta[unitNum]?.glass) {
        glass = unitsMeta[unitNum].glass;
    }

    sideSelect.value = doorSide;

    if (row['סוג החומר']) {
        const [color, type] = row['סוג החומר'].split('_');
        document.getElementById('profileColor').value = color || '';

        let foundSupplier = null;
        for (const supplier in ProfileConfig.SUPPLIERS_PROFILES_MAP) {
            if (ProfileConfig.SUPPLIERS_PROFILES_MAP[supplier].includes(type)) {
                foundSupplier = supplier;
                break;
            }
        }

        if (foundSupplier) {
            sapakSelect.value = foundSupplier;
            fillProfileOptions();
        }

        profileSelect.value = type || '';
    }

    document.getElementById('glassModel').value = glass;
    draw();
}

//Overlay functions
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
    setTimeout(() => { overlay.style.display = 'none'; }, 3000);
}

function generatePDFForUnit(unitNumber) {
    draw();
    downloadPdf();
}

// Generates a PDF from the current SVG and unit details on the page.
// Ensures Hebrew text uses the Alef font and applies all SVG styling and fixes.
// Clones the SVG, applies computed styles, fixes Hebrew text, centers dimensions, replaces markers, and sizes note boxes.
// Fits the SVG into the PDF page with proper scaling and margins.
// Adds unit detail fields as labeled boxes alongside the SVG.
// Adds supplier logos (PNG or SVG) to the PDF.
// Validates required fields before saving.
// Saves the PDF with a filename based on plan number, unit number, profile type, and side selection.
// Catches and reports errors during the PDF generation process.
async function downloadPdf() {
    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF(PDF_ORIENTATION, 'mm', PDF_SIZE);
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const profileType = document.getElementById('profileType').selectedOptions[0].text;
        const settings = ProfileConfig.getProfileSettings(profileType);

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
            if (!text) return '';

            // זיהוי עברית
            const hebrewRegex = /[\u0590-\u05FF]/;

            if (hebrewRegex.test(text)) {
                // אם יש עברית – נהפוך את כל המחרוזת
                return text.split('').reverse().join('');
            }

            // אחרת אנגלית/מספרים – משאירים כמו שזה
            return text;
        }

        function addFieldBox(label, value, width = 40, height = 10) {
            if (!value) return;

            pdf.setFont('Alef', 'normal');
            pdf.setFontSize(12);
            pdf.setTextColor(44, 62, 80);

            if (value.toLowerCase() === 'קידוחים לקבינאו 5 מ\"מ מקצה הדלת בקוטר 5 מ\"מ בחלק עליון ותחתון') {
                pdf.setFillColor(255, 246, 168);
            }
            else {
                pdf.setFillColor(245);
            }

            pdf.setDrawColor(200);
            pdf.setLineWidth(0.3);

            const fixedValue = fixHebrew(value);
            const fixedLabel = fixHebrew(label);

            // מחלק את הטקסט לשורות שמתאימות לרוחב
            const lines = pdf.splitTextToSize(fixedValue, width).reverse(); // הופך את סדר השורות
            const dynamicHeight = lines.length * 6 + 4; // 6 פיקסלים לכל שורה + פדינג עליון ותחתון

            pdf.roundedRect(textX - width, textY, width, dynamicHeight, 3, 3, 'FD');

            // ממרכז את הטקסט אנכית בתוך המסגרת
            const textStartY = textY + dynamicHeight / 2 - ((lines.length - 1) * 3);

            pdf.text(lines, textX - width / 2, textStartY, { align: 'center', baseline: 'middle' });

            // כותרת מעל המסגרת
            pdf.setFontSize(12);
            pdf.text(fixedLabel, textX - width / 2, textY - 1.5, { align: 'center' });

            // לוגו אם נדרש
            //if (value.toLowerCase() === 'בלורן') {
            //    const logo = ProfileConfig.getLogoBySupplier("bluran");
            //    pdf.addImage(logo, 'PNG', textX - width + 2, textY + 2, 6, 6);
            //}
            //if (value.toLowerCase() === 'נילסן') {
            //    const logo = ProfileConfig.getLogoBySupplier("nilsen");
            //    pdf.addImage(logo, 'PNG', textX - width + 2, textY + 2, 6, 6);
            //}

            textY += dynamicHeight + 7; // עדכון Y למיקום הבא
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
        addFieldBox('הערות נוספות', settings.CenterNotes);

        // ====== הוספת לוגו לפי ספק ======
        function addLogo(pdf) {
            const supplier = unitDetails.Sapak;
            const logo2 = ProfileConfig.getLogoBySupplier("Sketch_for_dofen");

            if (!supplier) return;

            if (unitDetails.profileType === 'דגם424' && logo2) {
                const pageHeight = pdf.internal.pageSize.getHeight(); // גובה הדף
                const xPos = 5; // מרחק מהצד השמאלי
                const yPos = pageHeight - 55; // 234 = גובה הלוגו השני, 10 = מרווח מהתחתית
                pdf.addImage(logo2, "PNG", xPos, yPos, 70, 50);
            }
        }

        addLogo(pdf);

        async function addLogoSvg(pdf, logo) {
            if (!logo) return;

            let svgText;

            // בדיקה אם זה Data URI (base64)
            if (logo.startsWith("data:image/svg+xml")) {
                const base64 = logo.split(",")[1];
                svgText = atob(base64);
            } else {
                // SVG כטקסט רגיל
                svgText = logo;
            }

            // ממירים ל־DOM
            const svgElement = new DOMParser().parseFromString(svgText, "image/svg+xml").documentElement;

            // מוסיפים ל־PDF
            await pdf.svg(svgElement, {
                x: 10,
                y: 10,
                width: 40,
                height: 25
            });
        }

        // לוגו מ־ProfileConfig (יכול להיות טקסט או Data URI)
        const logo = ProfileConfig.getLogoBySupplier("avivi_svg");
        await addLogoSvg(pdf, logo);

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

// Draws a cabinet/front panel diagram in an SVG element.
// Includes frames, shelves, drill holes, dimensions, and rotated notes
// based on user input and profile settings.
// Also updates an HTML readout with the cabinet dimensions.
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

    // חישוב גודל ה-viewBox המלא כולל כל האלמנטים
    const totalWidth = padX + W + 480; // מרחב נוסף למידות
    const totalHeight = padY + H + 150; // מרחב נוסף למידות תחתונות

    // הגדרת viewBox שיאפשר התאמה אוטומטית
    svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

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
    const noteHeight = padY + H / 2; //מיקום אמצע לגובה
    const noteOffset = 50; // הזחה מהקצה

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

//Listeners
sapakSelect.addEventListener("change", fillProfileOptions);
profileSelect.addEventListener("change", fillProfileOptions);
sideSelect.addEventListener("change", fillProfileOptions);
frontW.addEventListener("change", fillProfileOptions);
cabH.addEventListener("change", fillProfileOptions);
shelves.addEventListener("change", fillProfileOptions);
CabineoLocation.addEventListener("change", fillProfileOptions);
CabineoCount.addEventListener("change", fillProfileOptions);

// Load and process Excel file
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
        excelRows = XLSX.utils.sheet_to_json(sheet, { range: 6 });

        console.log("עמודות שהתקבלו:", Object.keys(excelRows[0]));
        console.log("דוגמה לשורה ראשונה:", excelRows[0]);

        // בדיקה אם קיימת לפחות דופן ויטרינה פינתית
        const hasAnyCorner = excelRows.some(r => (r['שם החלק'] || '').includes('דופן ויטרינה פינתית'));
        if (!hasAnyCorner) {
            alert("לא נמצאה דופן ויטרינה פינתית בקובץ. לא ניתן להמשיך.");

            // השבתת כפתורים
            batchSaveBtn.disabled = true;
            batchSaveBtn.style.backgroundColor = "#ccc";
            batchSaveBtn.style.cursor = "not-allowed";

            downloadBtn.disabled = true;
            downloadBtn.style.backgroundColor = "#ccc";
            downloadBtn.style.cursor = "not-allowed";

            // איפוס השרטוט
            const svg = document.getElementById('svg');
            const overlay = document.querySelector('.svg-overlay');
            if (svg) svg.innerHTML = "";
            if (overlay) overlay.style.display = 'none';

            return; // לא ממשיכים הלאה
        } else {
            // הפעלה מחדש של כפתורים אם הכל תקין
            batchSaveBtn.disabled = false;
            batchSaveBtn.style.backgroundColor = "";
            batchSaveBtn.style.cursor = "pointer";

            downloadBtn.disabled = false;
            downloadBtn.style.backgroundColor = "";
            downloadBtn.style.cursor = "pointer";
        }

        // בניית מיפוי יחידות → כל השורות שלהן
        unitsMap = {};
        for (const row of excelRows) {
            if (!row['יחידה']) continue;
            const unitNum = row['יחידה'];
            if (!unitsMap[unitNum]) unitsMap[unitNum] = [];
            unitsMap[unitNum].push(row);
        }

        // חישוב מטא־דאטה לכל יחידה (כיוון דלת + מלואה בפועל)
        unitsMeta = {};
        for (const [unitNum, rows] of Object.entries(unitsMap)) {
            const hasCorner = rows.some(r => (r['שם החלק'] || '').includes('דופן ויטרינה פינתית'));
            const doorRow = rows.find(r => (r['שם החלק'] || '').includes('דלת'));

            if (!hasCorner || !doorRow) {
                continue; // היחידה הזו לא נכנסת לרשימה
            }

            let doorSide = '';
            const doorName = doorRow['שם החלק'] || '';
            if (doorName.includes('ימין')) doorSide = 'left';
            else if (doorName.includes('שמאל')) doorSide = 'right';

            let glass = doorRow['מלואה'] || '';
            if (!glass || glass === 'NO_ZIP') {
                const glassRow = rows.find(r => (r['מלואה'] || '') && r['מלואה'] !== 'NO_ZIP');
                if (glassRow) glass = glassRow['מלואה'];
            }

            unitsMeta[unitNum] = { doorSide, glass };
        }

        // הפיכת השדה unitNum לרשימה נפתחת אם הוא עדיין input
        if (unitNumInput.tagName.toLowerCase() === "input") {
            const select = document.createElement("select");
            select.id = "unitNum";

            const units = Object.keys(unitsMeta); // משתמשים במטא (כבר אחרי סינון)
            units.forEach((unit, index) => {
                const option = document.createElement("option");
                option.value = unit;
                option.textContent = unit;
                select.appendChild(option);
                if (index === 0) select.value = unit;
            });

            unitContainer.replaceChild(select, unitNumInput);
            unitNumInput = select;
        }

        unitNumInput.addEventListener("change", function () {
            searchUnit(this.value);
        });

        if (unitNumInput.value) {
            searchUnit(unitNumInput.value);
        }
    };
    reader.readAsArrayBuffer(file);
});

// Search and display unit details when unit number is selected or typed
unitNumInput.addEventListener("input", function () {
    searchUnit(this.value);
});

// Single PDF generation for the currently selected unit
downloadBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await downloadPdf(); }
    catch (err) {
        console.error('[downloadPdf] failed:', err);
        alert('אירעה שגיאה בייצוא PDF. ראה קונסול.');
    }
});

// Batch generate PDFs for all corner cabinet units in the loaded Excel file
batchSaveBtn.addEventListener("click", async function () {
    if (!excelRows.length) return alert("אין קובץ Excel טעון!");

    const requiredFields = ['Sapak', 'planNum', 'unitNum', 'partName', 'profileType', 'profileColor', 'glassModel',];
    if (!validateRequiredFields(requiredFields)) return;

    showOverlay();

    for (const row of excelRows) {
        if (!row['יחידה']) continue;

        const partName = row['שם החלק'] || '';

        // סינון: הורדה רק עבור דופן ויטרינה פינתית
        if (!partName.includes('דופן ויטרינה פינתית')) continue;

        const unitNumber = row['יחידה'];
        const material = row['סוג החומר'] || '';
        let glass = row['מלואה'] || '';

        // קביעת כיוון דלת לפי המטא
        let doorSide = unitsMeta[unitNumber]?.doorSide || '';
        if (glass === 'NO_ZIP' && unitsMeta[unitNumber]?.glass) {
            glass = unitsMeta[unitNumber].glass;
        }

        frontW.value = row['רוחב'] || '';
        cabH.value = row['אורך'] || '';
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

        if (unitNumInput.tagName === 'SELECT') unitNumInput.value = unitNumber;
        else unitNumInput.value = unitNumber;

        const planNumber = document.getElementById('planNum').value;
        const fileName = `${planNumber}_${unitNumber}_${profileType}_${doorSide}.pdf`;

        await new Promise(resolve => setTimeout(resolve, 50));
        generatePDFForUnit(fileName);
    }

    hideOverlayPending();
});

// Update displayed file name when a new Excel file is selected
excelFileInput.addEventListener('change', () => {
    if (excelFileInput.files.length > 0) {
        fileNameSpan.textContent = excelFileInput.files[0].name;
    } else {
        fileNameSpan.textContent = "לא נבחר קובץ";
    }
});

// First draw
draw();