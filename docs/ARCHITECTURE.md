# CivicResolve AI — Version 2 Architecture

## Objective

Version 2 improves the stable MVP without changing the protected `main` branch. Development happens in `enhancement-v2` and is merged only after the enhanced version is tested.

## Current architecture

The project remains dependency-free during the first enhancement stage:

- `index.html` provides the application entry point.
- `assets/css/styles.css` contains the shared design system and responsive styles.
- `assets/js/app.js` contains the current complaint workflow and user interface logic.
- Browser LocalStorage remains the active data layer until Firebase migration begins.

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

### Stage 2

Firebase Authentication, Firestore and Storage will replace the temporary browser-only data layer.

### Stage 3

Firestore security rules and role-based access will restrict data according to citizen, officer and administrator roles.

## Development principles

1. Keep `main` deployable and stable.
2. Make one focused improvement per commit.
3. Preserve existing complaint data during migration.
4. Validate forms and uploaded evidence.
5. Keep AI classification backed by deterministic fallback rules.
6. Test citizen and admin workflows after every major change.
7. Do not merge Version 2 until the complete workflow is stable.
