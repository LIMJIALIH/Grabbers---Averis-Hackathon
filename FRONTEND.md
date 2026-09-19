# DocuVerify frontend

The proposal is represented by an interactive shipping operations workspace using the existing Next.js, React, Tailwind and Lucide stack. The design preserves the original charcoal/paper/orange palette, adds olive status accents and editorial typography, and uses staggered entrances, SVG stroke reveals and a pulsing active pipeline step. Motion respects `prefers-reduced-motion`. React Bits was consulted as animation inspiration; no external component code or runtime dependency was added.

## Available interactions

- Search and filter six independent demo cases; switch vessels and associated source values.
- Compare all seven mandatory fields. The sample MYTPP / Tanjung Pelepas alias is recognized.
- Review and edit extracted BL values, validate numeric fields, and confirm low-confidence extractions.
- Keep source document values unchanged when editing extracted values.
- Select fields to highlight their sample source spans; switch SI / BL and adjust preview size.
- Gate approval until discrepancies and low-confidence fields are resolved.
- Record local approval or escalation with a reason, then inspect session audit history.
- Download a JSON report with numeric values, confidence, comparison results and session audit entries.
- Browse documents, notifications, and pipeline information.
- Select local PDF, DOCX, TXT or JSON files with format and size validation.
- Use responsive navigation, keyboard focus indicators, native modal focus management and reduced motion.

## Integration entry points

Classification exposes all five proposal categories. The ingestion, extraction, comparison, human review and integrations controls describe their intended roles. Actual inbox access, parsing, vision inference, missing/unreadable-document detection, fuzzy matching, weight conversion, real PDF bounding boxes, authentication and POST /submit remain backend integration work. Uploads are not transmitted. The sample document is an HTML preview, not a rendered PDF. State resets on refresh and external messages are never sent.

## Validation

Run `npx tsc --noEmit` and `npm run build`. For browser smoke testing, install optional local tools with `npm install --no-save --package-lock=false @playwright/test`, start the app on port 3100 and run `node scripts/check-ui.cjs`. Set `PREVIEW_URL` to test another URL. The script uses installed Microsoft Edge and checks review gating, numeric validation, editing, switching cases, approval, escalation, audit, search, JSON download, file selection, mobile navigation, overflow and browser errors.
