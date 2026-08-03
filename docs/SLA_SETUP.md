# Automatic SLA deadlines and overdue alerts

CivicResolve applies a versioned SLA policy when a citizen submits a complaint. The UI calculates deadline state continuously, and a protected Vercel Cron Job persists due-soon, overdue and resolved transitions once per day.

## Policy

| Complaint category | Base window | High | Medium | Low |
|---|---:|---:|---:|---:|
| Roads & Potholes | 5 days | 3 days | 5 days | 7 days |
| Waste Management | 2 days | 1 day | 2 days | 4 days |
| Water Supply | 2 days | 1 day | 2 days | 4 days |
| Electricity & Streetlights | 2 days | 1 day | 2 days | 4 days |
| Drainage & Sewage | 3 days | 2 days | 3 days | 5 days |
| Public Transport | 4 days | 2 days | 4 days | 6 days |
| Parks & Public Spaces | 4 days | 2 days | 4 days | 6 days |
| General Civic Issue | 5 days | 3 days | 5 days | 7 days |

These are calendar-day MVP targets. The policy is stored as `civicresolve-sla-v1`, allowing future holiday or working-day policies without silently changing older complaints.

## Alert states

- **On track:** more than 24 hours remain.
- **Due soon:** the deadline is within 24 hours.
- **Overdue:** the unresolved complaint has passed its deadline.
- **Resolved:** the complaint is complete and no longer produces alerts.

Citizens see only their alerts. Officers see only alerts for their assigned department. Administrators see all complaint alerts.

## Vercel schedule

`vercel.json` invokes `GET /api/cron/sla-monitor` at `30 2 * * *`, which is 02:30 UTC or 08:00 IST. This once-daily schedule is compatible with Vercel Hobby.

The endpoint:

1. Verifies `Authorization: Bearer <CRON_SECRET>`.
2. Exchanges a signed service-account assertion for a short-lived Google access token.
3. Reads at most 500 complaints.
4. Calculates the current SLA state using the same shared policy as the browser.
5. Commits only new policy snapshots or state transitions.
6. Records due-soon and overdue alert timestamps only once.

## Required Vercel variables

Add these to **Production** and **Preview** in Vercel Project Settings. Mark every secret as sensitive.

```text
CRON_SECRET=<a new random value of at least 32 characters>
FIREBASE_ADMIN_CLIENT_EMAIL=<service-account client_email>
FIREBASE_ADMIN_PRIVATE_KEY=<service-account private_key>
FIREBASE_PROJECT_ID=civicresolve-ai-3d54c
```

`FIREBASE_PROJECT_ID` already exists for evidence and AI authorization.

### Obtain the Firebase values

1. Open Firebase Console → Project settings → Service accounts.
2. Select **Generate new private key** and confirm.
3. Keep the downloaded JSON file private.
4. Copy only `client_email` into `FIREBASE_ADMIN_CLIENT_EMAIL`.
5. Copy only `private_key` into `FIREBASE_ADMIN_PRIVATE_KEY`.
6. Delete the downloaded local JSON after Vercel is configured and verified.

Never upload the JSON to GitHub, place it in browser JavaScript, or paste it into chat. Service-account keys are privileged credentials.

## Firestore fields

Each new complaint receives an `sla` map containing:

- `policyVersion`
- `baseDays`
- `targetDays`
- `deadlineAt`
- `deadlineDate`
- `state`
- `lastEvaluatedAt`
- `dueSoonAlertedAt`
- `overdueAlertedAt`

Older complaints without the map remain compatible. The monitor backfills them using the existing `expectedResolutionDate` rather than replacing their original promise.

## Acceptance test

1. Publish the updated Firestore rules.
2. Add the Vercel variables and redeploy.
3. Submit a High-priority electricity complaint and confirm a one-day SLA.
4. Open Track Complaint and confirm the SLA deadline and state badge.
5. Sign in as an officer and verify the SLA column and filter.
6. Open the notification bell and confirm only role-authorized alerts appear.
7. Trigger the production cron from Vercel and confirm a `200` response with `scanned`, `updated` and `states` counts.
8. Confirm a resolved complaint no longer appears in the alert list.
