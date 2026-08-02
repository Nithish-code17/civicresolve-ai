# Firebase Authentication Setup

CivicResolve AI now supports Firebase email/password authentication, Google sign-in, password reset and Firestore-backed role profiles.

## Current Firebase environment

- Project: **CivicResolve AI**
- Project ID: `civicresolve-ai-3d54c`
- Plan: Spark (no cost)
- Web app: **CivicResolve AI Web**
- Authentication: Email/Password and Google enabled
- Firestore: Standard edition, production mode, Mumbai (`asia-south1`)
- Security rules: Published from `firestore.rules`

The Web App configuration is already stored in `assets/js/firebase-config.js`, and `.firebaserc` points the Firebase CLI to the correct project.

## 1. Recreate or replace the Firebase project

1. Open the Firebase Console and create a project.
2. Add a **Web app** to the project.
3. Copy the Firebase configuration object.
4. Paste its values into `assets/js/firebase-config.js`.

Firebase Web App configuration identifies the project and is not an administrator credential. Never add service-account JSON or private server keys to this repository.

## 2. Enable sign-in providers

In **Firebase Console → Authentication → Sign-in method**:

1. Enable **Email/Password**.
2. Enable **Google** and select a support email.
3. Add the local and deployed hosts under **Authentication → Settings → Authorized domains**.

For local development, use `localhost`. For deployment, add the Vercel production domain.

## 3. Create Firestore

Create a Cloud Firestore database, then deploy the included rules:

```bash
firebase login
firebase use civicresolve-ai-3d54c
firebase deploy --only firestore:rules
```

The rules prevent a newly registered citizen from choosing an officer or administrator role.

## 4. User profile documents

Every authenticated user has a Firestore document at:

```text
users/{firebaseAuthUid}
```

Citizen registration creates this profile automatically:

```json
{
  "uid": "AUTH_USER_UID",
  "email": "citizen@example.com",
  "displayName": "Citizen Name",
  "phone": "9876543210",
  "role": "citizen",
  "department": ""
}
```

## 5. Provision officers and administrators

Officer and administrator roles must not be selected from the browser. Create the user in Firebase Authentication, then create or update the matching `users/{uid}` document using the Firebase Console or a trusted Admin SDK process.

Department officer example:

```json
{
  "uid": "OFFICER_AUTH_UID",
  "email": "roads.officer@example.gov.in",
  "displayName": "Roads Officer",
  "phone": "",
  "role": "department-officer",
  "department": "Public Works Department"
}
```

Administrator example:

```json
{
  "uid": "ADMIN_AUTH_UID",
  "email": "admin@example.gov.in",
  "displayName": "Municipal Administrator",
  "phone": "",
  "role": "administrator",
  "department": "General Administration"
}
```

The `department` value for an officer must exactly match the complaint department value used by the application.

## 6. Role permission matrix

| Capability | Citizen | Department officer | Administrator |
|---|---:|---:|---:|
| View personal dashboard | Yes | — | — |
| Submit complaint | Yes | No | No |
| Track permitted complaint | Own | Assigned department | All |
| Add status and progress note | No | Assigned department | All |
| Change priority | No | No | Yes |
| Reassign department | No | No | Yes |
| View analytics | No | Assigned department | All |
| Delete complaint | No | No | Yes |

## Demo mode

The source retains a session-only demo fallback for isolated development, but production demo access is disabled in `assets/js/firebase-config.js`. All normal sign-in sessions use Firebase Authentication.

To temporarily test without Firebase, remove the configuration values and explicitly set `allowDemoMode` to `true`. Never deploy with demo mode enabled.
