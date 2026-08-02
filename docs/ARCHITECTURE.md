# CivicResolve AI — Version 2 Architecture

## Objective

Version 2 improves the stable MVP without changing the protected `main` branch. Development happens in `enhancement-v2` and is merged only after the enhanced version is tested.

## Current architecture

The project remains build-free and uses browser-native JavaScript modules for Firebase:

- `index.html` provides the application entry point.
- `assets/css/styles.css` contains the shared design system and responsive styles.
- `assets/js/auth.js` owns Firebase sessions, user profiles and role permissions.
- `assets/js/app.js` contains the current complaint workflow and role-aware user interface logic.
- `assets/js/firebase-config.js` contains the Firebase Web App project configuration entry point.
- Browser LocalStorage remains the active data layer until Firebase migration begins.
- Firestore stores authenticated user profiles and role assignments once Firebase is configured.
- `firestore.rules` prevents self-promotion and defines complaint access for the next migration phase.

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

### Stage 2 — in progress

Firebase Authentication and Firestore user profiles now replace anonymous access. LocalStorage remains the temporary complaint data layer; Firestore and Storage will replace it during the cloud-data and evidence phases.

### Stage 3 — foundation complete

Interface guards and Firestore security rules restrict access according to citizen, officer and administrator roles. These complaint rules become active when the complaint service migrates to Firestore.

## Development principles

1. Keep `main` deployable and stable.
2. Make one focused improvement per commit.
3. Preserve existing complaint data during migration.
4. Validate forms and uploaded evidence.
5. Keep AI classification backed by deterministic fallback rules.
6. Test citizen and admin workflows after every major change.
7. Do not merge Version 2 until the complete workflow is stable.
