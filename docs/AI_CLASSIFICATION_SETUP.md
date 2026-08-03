# AI complaint classification setup

CivicResolve uses Gemini only through the authenticated `POST /api/classify-complaint` Vercel Function. The API key must never be added to browser JavaScript, Firebase configuration, GitHub, or a public URL.

## Architecture

1. The browser immediately shows an explainable keyword-rule preview.
2. After the citizen pauses typing, the browser sends the title, description, and location to the same-origin Vercel Function with a Firebase ID token.
3. The Function verifies the citizen profile through Firestore.
4. Only the title and description are sent to Gemini. Citizen name, email, phone, exact location, evidence, and Firebase UID are excluded.
5. Gemini returns a category, priority, confidence, summary, reasoning, safety advice, and review flag through a strict JSON schema.
6. The server maps the approved category to the official department and service deadline.
7. Deterministic safety keywords may raise the priority to High but the model cannot lower that safeguard.
8. If Gemini is unavailable, slow, rate-limited, or not configured, the existing keyword rules complete the complaint without blocking submission.

Gemini interaction storage is disabled with `store: false`. Review Google's current Gemini API data-use terms before using the free tier with real public data; citizens should avoid placing unnecessary personal information in complaint text.

## Create the free API key

1. Open Google AI Studio.
2. Sign in and open **API keys**.
3. Create a new Gemini authorization key for this project.
4. Do not paste the key into chat, a source file, or GitHub.

The default model is `gemini-3.5-flash-lite`, selected for fast, low-cost structured classification. Free-tier availability and quotas are controlled by Google and can change.

## Add the Vercel variables

Open the CivicResolve Vercel project, then add these values under **Settings → Environment Variables**:

```text
GEMINI_API_KEY=<your server-only Gemini key>
GEMINI_MODEL=gemini-3.5-flash-lite
FIREBASE_PROJECT_ID=civicresolve-ai-3d54c
```

Add them to Production and Preview. `FIREBASE_PROJECT_ID` is already used by the evidence API and normally needs no change.

Redeploy after saving the values. Do not expose `GEMINI_API_KEY` with a `VITE_`, `NEXT_PUBLIC_`, or other public prefix.

## Acceptance test

1. Sign in as a citizen.
2. Open **Submit Complaint**.
3. Enter a title, description, and location.
4. Pause typing and confirm the analysis badge changes from **Instant rules preview** to **Gemini AI**.
5. Submit the complaint.
6. Confirm the success page records **Gemini AI** and its confidence.
7. Test a safety complaint such as an exposed electrical wire and confirm High priority.
8. Temporarily remove the Preview key and confirm complaint submission still succeeds with **Smart rules fallback**.

## Server safeguards

- Firebase-authenticated citizen access only
- Twelve AI requests per user per two-minute in-memory window
- Strict input lengths and request-size limit
- Strict category and priority enums
- Server-derived department and deadline
- Eight-second provider timeout
- No-store responses and Gemini interactions
- Deterministic safety-priority override
- No secret or permanent provider credential in Firestore
