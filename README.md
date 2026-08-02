# CivicResolve AI

CivicResolve AI is an intelligent public grievance redressal portal. Citizens can report and track civic issues, while administrators can classify, prioritise, assign, update and analyse complaints from a single dashboard.

## Branches

- `main` — stable MVP backup
- `enhancement-v2` — active development branch for Version 2

## Current MVP features

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
- Browser LocalStorage persistence
- Responsive mobile and desktop design

## Version 2 goals

Version 2 will add a more maintainable project structure, modern user experience, cloud data storage, authentication, role-based dashboards, evidence uploads, location mapping, status history, SLA monitoring and stronger AI assistance.

## Project structure

```text
civicresolve-ai/
├── assets/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── app.js
├── docs/
│   ├── ARCHITECTURE.md
│   └── ENHANCEMENT_ROADMAP.md
├── .gitignore
├── index.html
├── README.md
└── vercel.json
```

## Run locally

From the project directory, start a local server:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500` in a browser.

## Demo grievance ID

```text
GRV-2026-001
```

## Deployment

The project is a static HTML, CSS and JavaScript application and can be deployed directly to Vercel. No build command is required.

## Documentation

- Read `docs/ARCHITECTURE.md` for the Version 2 structure and design principles.
- Read `docs/ENHANCEMENT_ROADMAP.md` for the planned development phases.
