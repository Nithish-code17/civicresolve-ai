# CivicResolve AI — Enhancement Roadmap

## Completed

### Phase 1 — Safe foundation

- Protected the stable MVP in `main`
- Created and used the `enhancement-v2` branch
- Organised CSS, JavaScript and documentation into dedicated folders
- Improved metadata and accessibility foundations
- Preserved the working LocalStorage complaint workflow

### Phase 2 — Modern interface

- Redesigned the dashboard, sidebar, top bar and hero section
- Improved statistic cards, charts, forms, tables and modals
- Added a professional civic-administration colour system
- Added light and dark themes with saved preference
- Added global complaint search with `Ctrl + K`
- Added responsive desktop, tablet and mobile layouts
- Added page and dashboard-card transitions
- Improved focus states and keyboard accessibility
- Added the enhancement as separate `v2.css` and `v2-ui.js` layers to reduce regression risk

### Phase 3 — Authentication and roles

- Added Firebase configuration entry point and setup guide
- Added email and password registration
- Added Google sign-in
- Added password reset
- Added citizen, department-officer and administrator role profiles
- Protected role-specific dashboards and navigation
- Restricted officers to assigned departments
- Restricted priority, reassignment, reset and delete actions to administrators
- Added Firestore security rules for user profiles and the planned complaint collection
- Added a session-only demo-role fallback for hackathon testing before Firebase keys are supplied
- Connected the `civicresolve-ai-3d54c` Firebase project and disabled production demo access
- Enabled Email/Password and Google sign-in
- Created the production Firestore database in Mumbai (`asia-south1`)
- Published the least-privilege role-based Firestore rules

### Phase 4 — Cloud database

- Replaced production LocalStorage complaint persistence with Firestore
- Added role-scoped real-time complaint listeners
- Added citizen complaint creation with server timestamps and immutable ownership
- Added officer/admin workflow updates with timestamped status history
- Added Firestore-backed citizen feedback and administrator deletion
- Added one-time migration support for eligible citizen LocalStorage complaints
- Retained LocalStorage only for explicitly enabled demo mode

## Phase 5 — Evidence and location

- Upload complaint evidence to authenticated Cloudinary assets through Firebase-authorized Vercel Functions
- Validate image and document files
- Add map-based location selection
- Store address, latitude and longitude
- Display complaint markers for administrators

## Phase 6 — Workflow intelligence

- Add complete status history
- Add SLA deadlines and overdue alerts
- Add officer assignment
- Add duplicate complaint detection using location and similarity
- Add in-app notifications

## Phase 7 — AI assistance

- Integrate Gemini for classification, priority and summarisation
- Generate suggested officer responses
- Retain keyword-based fallback logic
- Protect API credentials using server-side functions and environment variables

## Phase 8 — Reporting and release

- Add advanced analytics and date filters
- Export CSV and printable reports
- Test citizen, officer and administrator journeys
- Deploy the Version 2 preview
- Merge into `main` only after acceptance testing
