# 📐 מחולל פרט לדופן ויטרינה פינתית

![Language](https://img.shields.io/badge/language-JavaScript-yellow.svg)
![Frontend](https://img.shields.io/badge/frontend-HTML%2FCSS-blue.svg)
![PDF_Generation](https://img.shields.io/badge/PDF_Generation-jsPDF-red.svg)
![Excel_Parsing](https://img.shields.io/badge/Excel_Parsing-SheetJS-green.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

This project provides a web-based, user-friendly tool to dynamically generate detailed technical drawings for corner showcase wall panels. Users can input specific dimensions and profile characteristics, or upload an Excel file for automated data entry and batch PDF generation. The tool supports different suppliers and profile types, ensuring accurate drawings with proper dimensions, drill holes, and detailed notes, all rendered in a clean SVG format that can be exported as a professional PDF. Designed with Hebrew (RTL) language support, it streamlines the process of creating precise technical specifications for custom cabinetry.

✨ **Features**

*   **Dynamic SVG Drawing:** Generates interactive and scalable technical drawings of corner showcase panels based on user inputs.
*   **Intuitive User Interface:** A simple and clear form for entering dimensions (front width, cabinet height, number of shelves, etc.) and unit details (supplier, plan number, profile type, glass model, etc.).
*   **Excel Data Integration:** Upload Excel files (`.xls`, `.xlsx`) to automatically populate form fields for specific units, supporting efficient batch processing.
*   **Customizable Profiles:** Supports various supplier profiles (e.g., "בלורן", "נילסן") and profile types (e.g., "קואדרו", "דגם424"), each with unique drawing parameters (e.g., padding, gerong connections, drill offsets).
*   **PDF Export:** Download individual drawings as high-quality PDF documents, with options for batch PDF generation from loaded Excel data.
*   **Hebrew Language Support (RTL):** Full support for Hebrew text display and proper right-to-left rendering in both the web interface and generated PDF files, utilizing the custom 'Alef' font for precision.
*   **Automated Dimensioning & Notes:** Includes automatic dimension lines, drill hole markings, and rotated explanatory notes within the SVG drawings, customized according to the selected profile.
*   **Supplier Logos in PDF:** Automatically embeds the relevant supplier logo (e.g., "בלורן", "נילסן") into the generated PDF.

📚 **Tech Stack**

*   **Frontend:** HTML5, CSS3 (with Google Fonts - Rubik)
*   **Core Logic:** JavaScript (Vanilla JS)
*   **PDF Generation:**
    *   [jsPDF](https://github.com/MrRio/jsPDF)
    *   [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)
*   **Excel Parsing:** [SheetJS (xlsx)](https://sheetjs.com/)
*   **Custom Font:** `Alef-normal.js` (for Hebrew rendering in PDF)

🚀 **Installation**

To get a local copy up and running, follow these simple steps. This is a static web application, so no server-side setup is required.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/DofenVitrinaPinatit.git
    ```
2.  **Navigate to the project directory:**
    ```bash
    cd DofenVitrinaPinatit
    ```
3.  **Open `index.html`:**
    Simply open the `index.html` file in your preferred web browser.
    ```bash
    open index.html # On macOS
    # or
    start index.html # On Windows
    ```

▶️ **Usage**

1.  **Input Details:**
    *   Open `index.html` in your browser.
    *   Manually enter the **Front Width**, **Front Height**, **Number of Shelves**, and **Cabineo Connector Edge** dimensions (in mm).
    *   Select the **Supplier** and **Profile Type** from the dropdowns.
    *   Fill in **Plan Number**, **Unit Number**, **Part Name**, **Profile Color**, **Glass Model**, and **Glass Texture**.
    *   The SVG drawing will update dynamically as you change the inputs.

2.  **Upload Excel File (Optional):**
    *   Click the "..." button next to "לא נבחר קובץ" (No file selected) to upload an Excel file (`.xls` or `.xlsx`).
    *   The application will attempt to extract the `Plan Number` from the file name (e.g., `[PlanNum]_...`).
    *   If the Excel file contains data for multiple units, the "מספר יחידה" (Unit Number) input will transform into a dropdown, allowing you to select individual units. Selecting a unit will auto-populate the form fields based on the Excel data.

3.  **Generate PDF:**
    *   After defining your unit's parameters, click the "הורד PDF 💾" (Download PDF) button to generate and download a PDF of the current drawing.
    *   Ensure all required fields are filled as prompted by validation alerts.

4.  **Batch PDF Generation (from Excel):**
    *   If you've loaded an Excel file with multiple "Corner Showcase Wall" units, click the "PDF BATCH 💾" button.
    *   The application will iterate through relevant units in the Excel file, automatically populate the form for each, generate a PDF, and prompt for download. This is useful for processing many drawings at once.

🤝 **Contributing**

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

📝 **License**

Distributed under the MIT License. See `LICENSE` for more information (if applicable, otherwise add a LICENSE file).
