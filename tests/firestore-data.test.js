const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../assets/js/firestore-data.js"), "utf8");

function createLocalStorage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function createHarness(userProfile, snapshotData = []) {
  const writes = { set: [], update: [], delete: [], queries: [] };
  const fixedDate = new Date("2026-08-02T08:30:00.000Z");
  const timestamp = () => ({ toDate: () => fixedDate });
  const sdk = {
    collection: (_db, name) => ({ type: "collection", name }),
    doc: (...args) => args.length === 1
      ? { id: "AbCdEfGhIjKlMnOpQrSt" }
      : { type: "document", collection: args[1], id: args[2] },
    where: (field, operator, value) => ({ field, operator, value }),
    query: (collection, ...constraints) => ({ collection, constraints }),
    onSnapshot: (query, onData) => {
      writes.queries.push(query);
      queueMicrotask(() => onData({
        docs: snapshotData.map(item => ({ id: item.id, data: () => item }))
      }));
      return () => {};
    },
    serverTimestamp: () => ({ serverTimestamp: true }),
    Timestamp: { now: timestamp },
    setDoc: async (reference, data) => { writes.set.push({ reference, data }); },
    getDoc: async reference => ({
      exists: () => true,
      data: () => snapshotData.find(item => item.id === reference.id)
    }),
    updateDoc: async (reference, data) => { writes.update.push({ reference, data }); },
    deleteDoc: async reference => { writes.delete.push(reference); }
  };
  const window = {
    CivicAuth: {
      getProfile: () => userProfile,
      getFirebaseServices: () => ({ db: {}, sdk }),
      isDemoMode: () => false,
      canManageComplaint: complaint => userProfile.role === "administrator" || complaint.department === userProfile.department,
      ownsComplaint: complaint => complaint.createdByUid === userProfile.uid
    }
  };
  const context = vm.createContext({
    window,
    localStorage: createLocalStorage(),
    structuredClone,
    console,
    Date,
    Promise,
    Set,
    Map,
    String,
    Number,
    Array,
    Object,
    JSON,
    queueMicrotask
  });
  vm.runInContext(source, context, { filename: "firestore-data.js" });
  return { service: window.CivicComplaints, writes };
}

const baseComplaint = {
  id: "GRV-2026-EXISTING",
  citizenName: "Citizen One",
  email: "citizen@example.com",
  phone: "9876543210",
  title: "Road surface is damaged",
  description: "The road surface has been damaged for several days.",
  location: "Ward 10, Coimbatore",
  category: "Roads & Potholes",
  department: "Public Works Department",
  priority: "Medium",
  status: "Submitted",
  expectedResolutionDate: "2026-08-07",
  resolutionNote: "",
  rating: null,
  feedback: "",
  duplicateId: "",
  createdByUid: "citizen-1",
  createdByEmail: "citizen@example.com",
  createdAt: { toDate: () => new Date("2026-08-02T08:00:00.000Z") },
  updatedAt: { toDate: () => new Date("2026-08-02T08:00:00.000Z") },
  statusHistory: [{
    status: "Submitted",
    note: "Complaint submitted by citizen.",
    changedAt: { toDate: () => new Date("2026-08-02T08:00:00.000Z") },
    changedByUid: "citizen-1",
    changedByName: "Citizen One",
    changedByRole: "citizen"
  }]
};

async function run() {
  const citizen = {
    uid: "citizen-1", email: "citizen@example.com", displayName: "Citizen One",
    phone: "9876543210", role: "citizen", department: ""
  };
  const citizenHarness = createHarness(citizen, [baseComplaint]);
  let received = null;
  citizenHarness.service.subscribe(items => { received = items; });
  await Promise.resolve();
  assert.equal(citizenHarness.writes.queries[0].constraints[0].field, "createdByUid");
  assert.equal(citizenHarness.writes.queries[0].constraints[0].value, citizen.uid);
  assert.equal(received[0].id, baseComplaint.id);

  const created = await citizenHarness.service.create({
    phone: citizen.phone,
    title: "Streetlight is not working",
    description: "The streetlight near the school has not worked for two nights.",
    location: "Ward 12, Coimbatore",
    category: "Electricity & Streetlights",
    department: "Electricity Department",
    priority: "High",
    expectedResolutionDate: "2026-08-04",
    duplicateId: ""
  });
  const createWrite = citizenHarness.writes.set[0];
  assert.match(created.id, /^GRV-2026-/);
  assert.equal(createWrite.reference.id, created.id);
  assert.equal(createWrite.data.createdByUid, citizen.uid);
  assert.equal(createWrite.data.status, "Submitted");
  assert.equal(createWrite.data.statusHistory[0].changedByRole, "citizen");

  await citizenHarness.service.saveFeedback(baseComplaint.id, 4, "Resolved well.");
  assert.deepEqual(
    { rating: citizenHarness.writes.update[0].data.rating, feedback: citizenHarness.writes.update[0].data.feedback },
    { rating: 4, feedback: "Resolved well." }
  );

  const officer = {
    uid: "officer-1", email: "officer@example.gov.in", displayName: "Roads Officer",
    role: "department-officer", department: "Public Works Department"
  };
  const officerHarness = createHarness(officer, [baseComplaint]);
  officerHarness.service.subscribe(() => {});
  await Promise.resolve();
  assert.equal(officerHarness.writes.queries[0].constraints[0].field, "department");
  assert.equal(officerHarness.writes.queries[0].constraints[0].value, officer.department);

  await officerHarness.service.updateOfficial(baseComplaint.id, {
    status: "In Progress",
    resolutionNote: "Repair team dispatched.",
    priority: "High",
    department: "Electricity Department"
  });
  const officerUpdate = officerHarness.writes.update[0].data;
  assert.equal(officerUpdate.status, "In Progress");
  assert.equal(officerUpdate.statusHistory.length, 2);
  assert.equal(officerUpdate.statusHistory[1].changedByUid, officer.uid);
  assert.equal("priority" in officerUpdate, false);
  assert.equal("department" in officerUpdate, false);

  const administrator = { ...officer, uid: "admin-1", role: "administrator", displayName: "Municipal Admin" };
  const adminHarness = createHarness(administrator, [baseComplaint]);
  await adminHarness.service.updateOfficial(baseComplaint.id, {
    status: "Assigned",
    resolutionNote: "Assigned to the road team.",
    priority: "High",
    department: "Public Works Department"
  });
  assert.equal(adminHarness.writes.update[0].data.priority, "High");
  assert.equal(adminHarness.writes.update[0].data.department, "Public Works Department");
  await adminHarness.service.delete(baseComplaint.id);
  assert.equal(adminHarness.writes.delete[0].id, baseComplaint.id);

  console.log("Firestore data service tests passed.");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
