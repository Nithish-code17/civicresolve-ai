# CivicResolve AI — Version 2 Architecture

## Objective

Version 2 improves the stable MVP without changing the protected `main` branch. Development happens in `enhancement-v2` and is merged only after the enhanced version is tested.

## Current architecture

The project remains build-free and uses browser-native JavaScript modules for Firebase:

- `index.html` provides the application entry point.
- `assets/css/styles.css` contains the shared design system and responsive styles.
- `assets/js/auth.js` owns Firebase sessions, user profiles and role permissions.
- `assets/js/firestore-data.js` owns role-scoped complaint queries, writes, migration and real-time listeners.
- `assets/js/maps.js` owns map selection, user-triggered geocoding, role-scoped operational markers and nearby-pin grouping.
- `server/complaint-creator.js` verifies citizen access, validates routing and creates complaints with server-stamped SLA records.
- `api/create-complaint.js` exposes secure complaint creation as a same-origin Vercel Function.
- `assets/js/evidence-upload.js` validates citizen files and calls the same-origin evidence APIs for upload, progress, secure opening and cleanup.
- `server/evidence-provider.js` verifies Firebase access, file signatures and limits before managing authenticated Cloudinary assets.
- `api/evidence-*.js` expose the upload, time-limited access and deletion operations as Vercel Functions.
- `assets/js/role-accounts.js` owns administrator-only user listing, role changes, department assignment, password-reset handoff and role audit writes.
- `assets/js/app.js` contains the current complaint workflow and role-aware user interface logic.
- `assets/js/firebase-config.js` contains the Firebase Web App project configuration entry point.
- Firestore stores authenticated user profiles, role assignments, complaints and status history.
- LocalStorage is used only for explicit demo mode and one-time migration of eligible citizen-owned complaints.
- `firestore.rules` prevents self-promotion, enforces complaint ownership and limits officer/admin mutations by role.
- Cloudinary credentials remain server-only in Vercel Environment Variables; Firestore rules protect evidence metadata.
- Signed-in clients watch their own profile document so verified role changes take effect without signing out or refreshing.

This first restructuring commit changes file organisation only. It does not intentionally change complaint behaviour or stored data.

## Planned architecture

The JavaScript will be separated gradually into focused modules:

```text
assets/js/
├── app.js
├── config/
│   └── app-config.js
├── data/
│   └── sample-complaints.js
├── services/
│   ├── auth-service.js
│   ├── complaint-service.js
│   ├── notification-service.js
│   └── storage-service.js
├── ui/
│   ├── components.js
│   ├── layouts.js
│   └── pages.js
└── utils/
    ├── validators.js
    └── helpers.js
```

## Version 2 user roles

### Citizen

- Register and sign in
- Submit complaints with evidence and location
- View personal complaints
- Track status history
- Provide feedback or reopen an issue

### Department officer

- View assigned complaints
- Add progress notes
- Update complaint status
- Upload resolution evidence
- Complete assigned work

### Administrator

- View all complaints
- Assign departments and officers
- Manage priority and SLA
- Monitor overdue complaints
- Review analytics and performance

## Data strategy

### Stage 1

Browser LocalStorage is retained to protect the working MVP while the UI and code structure are improved.

### Stage 2 — complete

Firebase Authentication and Firestore user profiles replace anonymous access. Citizens, department officers and administrators receive role-specific application routes.

### Stage 3 — complete

Interface guards and Firestore security rules restrict access according to citizen, officer and administrator roles.

### Stage 4 — complete

The complaint service stores complaints in Firestore and uses real-time role-scoped listeners:

- Citizens query only documents matching their Firebase UID.
- Officers query only documents matching their assigned department.
- Administrators query the complete complaint collection.
- Citizen creation uses an authenticated Vercel Function that fixes ownership, routing, initial status and server timestamps.
- Official updates append immutable audit-history entries.
- Citizen feedback is permitted only on owned resolved complaints.
- Eligible LocalStorage citizen complaints can migrate once after sign-in.

### Stage 5 — complete

Role accounts are provisioned through a least-privilege workflow:

- Every person first creates a normal Firebase account and receives the Citizen role.
- Administrators can list user profiles but citizens and officers cannot enumerate users.
- Administrators can promote verified profiles to Department Officer or Administrator.
- Officer access requires one exact department assignment.
- Administrators cannot change their own role from the browser.
- Every role change writes an immutable `roleAudit` record containing the target, previous access, new access, actor and server timestamp.
- The affected user's active session observes the profile change and immediately reloads the correct complaint scope.

### Stage 6 — complete

