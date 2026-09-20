# Shipping Document Verification & Audit Trail Prototype (Malaysia)

A prototype web application demonstrating an **In-Memory Audit Trail and User Action Recorder** integrated into a Malaysian shipping document verification workflow (Shipping Instruction vs. Ocean Bill of Lading).

---

## 📌 Project Overview

This prototype records and inspects user actions during shipping document verification. The application compares **Shipping Instructions (SI)** against **Carrier Draft Bills of Lading (BL)** across Malaysian maritime routes, flagging discrepancies in weights, seal numbers, container codes, and consignee addresses.

Every critical operator action is captured by a central, reusable action recorder and presented in real time in a chronological **Audit Trail**.

---

## 🛡️ Core Constraints & Architecture

In accordance with prototype specifications:

- **Strictly In-Memory**: All audit logs are maintained in an in-memory TypeScript array (`inMemoryAuditTrail: UserAction[]`).
- **No Persistence Layer**: No databases, Firebase, backend services, or browser `localStorage` are used.
- **Session-Transient**: The audit trail completely resets whenever the application restarts or the page reloads.
- **Reactive UI**: Utilizes React’s `useSyncExternalStore` to provide synchronous, zero-lag UI updates across components whenever an action is recorded.

---

## ⚙️ Audit Trail API: `recordUserAction()`

The application exposes a lightweight, reusable function callable from any component:

```typescript
import { recordUserAction } from './audit/auditTrailStore';

recordUserAction({
  actionType: 'CORRECT_FIELD',
  actionLabel: 'Field Correction',
  emailId: 'EML-2024-8841',
  description: 'Corrected Customs Seal Number (JKDM) to MY-JKD-849201. Reason: Clerical typo on draft BL verified against packing list.',
  metadata: {
    fieldId: 'sealNo',
    previousBlValue: 'MY-JKD-849210',
    authoritativeValue: 'MY-JKD-849201',
    regulatoryAuthority: 'Jabatan Kastam Diraja Malaysia (JKDM)'
  }
});
```

### Action Data Structure (`UserAction`)

| Property | Type | Description |
| :--- | :--- | :--- |
| `id` | `string` | Unique action identifier (`act_<timestamp>_<rand>`) |
| `timestamp` | `string` | Human-readable formatted date and time |
| `timestampIso` | `string` | ISO 8601 UTC timestamp |
| `timestampRaw` | `number` | Epoch milliseconds for chronological sorting |
| `actionType` | `ActionType` | Enum category of the action |
| `actionLabel` | `string` | Short title displayed on badges |
| `emailId` | `string` (optional) | Associated shipping email ID (e.g. `EML-2024-8841`) |
| `description` | `string` | Detailed narrative of the event |
| `documentType`| `'SI' \| 'BL' \| 'SI_VS_BL'` | Document context (if applicable) |
| `metadata` | `Record<string, unknown>` | Structured payload (e.g. diffs, notes, priority) |

---

## 🚢 Recorded Workflow Actions

The prototype captures the full lifecycle of document verification:

1. **`OPEN_EMAIL`**: User selects and reviews a shipment email case (logs email ID, carrier, vessel, and route).
2. **`VIEW_ATTACHMENT`**: User views either the Shipping Instruction (SI) or Draft Bill of Lading (BL) document attachment.
3. **`REVIEW_COMPARISON`**: User evaluates the automated SI vs. BL comparison matrix and discrepancy detection results.
4. **`CORRECT_FIELD`**: User modifies a discrepant field (e.g., Gross Weight or Seal Number), recording original values, corrected values, and audit justifications.
5. **`REQUEST_HUMAN_REVIEW`**: User escalates complex discrepancies to customs brokers or port supervisors with urgency ratings and instructions.
6. **`APPROVE_RESULT`**: User issues final verification approval and cargo clearance.
7. **`GENERATE_REPORT`**: User generates an official Verification & Discrepancy Certificate.

