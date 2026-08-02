# No-Billing Evidence Setup

CivicResolve AI keeps Firebase on the Spark plan and stores complaint evidence on Cloudinary's free plan. Cloudinary's published Free plan is free forever, provides 25 monthly credits and does not require a credit card.

## 1. Create the free provider account

1. Open `https://cloudinary.com/users/register_free`.
2. Register with Google, GitHub or email.
3. Stay on the **Free** plan. Do not add a payment method.
4. Open the Cloudinary Console and copy:
   - Cloud name
   - API key
   - API secret

The API secret is sensitive. Never paste it into `assets/js`, Firestore, Firebase configuration, a screenshot, or a Git commit.

## 2. Add Vercel environment variables

Open **Vercel → civicresolve-ai → Settings → Environment Variables** and add:

| Name | Value | Scope |
|---|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | Production, Preview, Development |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Production, Preview, Development |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Production, Preview, Development; mark Sensitive |
| `FIREBASE_PROJECT_ID` | `civicresolve-ai-3d54c` | Production, Preview, Development |

Redeploy the latest `main` deployment after saving the values. Vercel injects them only into the server functions.

For local Vercel testing, copy `.env.example` to `.env.local`, fill the local values and run `vercel dev`. `.env.local` is ignored by Git.

## 3. Publish the Firestore metadata rules

Deploy only Firestore rules; Firebase Storage is intentionally absent:

```bash
firebase use civicresolve-ai-3d54c
firebase deploy --only firestore:rules
```

## Security flow

1. The browser validates the selection and obtains the current Firebase ID token.
2. `/api/evidence-upload` reads the complaint through the Firestore REST API with that token, so the published citizen/officer/admin rules remain authoritative.
3. The function verifies the real byte length and JPEG, PNG, WebP or PDF signature before uploading.
4. Cloudinary stores the file as an `authenticated` asset. No permanent delivery URL is saved.
5. `/api/evidence-access` repeats Firestore authorization and returns a signed URL that expires after five minutes.
6. `/api/evidence-delete` permits owner cleanup during the evidence window or administrator deletion.

## Limits

- Maximum 3 evidence files per complaint
- Maximum 5 MB per file
- JPEG, PNG, WebP and PDF only
- Cloudinary Free plan: 25 monthly credits shared across storage, transformations and bandwidth
- No billing method means usage cannot create automatic provider charges; uploads may stop if the free allowance is exhausted

## Production test

1. Sign in as a Citizen and submit an Electricity Department complaint with one image and one PDF.
2. Confirm both files appear in **Track Complaint**.
3. Sign in as the assigned Electricity Department officer and open both files.
4. Sign in as an unrelated department officer and confirm the complaint is not visible.
5. Sign in as Administrator, open the files and delete the test complaint.
6. Confirm the complaint disappears for the Citizen and the provider assets are removed.
