# Advanced Calculator Chrome Extension (Manifest V3)

A modern, fast, lightweight **Calculator Chrome Extension** built using **HTML, CSS, and vanilla JavaScript**. It operates **100% offline**, requires **zero backend servers or external dependencies**, and enforces strict security compliance by using a custom safe mathematical parser (no `eval` or `new Function`).

---

## 🌟 Key Features

### 1. Basic & Scientific Calculation Modes
- **Basic Mode**: Addition (`+`), Subtraction (`−`), Multiplication (`×`), Division (`÷`), Percentage (`%`), Decimal (`.`), Negation (`±`), Parentheses (`( )`), Clear (`AC`), Backspace (`⌫`), Equal (`=`).
- **Scientific Mode**: Trigonometry (`sin`, `cos`, `tan`, `asin`, `acos`, `atan`), Logarithmic (`log`, `ln`), Powers (`x²`, `xʸ`), Square Root (`√`), Factorial (`!`), Reciprocal (`1/x`), Constants (`π`, `e`).
- **Angle Unit Switcher**: Toggle between **DEG** (Degrees) and **RAD** (Radians) mode for trigonometric calculations.
- **Implicit Multiplication**: Supports expressions like `2(3 + 4)`, `3π`, `5sin(30)`.
- **Percentage Calculations**: Handles standard percentage operations such as `1250 + 15% = 1437.50`.

### 2. Memory Functions
- Standard memory operations: `MC` (Clear), `MR` (Recall), `M+` (Add), `M−` (Subtract).
- Visual `M` badge indicator appears when memory holds a value.

### 3. Persistent Calculation History
- Automatically saves calculations with timestamps.
- **Search History**: Instantly search calculation expressions or results.
- **Date & Filter Tabs**: Filter by `All`, `Today`, `Yesterday`, `This Week`, or `⭐ Pinned`.
- **Interactive Items**: Click any past calculation item to load it back into the calculator.
- **Pin & Favorite**: Star important calculations to keep them pinned.
- **Delete / Clear**: Delete single entries or clear history with a safety confirmation dialog.

### 4. Import & Export
- **Export JSON**: Save complete history to `calculator-history.json`.
- **Export CSV**: Export calculation logs formatted for spreadsheet tools.
- **Import JSON**: Upload previously exported JSON history with automatic duplicate prevention.

### 5. Copy & Toast Notifications
- **Copy Result**: Quick button beside the primary result display.
- **Copy Expression**: One-click button to copy full equations (e.g., `1,250 × 25 = 31,250`).
- **Copy All History**: Copy all filtered history items to clipboard.
- Visual toast notification pops up for every copy action.

### 6. Modern Customizable Theme & UI
- **Themes**: Switch between **Light**, **Dark**, and **System Default** auto mode.
- Persistent state using `chrome.storage.local`.
- Glassmorphic styling, active button press micro-animations, accessible contrast ratios, and responsive layout (~360px popup width).

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `0` – `9` | Digits |
| `+` | Addition |
| `-` | Subtraction |
| `*` | Multiplication (`×`) |
| `/` | Division (`÷`) |
| `%` | Percentage |
| `.` | Decimal point |
| `(` `)` | Parentheses |
| `^` | Power (`x^y`) |
| `!` | Factorial |
| `Enter` or `=` | Calculate Result |
| `Backspace` | Delete last character |
| `Escape` | Clear calculation / Close History drawer |
| `Ctrl+C` / `Cmd+C` | Copy current result |

---

## 🛠️ Installation Guide

Follow these simple steps to load the extension in Google Chrome (or any Chromium browser like Brave, Edge, Opera):

1. **Clone or Download Project**:
   Ensure all extension files are placed in a single directory:
   ```text
   calculator/
   ├── manifest.json
   ├── popup.html
   ├── popup.css
   ├── popup.js
   ├── icons/
   │   ├── icon16.png
   │   ├── icon32.png
   │   ├── icon48.png
   │   └── icon128.png
   └── README.md
   ```

2. **Open Chrome Extensions Manager**:
   - Open Google Chrome.
   - Navigate to `chrome://extensions` in your address bar (or go to `Menu` -> `Extensions` -> `Manage Extensions`).

3. **Enable Developer Mode**:
   - Toggle the **Developer mode** switch in the top-right corner of the Extensions page.

4. **Load Unpacked Extension**:
   - Click the **Load unpacked** button in the top-left menu.
   - Select the `calculator` folder.

5. **Pin to Toolbar**:
   - Click the puzzle icon in Chrome's top toolbar.
   - Pin **Advanced Calculator** for instant 1-click access!

---

## 🔒 Security & Privacy

- **Manifest V3 Compliant**.
- **Minimum Permissions**: Only requests `"permissions": ["storage"]`.
- **Zero Remote Dependencies**: No external libraries, CDN scripts, fonts, or network requests.
- **Safe Math Engine**: Built with a custom Shunting-yard recursive token parser, completely free of unsafe `eval()` or `new Function()`.
