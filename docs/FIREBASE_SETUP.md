# Firebase Authentication Setup

CivicResolve AI now supports Firebase email/password authentication, Google sign-in, password reset, Firestore-backed role profiles and real-time complaint storage.

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

The rules prevent a newly registered citizen from choosing an officer or administrator role. Deploy the latest rules whenever complaint fields or workflow permissions change.

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

## 5. Bootstrap the first administrator

The public registration screen can create only Citizen profiles. Bootstrap exactly one trusted administrator manually in Firebase Console:

1. Sign in to CivicResolve once with the administrator's email or Google account.
2. Open **Firestore Database → Data → users**.
3. Open the document whose ID matches that account's Firebase Authentication UID.
4. Set `role` to `administrator`.
5. Set `department` to `General Administration`.
6. Sign out and sign back in once if the Role Accounts page does not appear immediately.

After this one-time bootstrap, use the in-app **Role Accounts** workspace for all normal role assignments. Do not offer officer or administrator selection on the public registration form.

## 6. Provision officers and additional administrators

Use this workflow instead of creating shared credentials:

1. Ask the person to register using their own email/password or Google account.
2. Sign in with the bootstrapped administrator account.
3. Open **Role Accounts**.
4. Search for the registered name or email.
5. Choose **Change role**.
6. Select **Department Officer** and an exact department, or select **Administrator**.
7. Verify the confirmation and save.

The new permissions take effect in the person's active session through the real-time profile listener. Every assignment also creates an immutable record in `roleAudit/{auditId}`.

The console examples below document the resulting profile shape. Manual changes are reserved for disaster recovery or the initial administrator bootstrap.

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

## 7. Role permission matrix

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
| List user profiles | No | No | Yes |
| Assign officer/admin roles | No | No | Yes, except own account |
| Send password-reset email | No | No | Yes |

## 8. Complaint documents

Every complaint is stored at:

```text
complaints/{grievanceId}
```

Important protected fields include:

- `createdByUid` and `createdByEmail` for immutable ownership
- `department` for officer query scope
- `status`, `priority` and `resolutionNote` for workflow state
- `createdAt` and `updatedAt` server timestamps
- `statusHistory` audit entries containing status, note, actor, role and timestamp
- `rating` and `feedback`, editable only by the owner after resolution

The browser subscribes with Firebase `onSnapshot()` and uses a different query for each role. Citizens query their UID, officers query their exact department and administrators query all complaints. Do not replace these queries with an unrestricted collection download followed by browser filtering because Firestore rules evaluate queries against their possible result set.

## 9. Role audit documents

Every role change creates a server-timestamped document at:

```text
roleAudit/{generatedId}
```

Audit documents record the target UID/email/name, previous role and department, new role and department, and the administrator who made the change. Clients cannot edit or delete these records.

## 10. Local complaint migration

After a citizen signs in for the first time, CivicResolve checks for complaint data created by the older LocalStorage version. Eligible `Submitted` complaints owned by the same UID or email are copied to Firestore once. Demo samples and complaints belonging to another account are not migrated.

LocalStorage remains the active data source only when Firebase configuration is absent and demo mode is explicitly enabled.

## 11. Restrict the Firebase Web API key

The Firebase Web API key identifies the project and is intentionally present in browser source, but it should still be restricted in **Google Cloud Console → APIs & Services → Credentials**:

- Application restriction: **Websites**
- Allowed referrers:
  - `https://civicresolve-ai-beta.vercel.app/*`
  - `https://civicresolve-ai-3d54c.firebaseapp.com/*`
  - `http://localhost:*/*`
- API restriction: limit the key to the Firebase/Google APIs used by this web app.

Never commit a service-account JSON file, private key or Firebase Admin SDK credential.

## Demo mode

The source retains a session-only demo fallback for isolated development, but production demo access is disabled in `assets/js/firebase-config.js`. All normal sign-in sessions use Firebase Authentication.

To temporarily test without Firebase, remove the configuration values and explicitly set `allowDemoMode` to `true`. Never deploy with demo mode enabled.
