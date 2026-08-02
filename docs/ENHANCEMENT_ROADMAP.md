# CivicResolve AI — Enhancement Roadmap

## Phase 1 — Safe foundation

- Protect the stable MVP in `main`
- Develop only in `enhancement-v2`
- Organise CSS, JavaScript and documentation into clear folders
- Improve metadata and accessibility foundations
- Verify the existing workflow after restructuring

## Phase 2 — Modern interface

- Redesign the landing/dashboard experience
- Improve navigation, forms, tables, status badges and modals
- Add responsive mobile navigation
- Add loading, empty and error states
- Improve keyboard navigation and accessibility

## Phase 3 — Authentication and roles

- Add Firebase Authentication
- Add citizen registration and login
- Add officer and administrator roles
- Protect role-specific dashboards

## Phase 4 — Cloud database

- Replace LocalStorage with Firestore
- Store users, complaints, departments, officers and status history
- Add real-time complaint updates
- Add migration support for demo data

## Phase 5 — Evidence and location

- Upload complaint and resolution evidence
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
- Protect API credentials through server-side functions or environment configuration

## Phase 8 — Reporting and release

- Add advanced analytics and date filters
- Export CSV and printable reports
- Test citizen, officer and administrator journeys
- Deploy the Version 2 preview
- Merge into `main` only after acceptance testing

## Immediate next task

After the safe restructuring commit, the next implementation task is the Version 2 visual redesign while preserving the working LocalStorage complaint logic.