---

## 🇲🇾 Malaysian Shipping & Regulatory Context

All mock documents, consignees, shippers, and logistics entities reflect authentic Malaysian maritime operations:

- **Ports & Terminals**:
  - Port Klang (Northport & Westports) `[MYPKG]`
  - Port of Tanjung Pelepas (PTP), Johor `[MYTPP]`
  - Penang Port (Butterworth Container Terminal / NBCT) `[MYPEN]`
  - Kuantan Port, Pahang `[MYKUA]`
- **Domestic Shipping Carriers**:
  - MISC Berhad (*Bunga Raya Satu*)
  - MTT Shipping Sdn Bhd (*MTT Rajang*)
  - Harbour-Link Group Berhad (*Harbour Neptune*)
- **Malaysian Industrial Shippers & Consignees**:
  - Sime Darby Oils Biodiesel Sdn Bhd (Pasir Gudang, Johor)
  - Kuala Lumpur Kepong (KLK) Oleo Distribution Sdn Bhd (Kuala Lumpur)
  - Top Glove Corp Bhd (Klang, Selangor)
  - Inari Technology Sdn Bhd (Bayan Lepas FIZ, Penang)
  - Petronas Chemicals Olefins Sdn Bhd (Kertih, Terengganu)
  - Hartalega NGC Sdn Bhd (Bestari Jaya, Selangor)
- **Customs & Regulatory Protocols**:
  - Jabatan Kastam Diraja Malaysia (JKDM) seal numbering conventions (`MY-JKD-xxxxxx`).
  - Dagang Net e-Permit & SMK Customs declaration Form K1 / Form K2 clearance workflows.

---

## 🖥️ Chronological Audit Trail UI Features

- **Live Chronological Stream**: Displays actions in real time with sort toggle (**Newest First** / **Oldest First**).
- **Multi-Factor Filtering**: Filter logs by **Action Type** or specific **Email ID**.
- **Full-Text Search**: Instantly searches across action descriptions, labels, and JSON metadata.
- **Detailed Payload Inspector**: Expandable JSON key-value inspector for each action event.
- **Export as JSON**: One-click download of the complete in-memory session audit trail.
- **Clear Log**: Reset the in-memory array on demand to simulate a fresh session.
- **Quick Test Action**: Trigger instant test events to demonstrate real-time recording.

---

## 📂 Project Structure

```text
├── src/
│   ├── audit/
│   │   └── auditTrailStore.ts        # In-memory array store, subscriber system, and recordUserAction()
│   ├── components/
│   │   ├── AuditTrailPanel.tsx       # Chronological audit log UI with filters and search
│   │   ├── ShippingVerificationView.tsx # Main verification workflow and discrepancy matrix
│   │   ├── DocumentAttachmentModal.tsx  # SI and Draft BL document viewer
│   │   ├── FieldCorrectionModal.tsx   # Field correction modal with reason capture
│   │   ├── HumanReviewModal.tsx      # Escalation to JKDM / customs teams
│   │   └── ReportModal.tsx           # Verification audit certificate preview
│   ├── data/
│   │   └── mockShippingData.ts       # Malaysian shipping emails, SI, and BL mock documents
│   ├── types.ts                      # TypeScript definitions for actions, emails, and fields
│   ├── App.tsx                       # Main application layout and state management
│   ├── main.tsx                      # Entry point
│   └── index.css                     # Tailwind CSS configuration
├── index.html                        # HTML entry point
├── metadata.json                     # Application metadata
├── package.json                      # Project dependencies and scripts
├── tsconfig.json                     # TypeScript configuration
└── vite.config.ts                    # Vite configuration
```

---

## 🚀 Running the Project

### Prerequisites
- Node.js 18+ or later
- npm or bun

### Commands

```bash
# Install dependencies
npm install

# Start development server on port 3000
npm run dev

# Run TypeScript typecheck / linter
npm run lint

# Build for production
npm run build
```
