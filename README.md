# CivicResolve AI — Version 2

CivicResolve AI is an intelligent public grievance redressal portal. Citizens can report and track civic issues, while administrators can classify, prioritise, assign, update and analyse complaints from a single dashboard.

## Branches

- `main` — protected stable MVP
- `enhancement-v2` — active Version 2 development

## Current features

- Citizen complaint submission
- Automatic category detection
- Smart priority prediction
- Automatic department assignment
- Unique grievance ID generation
- Duplicate complaint warning
- Complaint tracking timeline
- Admin search and filters
- Status, priority, department and resolution-note updates
- Citizen rating and feedback
- Dashboard and analytics charts
- Cloud Firestore complaint persistence
- Real-time citizen, department-officer and administrator views
- Timestamped complaint status history
- One-time migration of eligible citizen LocalStorage complaints
- Administrator-only real-time user directory
- Secure citizen-to-officer/admin role assignment with department scoping
- Immediate role refresh for active sessions and append-only role audit records
- Complaint photo/PDF evidence selection, validation and upload progress
- Role-protected evidence viewing for owners, assigned officers and administrators
- Evidence metadata stored in Firestore with private Cloudinary asset IDs
- Firebase-authorized Vercel evidence APIs and five-minute signed file access
- Gemini complaint classification with structured category, priority, confidence and reasoning
- Server-validated department routing with deterministic safety and availability fallback rules
- Privacy-minimised AI requests that exclude account details, exact location and evidence
- Priority-aware automatic SLA deadlines with immutable policy snapshots
- Role-scoped due-soon and overdue alerts, filters, badges and analytics
- Protected daily Vercel SLA monitor with minimal Firestore writes
- Responsive mobile and desktop design

## Version 2 interface enhancements

- Professional government-service visual design
- Blue civic administration design system
- Improved sidebar, top bar, cards, tables, forms and modals
- Light and dark themes with saved preference
- Global complaint search using `Ctrl + K`
- Smooth page and dashboard-card transitions
- Improved responsive layouts for desktop, tablet and mobile
- Enhanced contrast, focus states and keyboard navigation
- Non-destructive enhancement layer that preserves the stable complaint logic
- Firebase email/password authentication and Google sign-in
- Password reset and citizen self-registration
- Firestore-backed citizen, department-officer and administrator profiles
- Protected navigation, department-scoped officer access and administrator-only actions
- Connected Firebase project with production-only authentication
- Published least-privilege Firestore rules for citizen, officer and administrator roles

## Project structure

```text
civicresolve-ai/
├── api/
│   ├── evidence-access.js
│   ├── evidence-delete.js
│   ├── evidence-upload.js
│   ├── classify-complaint.js
│   └── cron/
│       └── sla-monitor.js
├── assets/
│   ├── css/
│   │   ├── auth.css
│   │   ├── styles.css
│   │   └── v2.css
│   └── js/
│       ├── app.js
│       ├── ai-classification.js
│       ├── auth.js
│       ├── classification-rules.js
│       ├── evidence-upload.js
│       ├── firebase-config.js
│       ├── firestore-data.js
│       ├── role-accounts.js
│       ├── sla-policy.js
│       └── v2-ui.js
├── docs/
│   ├── ARCHITECTURE.md
│   ├── AI_CLASSIFICATION_SETUP.md
│   ├── EVIDENCE_SETUP.md
│   ├── ENHANCEMENT_ROADMAP.md
│   ├── FIREBASE_SETUP.md
│   └── SLA_SETUP.md
├── server/
│   ├── ai-classifier.js
│   ├── evidence-provider.js
│   └── sla-monitor.js
├── .env.example
├── firebase.json
├── firestore.rules
├── .gitignore
├── index.html
├── package.json
├── README.md
└── vercel.json
```

## Run locally

```bash
npm install
python -m http.server 5500
```

Open `http://localhost:5500` in a browser.

## Demo grievance ID

```text
GRV-2026-001
```

This sample ID is available only when local demo mode is explicitly enabled. Production accounts receive Firestore-backed grievance IDs.

## Deployment

The interface is static HTML, CSS and JavaScript. Node.js Vercel Functions protect evidence operations, Gemini classification and the daily SLA monitor. Vercel installs the `cloudinary` dependency automatically; no frontend build command is required.

## Firebase environment

The `enhancement-v2` branch is connected to Firebase project `civicresolve-ai-3d54c` on the no-cost Spark plan. Email/Password and Google sign-in are enabled, and the default Firestore database uses the Mumbai (`asia-south1`) region. Complaints are stored in role-protected Firestore documents and synchronized with snapshot listeners. Evidence uses Cloudinary's free no-credit-card plan through authenticated Vercel Functions, so Firebase billing is not required. Follow `docs/EVIDENCE_SETUP.md` to add the three server-only provider values before activating uploads.

## AI environment

Gemini classification uses the server-only `GEMINI_API_KEY` Vercel variable and defaults to `gemini-3.5-flash-lite`. The application never sends account details, exact location or evidence to Gemini, and complaint submission automatically falls back to deterministic routing rules. Follow `docs/AI_CLASSIFICATION_SETUP.md` to activate the provider.

## SLA environment

The SLA policy creates a deadline when a complaint is submitted. The browser continuously derives On track, Due soon, Overdue or Resolved state, while a protected Vercel Cron Job persists state transitions every day at 08:00 IST. Follow `docs/SLA_SETUP.md` to configure `CRON_SECRET` and the two server-only Firebase service-account values. This workflow remains compatible with Firebase Spark and Vercel Hobby.

## Next phase

The next major enhancement is map-based complaint location selection and officer assignment.
