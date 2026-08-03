(() => {
  "use strict";

  const STORAGE_KEY = "civicresolve_complaints_v1";
  const MIGRATION_KEY_PREFIX = "civicresolve_firestore_migrated_v1_";
  const VALID_STATUSES = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved"];
  const VALID_PRIORITIES = ["High", "Medium", "Low"];

  const SAMPLE_COMPLAINTS = [
    {
      id: "GRV-2026-001", citizenName: "Arun Kumar", email: "arun@example.com", phone: "9876543210",
      title: "Large pothole near bus stand", description: "A large pothole is causing accidents near the main bus stand.",
      location: "Gandhipuram Bus Stand, Coimbatore", category: "Roads & Potholes", department: "Public Works Department",
      priority: "High", status: "In Progress", createdAt: "2026-07-30", expectedResolutionDate: "2026-08-04",
      resolutionNote: "Repair team has inspected the location and work has started.", rating: null, feedback: ""
    },
    {
      id: "GRV-2026-002", citizenName: "Meena S", email: "meena@example.com", phone: "9876501234",
      title: "Garbage not collected", description: "Garbage has not been collected for three days and there is a bad smell.",
      location: "RS Puram, Coimbatore", category: "Waste Management", department: "Municipal Waste Department",
      priority: "Medium", status: "Assigned", createdAt: "2026-07-31", expectedResolutionDate: "2026-08-02",
      resolutionNote: "Assigned to Ward 23 sanitation team.", rating: null, feedback: ""
    },
    {
      id: "GRV-2026-003", citizenName: "Rahul P", email: "rahul@example.com", phone: "9876511111",
      title: "Streetlight not working", description: "The streetlight near the school is not working and the road is dark at night.",
      location: "Saibaba Colony, Coimbatore", category: "Electricity & Streetlights", department: "Electricity Department",
      priority: "High", status: "Resolved", createdAt: "2026-07-28", expectedResolutionDate: "2026-07-30",
      resolutionNote: "Faulty light unit replaced and tested successfully.", rating: 5, feedback: "Resolved quickly. Thank you."
    },
    {
      id: "GRV-2026-004", citizenName: "Divya R", email: "divya@example.com", phone: "9876522222",
      title: "Water pipeline leakage", description: "A water pipe is leaking continuously near the market.",
      location: "Town Hall, Coimbatore", category: "Water Supply", department: "Water Supply Department",
      priority: "Medium", status: "Submitted", createdAt: "2026-08-01", expectedResolutionDate: "2026-08-03",
      resolutionNote: "", rating: null, feedback: ""
    }
  ];

  let localComplaints = null;
  const localSubscribers = new Set();

  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }

  function profile() {
    return window.CivicAuth?.getProfile() || null;
  }

  function firebaseServices() {
    const services = window.CivicAuth?.getFirebaseServices();
    if (!services?.db || !services?.sdk) throw new Error("Firestore is not available for this session.");
    return services;
  }

  function isDemoMode() {
    return window.CivicAuth?.isDemoMode() === true;
  }

  function dateValue(value, includeTime = false) {
    if (!value) return "";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return includeTime ? date.toISOString() : date.toISOString().slice(0, 10);
  }

  function defaultHistory(item) {
    return [{
      status: item.status || "Submitted",
      note: item.resolutionNote || "Complaint registered.",
      changedAt: item.createdAt || new Date().toISOString(),
      changedByUid: item.createdByUid || "legacy",
      changedByName: item.status === "Submitted" ? item.citizenName || "Citizen" : "CivicResolve official",
      changedByRole: item.status === "Submitted" ? "citizen" : "department-officer"
    }];
  }

  function normaliseComplaint(data, documentId = "") {
    const history = Array.isArray(data.statusHistory) && data.statusHistory.length
      ? data.statusHistory.map(entry => ({ ...entry, changedAt: dateValue(entry.changedAt, true) }))
      : defaultHistory(data);
    const evidence = Array.isArray(data.evidence)
      ? data.evidence.map(item => ({ ...item, uploadedAt: dateValue(item.uploadedAt, true) }))
      : [];
    const sla = data.sla && typeof data.sla === "object"
      ? {
          ...data.sla,
          deadlineAt: dateValue(data.sla.deadlineAt, true),
          lastEvaluatedAt: dateValue(data.sla.lastEvaluatedAt, true),
          dueSoonAlertedAt: dateValue(data.sla.dueSoonAlertedAt, true),
          overdueAlertedAt: dateValue(data.sla.overdueAlertedAt, true)
        }
      : null;
    return {
      ...data,
      id: data.id || documentId,
      createdAt: dateValue(data.createdAt),
      updatedAt: dateValue(data.updatedAt, true),
      statusHistory: history,
      evidence,
      sla
    };
  }

  function loadLocalComplaints() {
    if (localComplaints) return localComplaints;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      localComplaints = Array.isArray(saved) ? saved.map(item => normaliseComplaint(item)) : clone(SAMPLE_COMPLAINTS).map(item => normaliseComplaint(item));
    } catch {
      localComplaints = clone(SAMPLE_COMPLAINTS).map(item => normaliseComplaint(item));
    }
    return localComplaints;
  }

  function saveLocalComplaints() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(localComplaints));
    const visible = roleScopedLocalComplaints();
    localSubscribers.forEach(listener => listener(clone(visible)));
  }

  function roleScopedLocalComplaints() {
    const items = loadLocalComplaints();
    const current = profile();
    if (!current) return [];
    if (current.role === "administrator") return items;
    if (current.role === "department-officer") return items.filter(item => item.department === current.department);
    return items.filter(item => item.createdByUid === current.uid
      || (!item.createdByUid && item.email?.toLowerCase() === current.email?.toLowerCase()));
  }

  function sortNewestFirst(items) {
    return items.sort((a, b) => {
      const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bTime - aTime || String(b.id).localeCompare(String(a.id));
    });
  }

  function subscribe(onData, onError = console.error) {
    if (isDemoMode()) {
      localSubscribers.add(onData);
      queueMicrotask(() => onData(clone(roleScopedLocalComplaints())));
      return () => localSubscribers.delete(onData);
    }

    const current = profile();
    if (!current) throw new Error("Sign in before loading complaints.");
    const { db, sdk } = firebaseServices();
    const complaintsRef = sdk.collection(db, "complaints");
    let roleQuery = complaintsRef;

    if (current.role === "citizen") {
      roleQuery = sdk.query(complaintsRef, sdk.where("createdByUid", "==", current.uid));
    } else if (current.role === "department-officer") {
      if (!current.department) throw new Error("This officer account does not have an assigned department.");
      roleQuery = sdk.query(complaintsRef, sdk.where("department", "==", current.department));
    }

    return sdk.onSnapshot(roleQuery, snapshot => {
      const items = snapshot.docs.map(item => normaliseComplaint(item.data(), item.id));
      onData(sortNewestFirst(items));
    }, onError);
  }

  function nextDemoId() {
    const maxNumber = loadLocalComplaints().reduce((max, item) => Math.max(max, Number(String(item.id).split("-").pop()) || 0), 0);
    return `GRV-${new Date().getFullYear()}-${String(maxNumber + 1).padStart(3, "0")}`;
  }

  function historyEntry(status, note, changedAt) {
    const current = profile();
    return {
      status,
      note: note || "Complaint status updated.",
      changedAt,
      changedByUid: current?.uid || "",
      changedByName: current?.displayName || "CivicResolve user",
      changedByRole: current?.role || "citizen"
    };
  }

  function validChoice(value, choices, fallback) {
    return choices.includes(value) ? value : fallback;
  }

  function classificationRecord(value, title = "") {
    const source = value?.source === "gemini" ? "gemini" : "rules";
    return {
      source,
      model: String(value?.model || (source === "gemini" ? "gemini" : "keyword-rules-v1")).trim().slice(0, 80),
      confidence: Math.max(0, Math.min(100, Math.round(Number(value?.confidence) || 0))),
      summary: String(value?.summary || title || "Civic complaint").trim().slice(0, 220),
      reasoning: String(value?.reasoning || "Deterministic service routing was applied.").trim().slice(0, 300),
      reviewRequired: Boolean(value?.reviewRequired),
      safetyOverride: Boolean(value?.safetyOverride)
    };
  }

  function slaDraft(category, priority, now = new Date()) {
    if (!window.CivicSlaPolicy) throw new Error("The complaint SLA policy is unavailable.");
    return window.CivicSlaPolicy.createRecord({ category, priority }, now);
  }

  async function firebaseToken() {
    const user = window.CivicAuth?.getUser();
    if (!user || typeof user.getIdToken !== "function") {
      const error = new Error("Sign in before submitting a complaint.");
      error.code = "complaint/unauthenticated";
      throw error;
    }
    try {
      return await user.getIdToken();
    } catch {
      const error = new Error("Your sign-in session expired. Sign in again.");
      error.code = "complaint/unauthenticated";
      throw error;
    }
  }

  async function createRemoteComplaint(input) {
    const token = await firebaseToken();
    let response;
    try {
      response = await fetch("/api/create-complaint", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        cache: "no-store",
        body: JSON.stringify(input)
      });
    } catch {
      const error = new Error("The secure complaint service could not be reached. Check your connection and try again.");
      error.code = "complaint/network-error";
      throw error;
    }
    let payload = null;
    try { payload = await response.json(); } catch { /* use safe error below */ }
    if (!response.ok || !payload?.complaint?.id) {
      const error = new Error(payload?.error?.message || "The complaint could not be submitted.");
      error.code = payload?.error?.code || "complaint/request-failed";
      throw error;
    }
    return normaliseComplaint(payload.complaint, payload.complaint.id);
  }

  async function createComplaint(input) {
    const current = profile();
    if (!current || current.role !== "citizen") throw new Error("Only citizen accounts can submit complaints.");
    const today = new Date().toISOString().slice(0, 10);
    const priority = validChoice(input.priority, VALID_PRIORITIES, "Low");

    if (isDemoMode()) {
      const id = nextDemoId();
      const sla = slaDraft(input.category, priority);
      const complaint = normaliseComplaint({
        ...input,
        id,
        citizenName: current.displayName,
        email: current.email,
        status: "Submitted",
        priority,
        classification: classificationRecord(input.classification, input.title),
        expectedResolutionDate: sla.deadlineDate,
        sla,
        resolutionNote: "",
        rating: null,
        feedback: "",
        evidence: [],
        createdByUid: current.uid,
        createdByEmail: current.email,
        createdAt: today,
        updatedAt: new Date().toISOString(),
        statusHistory: [historyEntry("Submitted", "Complaint submitted by citizen.", new Date().toISOString())]
      });
      loadLocalComplaints().unshift(complaint);
      saveLocalComplaints();
      return clone(complaint);
    }

    return createRemoteComplaint({
      phone: String(input.phone || current.phone || ""),
      title: String(input.title || "").trim(),
      description: String(input.description || "").trim(),
      location: String(input.location || "").trim(),
      category: String(input.category || "General Civic Issue"),
      department: String(input.department || "General Administration"),
      priority,
      classification: classificationRecord(input.classification, input.title),
      duplicateId: String(input.duplicateId || "")
    });
  }

  async function attachEvidence(id, evidenceItems) {
    const current = profile();
    if (!current || current.role !== "citizen") throw new Error("Only the complaint owner can add evidence.");
    const additions = Array.isArray(evidenceItems) ? evidenceItems : [];
    if (!additions.length) throw new Error("No evidence files were uploaded.");

    if (isDemoMode()) {
      const item = loadLocalComplaints().find(complaint => complaint.id === id);
      if (!item || !window.CivicAuth.ownsComplaint(item)) throw new Error("This complaint is outside your account.");
      if (!["Submitted", "Under Review"].includes(item.status)) throw new Error("Evidence can be added only before department work begins.");
      const combined = [...(item.evidence || []), ...additions];
      if (combined.length > 3) throw new Error("A complaint can contain a maximum of three evidence files.");
      item.evidence = combined;
      item.updatedAt = new Date().toISOString();
      saveLocalComplaints();
      return clone(item.evidence);
    }

    const { db, sdk } = firebaseServices();
    const complaintRef = sdk.doc(db, "complaints", id);
    const snapshot = await sdk.getDoc(complaintRef);
    if (!snapshot.exists()) throw new Error("The complaint no longer exists.");
    const existing = snapshot.data();
    if (existing.createdByUid !== current.uid) throw new Error("This complaint is outside your account.");
    if (!["Submitted", "Under Review"].includes(existing.status)) throw new Error("Evidence can be added only before department work begins.");
    const combined = [...(Array.isArray(existing.evidence) ? existing.evidence : []), ...additions];
    if (combined.length > 3) throw new Error("A complaint can contain a maximum of three evidence files.");
    await sdk.updateDoc(complaintRef, {
      evidence: combined,
      updatedAt: sdk.serverTimestamp()
    });
    return combined;
  }

  async function updateOfficial(id, changes) {
    const current = profile();
    if (!current || !["department-officer", "administrator"].includes(current.role)) {
      throw new Error("Your role cannot update complaints.");
    }
    const status = validChoice(changes.status, VALID_STATUSES, "Submitted");
    const note = String(changes.resolutionNote || "").trim();

    if (isDemoMode()) {
      const item = loadLocalComplaints().find(complaint => complaint.id === id);
      if (!item || !window.CivicAuth.canManageComplaint(item)) throw new Error("This complaint is outside your assigned role.");
      item.status = status;
      item.resolutionNote = note;
      if (current.role === "administrator") {
        item.priority = validChoice(changes.priority, VALID_PRIORITIES, item.priority);
        item.department = String(changes.department || item.department).trim();
      }
      item.updatedAt = new Date().toISOString();
      item.statusHistory = [...(item.statusHistory || defaultHistory(item)), historyEntry(status, note, item.updatedAt)];
      saveLocalComplaints();
      return clone(item);
    }

    const { db, sdk } = firebaseServices();
    const complaintRef = sdk.doc(db, "complaints", id);
    const snapshot = await sdk.getDoc(complaintRef);
    if (!snapshot.exists()) throw new Error("The complaint no longer exists.");
    const existing = snapshot.data();
    const entry = historyEntry(status, note, sdk.Timestamp.now());
    const updates = {
      status,
      resolutionNote: note,
      statusHistory: [...(Array.isArray(existing.statusHistory) ? existing.statusHistory : []), entry],
      updatedAt: sdk.serverTimestamp()
    };
    if (current.role === "administrator") {
      updates.priority = validChoice(changes.priority, VALID_PRIORITIES, existing.priority);
      updates.department = String(changes.department || existing.department).trim();
    }
    await sdk.updateDoc(complaintRef, updates);
  }

  async function saveFeedback(id, rating, feedback) {
    const current = profile();
    if (!current || current.role !== "citizen") throw new Error("Only the complaint owner can save feedback.");
    const safeRating = Math.min(5, Math.max(1, Number(rating) || 5));
    const safeFeedback = String(feedback || "").trim().slice(0, 1000);

    if (isDemoMode()) {
      const item = loadLocalComplaints().find(complaint => complaint.id === id);
      if (!item || !window.CivicAuth.ownsComplaint(item) || item.status !== "Resolved") throw new Error("Feedback is available only for your resolved complaints.");
      item.rating = safeRating;
      item.feedback = safeFeedback;
      item.updatedAt = new Date().toISOString();
      saveLocalComplaints();
      return clone(item);
    }

    const { db, sdk } = firebaseServices();
    await sdk.updateDoc(sdk.doc(db, "complaints", id), {
      rating: safeRating,
      feedback: safeFeedback,
      updatedAt: sdk.serverTimestamp()
    });
  }

  async function deleteComplaint(id) {
    if (profile()?.role !== "administrator") throw new Error("Only administrators can delete complaints.");
    if (isDemoMode()) {
      localComplaints = loadLocalComplaints().filter(item => item.id !== id);
      saveLocalComplaints();
      return;
    }
    const { db, sdk } = firebaseServices();
    const complaintRef = sdk.doc(db, "complaints", id);
    const snapshot = await sdk.getDoc(complaintRef);
    if (!snapshot.exists()) return;
    const evidence = Array.isArray(snapshot.data().evidence) ? snapshot.data().evidence : [];
    if (evidence.length) await window.CivicEvidence.removeMany(evidence);
    await sdk.deleteDoc(complaintRef);
  }

  function resetDemoData() {
    if (!isDemoMode() || profile()?.role !== "administrator") throw new Error("Demo reset is available only to demo administrators.");
    localComplaints = clone(SAMPLE_COMPLAINTS).map(item => normaliseComplaint(item));
    saveLocalComplaints();
  }

  async function migrateLegacyCitizenComplaints(existingIds = []) {
    if (isDemoMode() || profile()?.role !== "citizen") return 0;
    const current = profile();
    const marker = `${MIGRATION_KEY_PREFIX}${current.uid}`;
    if (localStorage.getItem(marker) === "done") return 0;

    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch {
      saved = null;
    }
    if (!Array.isArray(saved)) {
      localStorage.setItem(marker, "done");
      return 0;
    }

    const knownIds = new Set(existingIds);
    const candidates = saved.filter(item => item?.status === "Submitted"
      && !knownIds.has(item.id)
      && (item.createdByUid === current.uid
        || (!item.createdByUid && item.email?.toLowerCase() === current.email?.toLowerCase())));
    let migrated = 0;
    for (const item of candidates) {
      try {
        await createComplaint(item);
        migrated += 1;
      } catch (error) {
        console.warn(`Could not migrate local complaint ${item.id || "unknown"}.`, error);
      }
    }
    localStorage.setItem(marker, "done");
    return migrated;
  }

  window.CivicComplaints = Object.freeze({
    subscribe,
    create: createComplaint,
    attachEvidence,
    updateOfficial,
    saveFeedback,
    delete: deleteComplaint,
    resetDemoData,
    migrateLegacyCitizenComplaints,
    isDemoMode
  });
})();
