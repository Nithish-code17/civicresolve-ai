# CivicResolve AI

CivicResolve AI is a complete, responsive public grievance redressal portal. Citizens can submit and track complaints, while administrators can prioritise, assign, update and analyse civic issues.

## Main features

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
- Mobile-responsive design

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Browser LocalStorage

The application has no package dependencies, so it can be opened and demonstrated immediately.

## Run the project

### Easiest method

1. Extract the ZIP file.
2. Open the project folder in VS Code.
3. Install the **Live Server** extension.
4. Right-click `index.html`.
5. Select **Open with Live Server**.

You can also open `index.html` directly in a browser.

## Demo grievance ID

```text
GRV-2026-001
```

## Deploy to Vercel

1. Push this folder to a GitHub repository.
2. Import the repository into Vercel.
3. Choose **Other** as the framework preset if necessary.
4. Leave the build command empty.
5. Set the output directory to `.` or leave it empty for a static deployment.
6. Deploy.

## Project flow

```text
Citizen submits complaint
        ↓
Smart classification and priority detection
        ↓
Unique grievance ID generated
        ↓
Admin manages complaint
        ↓
Citizen tracks updated status
        ↓
Complaint resolved and rated
```

## Future enhancements

- Firebase authentication and Firestore
- Image uploads
- SMS and email alerts
- Map-based complaint location
- Gemini-powered text classification and summarisation
- Department officer accounts
