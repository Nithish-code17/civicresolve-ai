# CivicResolve AI — Version 2 Architecture

## Objective

Version 2 improves the stable MVP without changing the protected `main` branch. Development happens in `enhancement-v2` and is merged only after the enhanced version is tested.

## Current architecture

The project remains build-free and uses browser-native JavaScript modules for Firebase:

- `index.html` provides the application entry point.
- `assets/css/styles.css` contains the shared design system and responsive styles.
- `assets/js/auth.js` owns Firebase sessions, user profiles and role permissions.
- `assets/js/firestore-data.js` owns role-scoped complaint queries, writes, migration and real-time listeners.
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
- Citizen creation fixes ownership, initial status and timestamps.
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

### Stage 6 — no-billing evidence implementation complete; provider activation pending

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

The Firebase project remains on Spark. Activating this stage requires a free Cloudinary account and three server-only Vercel environment values, but no billing plan or credit card.

## Development principles

1. Keep `main` deployable and stable.
2. Make one focused improvement per commit.
3. Preserve existing complaint data during migration.
4. Validate forms and uploaded evidence.
5. Keep AI classification backed by deterministic fallback rules.
6. Test citizen and admin workflows after every major change.
7. Do not merge Version 2 until the complete workflow is stable.
