const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const firestore = fs.readFileSync(path.join(root, "firestore.rules"), "utf8");
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, "firebase.json"), "utf8"));
const evidenceServer = fs.readFileSync(path.join(root, "server/evidence-provider.js"), "utf8");
const aiServer = fs.readFileSync(path.join(root, "server/ai-classifier.js"), "utf8");
const slaServer = fs.readFileSync(path.join(root, "server/sla-monitor.js"), "utf8");
const vercelConfig = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");

function balanced(source, open, close) {
  return [...source].reduce((depth, character) => depth + (character === open ? 1 : character === close ? -1 : 0), 0) === 0;
}

assert.equal(balanced(firestore, "{", "}"), true, "Firestore rule braces must be balanced.");
assert.equal(firebaseConfig.firestore.rules, "firestore.rules");
assert.equal("storage" in firebaseConfig, false, "Firebase Storage must not be configured on the Spark project.");

assert.match(firestore, /citizenEvidenceAppendIsValid/);
assert.match(firestore, /hasOnly\(\['evidence', 'updatedAt'\]\)/);
assert.match(firestore, /request\.resource\.data\.evidence\.size\(\) == 0/);
assert.match(firestore, /items\.size\(\) <= 3/);
assert.match(firestore, /item\.size <= 5 \* 1024 \* 1024/);
assert.match(firestore, /item\.provider == 'cloudinary'/);
assert.match(firestore, /item\.deliveryType == 'authenticated'/);
assert.match(firestore, /civicresolve\/complaint-evidence/);
assert.match(firestore, /item\.resourceType in \['image', 'raw'\]/);
assert.match(firestore, /item\.format in \['jpg', 'jpeg', 'png', 'webp', 'pdf'\]/);
assert.match(firestore, /classificationIsValid/);
assert.match(firestore, /item\.source in \['gemini', 'rules'\]/);
assert.match(firestore, /item\.confidence >= 0/);
assert.match(firestore, /item\.confidence <= 100/);
assert.match(firestore, /'General Civic Issue'/);
assert.match(firestore, /newSlaIsValid/);
assert.match(firestore, /civicresolve-sla-v1/);
assert.match(firestore, /item\.deadlineAt >= request\.time/);
assert.match(firestore, /'sla' in request\.resource\.data/);

assert.match(evidenceServer, /Authorization: `Bearer \$\{token\}`/);
assert.match(evidenceServer, /type: "authenticated"/);
assert.match(evidenceServer, /private_download_url/);
assert.match(evidenceServer, /MAX_FILE_SIZE = 5 \* 1024 \* 1024/);
assert.match(evidenceServer, /hasExpectedSignature/);
assert.match(evidenceServer, /readFirestoreDocument/);
assert.match(aiServer, /x-goog-api-key/);
assert.match(aiServer, /store: false/);
assert.match(aiServer, /Api-Revision/);
assert.match(aiServer, /authorizeCitizen/);
assert.match(aiServer, /safetyOverride/);
assert.match(slaServer, /timingSafeEqual/);
assert.match(slaServer, /FIREBASE_ADMIN_PRIVATE_KEY/);
assert.match(slaServer, /https:\/\/www\.googleapis\.com\/auth\/datastore/);
assert.match(slaServer, /MAX_COMPLAINTS_PER_RUN = 500/);
assert.equal(vercelConfig.crons[0].path, "/api/cron/sla-monitor");
assert.equal(vercelConfig.crons[0].schedule, "30 2 * * *");
assert.doesNotMatch(aiServer, /citizenName|createdByEmail|phone:/);
assert.match(gitignore, /^\.env\.\*$/m);

console.log("Security rule and evidence API contract tests passed.");
