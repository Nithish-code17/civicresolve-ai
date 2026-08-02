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
- Browser LocalStorage persistence
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

## Project structure

```text
civicresolve-ai/
├── assets/
│   ├── css/
│   │   ├── styles.css
│   │   └── v2.css
│   └── js/
│       ├── app.js
│       └── v2-ui.js
├── docs/
│   ├── ARCHITECTURE.md
│   └── ENHANCEMENT_ROADMAP.md
├── .gitignore
├── index.html
├── README.md
└── vercel.json
```

## Run locally

```bash
python -m http.server 5500
```

Open `http://localhost:5500` in a browser.

## Demo grievance ID

```text
GRV-2026-001
```

## Deployment

The project is a static HTML, CSS and JavaScript application and can be deployed directly to Vercel. No build command is required.

## Next phase

The next major enhancement is Firebase Authentication with citizen, department-officer and administrator roles.
