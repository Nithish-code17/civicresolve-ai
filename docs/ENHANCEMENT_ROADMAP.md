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

## Next: Phase 3 — Authentication and roles

- Configure Firebase
- Add email and password registration
- Add Google sign-in
- Add password reset
- Add citizen, department-officer and administrator roles
- Protect role-specific dashboards
- Prevent normal users from opening administrative management features

## Phase 4 — Cloud database

- Replace LocalStorage with Firestore
- Store users, complaints, departments, officers and status history
- Add real-time complaint updates
- Add migration support for demo data

## Phase 5 — Evidence and location

- Upload complaint and resolution evidence to Firebase Storage
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