Complaint evidence uses a three-service transaction:

- The citizen first creates a Firestore complaint with an empty `evidence` list.
- The browser sends up to three JPG, PNG, WebP or PDF files to a same-origin Vercel Function with the Firebase ID token.
- The function reuses Firestore rules to confirm complaint access, verifies the real file bytes and signature, and enforces the 5 MB limit.
- Valid files are uploaded to Cloudinary as `authenticated` assets; the API secret never reaches the browser.
- The complaint document stores only validated provider metadata and no permanent delivery URL.
- Citizens can append evidence only while the complaint is `Submitted` or `Under Review`.
- Owners, assigned department officers and administrators can request a five-minute signed access URL.
- Administrators delete Cloudinary assets before deleting the complaint document.
- Failed multi-file uploads clean up already completed objects where possible.

The Firebase project remains on Spark. Cloudinary credentials are stored only as encrypted Vercel environment values, and the production citizen-to-officer evidence flow is verified.

### Stage 7 — complete

Complaint intelligence uses a secure hybrid pipeline:

- Shared deterministic rules provide an immediate category, department, priority and deadline preview.
- Valid complaint fields trigger a debounced request to a same-origin Vercel Function.
- The Function verifies the Firebase ID token by reading the caller's citizen profile through Firestore.
- Only complaint title and description are sent to Gemini; account data, exact location and evidence are excluded.
- Gemini structured output is restricted to approved categories and priorities.
- The server maps categories to official departments and deadlines, so the model cannot invent routing targets.
- Deterministic safety signals can raise the AI priority to High but cannot be overridden downward.
- Gemini interaction storage is disabled and browser responses use `no-store`.
- Timeouts, free-tier limits, provider failures and missing configuration fall back to the rules without blocking complaint submission.
- Firestore records the classification source, model, confidence, explanation and review flags for auditability.

The Gemini authorization key is stored as the server-only `GEMINI_API_KEY` Vercel variable. No key is committed or sent to the browser.

### Stage 8 — complete

Complaint accountability uses a shared, versioned SLA policy:

- Each category defines a base service window.
- High priority uses half the base window, rounded up; Medium uses the base window; Low adds two days.
- New complaints are created by an authenticated Vercel Function that snapshots the policy version, base days, target days and exact deadline from server time.
- The Function verifies the Firebase citizen profile, controls the category-to-department mapping and writes through the server-only Firebase service account.
- Firestore rules continue to validate citizen, officer and administrator reads and later mutations; complaint creation no longer depends on a citizen device clock.
- Official status updates cannot alter the original SLA snapshot.
- The interface derives On track, Due soon, Overdue and Resolved state in real time.
- Dashboards, management tables, tracking pages, analytics and the notification bell show only alerts permitted for the current role.
- A protected Vercel Cron Job runs daily at 02:30 UTC (08:00 IST), scans at most 500 complaints and writes only state transitions.
- Due-soon and overdue alert timestamps are persisted once, and resolved complaints stop generating alerts.
- The scheduler authenticates with `CRON_SECRET` and a server-only Firebase service account; no privileged credential reaches browser code.

The three values documented in `SLA_SETUP.md` are active. Firebase remains on Spark and Vercel uses its once-daily Hobby schedule.

### Stage 9 — complete

Complaint location intelligence adds a backward-compatible structured map record:

- Citizens can explicitly search an Indian address, request device location or click the map to select a public issue point.
- New map reports submit latitude, longitude, the selected address, detected area/ward, source and optional device accuracy.
- The secure creation Function validates coordinate bounds, normalises the record and keeps the mapped address consistent with the human-readable location.
- Firestore permits the optional `locationData` map for legacy compatibility, requires it on direct citizen creates and validates every nested field.
- Officers and administrators see only role-authorised complaints on the operational map.
- The map and complaint table share search, status, priority, SLA, category and department filters.
- Nearby coordinates are grouped into a single marker to expose small civic-problem hotspots without bulk-geocoding older records.
- Legacy complaints remain readable and editable; the interface reports how many lack coordinates rather than sending them to an external geocoder.
- Leaflet 1.9.4 is vendored in the repository. OpenStreetMap tiles include visible attribution, and address lookup is explicit rather than autocomplete.

## Development principles

1. Keep `main` deployable and stable.
2. Make one focused improvement per commit.
3. Preserve existing complaint data during migration.
4. Validate forms and uploaded evidence.
5. Keep AI classification backed by deterministic fallback rules.
6. Test citizen and admin workflows after every major change.
7. Do not merge Version 2 until the complete workflow is stable.
