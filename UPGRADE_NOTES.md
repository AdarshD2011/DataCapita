# Upgrade notes

## Visual changes
- Added layered glass surfaces, translucent borders, depth shadows and subtle hover lift to the dark dashboard panels and sidebar.
- Added raised 3D-style primary/secondary buttons with press states.
- Added a matching glass treatment for the import dropzone and modal surfaces.
- Respects the user's reduced-motion preference.

## Import changes
- Added browser-side readers for XLS/XLSX workbooks and DOCX documents.
- Added CSV, TSV, TXT and structured JSON transaction-array support alongside the existing text-based PDF reader.
- Reads populated workbook sheets individually and supports quoted delimiters in CSV/TSV parsing.
- Preserves imported categories when provided, and normalizes the legacy parser's `type` field into `kind` so income rows are previewed/saved as income.
- Keeps the review-before-save workflow; parsing does not automatically save transactions.

## Known limits
- Scanned/image-only PDFs still need OCR and are not supported by this build.
- Legacy binary `.DOC` files should be converted to `.DOCX` before import.
- Imports are limited to 10 MB and up to 250 PDF pages are inspected.
- PDF.js, SheetJS and Mammoth are loaded from public CDNs, so those readers require internet access.
- PDF extraction now groups nearby text items into visual rows and has a layout-tolerant fallback for date-led transaction rows, common currency formats, debit/credit markers, and running-balance columns. It remains heuristic and must be verified against real statements.
- Financial statement layouts vary. Users should verify dates, amounts, categories and income/expense type before saving.

## Validation performed
- `node --check server.js`
- Inline JavaScript syntax check
- Parser smoke tests for CSV with quoted commas, TSV debit/credit columns, semicolon-delimited data, and representative date-led PDF text layouts

## Packaging/security
- `.env` is intentionally not included in the upgraded ZIP. Copy `.env.example` to `.env` and enter your own configuration locally.
- `node_modules` is intentionally not included; run `npm install` in the project folder after extracting.
