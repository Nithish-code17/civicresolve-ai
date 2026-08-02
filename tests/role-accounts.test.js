const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../assets/js/role-accounts.js"), "utf8");

function createHarness(profile, accounts) {
  const writes = { subscriptions: [], updates: [], audits: [], commits: 0, resets: [] };
  const timestamp = { serverTimestamp: true };
  const sdk = {
    collection: (_db, name) => ({ type: "collection", name }),
    doc: (...args) => args.length === 1
      ? { type: "document", collection: args[0].name, id: "audit-generated-id" }
      : { type: "document", collection: args[1], id: args[2] },
    onSnapshot: (reference, onData) => {
      writes.subscriptions.push(reference);
      queueMicrotask(() => onData({
        docs: accounts.map(account => ({ id: account.uid, data: () => account }))
      }));
      return () => {};
    },
    getDoc: async reference => {
      const account = accounts.find(item => item.uid === reference.id);
      return { exists: () => Boolean(account), data: () => account };
    },
    serverTimestamp: () => timestamp,
    writeBatch: () => ({
      update: (reference, data) => writes.updates.push({ reference, data }),
      set: (reference, data) => writes.audits.push({ reference, data }),
      commit: async () => { writes.commits += 1; }
    }),
    sendPasswordResetEmail: async (auth, email) => writes.resets.push({ auth, email })
  };
  const window = {
    CivicAuth: {
      getProfile: () => profile,
      getFirebaseServices: () => ({ auth: { name: "auth" }, db: { name: "db" }, sdk }),
      isDemoMode: () => false
    }
  };
  vm.runInContext(source, vm.createContext({
    window,
    console,
    Date,
    Promise,
    Object,
    String,
    Array,
    queueMicrotask
  }), { filename: "role-accounts.js" });
  return { service: window.CivicRoleAccounts, writes };
}

const administrator = {
  uid: "admin-1",
  email: "admin@example.gov.in",
  displayName: "Municipal Admin",
  phone: "",
  role: "administrator",
  department: "General Administration"
};

const citizen = {
  uid: "citizen-1",
  email: "citizen@example.com",
  displayName: "Citizen One",
  phone: "9876543210",
  role: "citizen",
  department: "",
  createdAt: "2026-08-02T08:00:00.000Z",
  updatedAt: "2026-08-02T08:00:00.000Z"
};

async function run() {
  const harness = createHarness(administrator, [citizen, administrator]);
  let received = null;
  harness.service.subscribe(accounts => { received = accounts; });
  await Promise.resolve();
  assert.equal(harness.writes.subscriptions[0].name, "users");
  assert.equal(received[0].role, "administrator");
  assert.equal(received[1].role, "citizen");

  await harness.service.updateRole(citizen.uid, "department-officer", "Public Works Department");
  assert.equal(harness.writes.commits, 1);
  assert.deepEqual(
    {
      role: harness.writes.updates[0].data.role,
      department: harness.writes.updates[0].data.department,
      actor: harness.writes.updates[0].data.roleUpdatedBy
    },
    {
      role: "department-officer",
      department: "Public Works Department",
      actor: administrator.uid
    }
  );
  assert.equal(harness.writes.audits[0].reference.collection, "roleAudit");
  assert.equal(harness.writes.audits[0].data.previousRole, "citizen");
  assert.equal(harness.writes.audits[0].data.newRole, "department-officer");
  assert.equal(harness.writes.audits[0].data.changedByEmail, administrator.email);

  await assert.rejects(
    () => harness.service.updateRole(administrator.uid, "citizen", ""),
    /own administrator role/
  );
  await assert.rejects(
    () => harness.service.updateRole(citizen.uid, "department-officer", "Unknown Department"),
    /assigned department/
  );

  await harness.service.sendPasswordReset(citizen.email);
  assert.equal(harness.writes.resets[0].email, citizen.email);

  const citizenHarness = createHarness(citizen, [citizen]);
  assert.throws(() => citizenHarness.service.subscribe(() => {}), /Only administrators/);
  await assert.rejects(
    () => citizenHarness.service.updateRole(citizen.uid, "administrator"),
    /Only administrators/
  );

  console.log("Role account service tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
