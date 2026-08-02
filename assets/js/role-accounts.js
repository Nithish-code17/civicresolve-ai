(() => {
  "use strict";

  const ROLES = Object.freeze(["citizen", "department-officer", "administrator"]);
  const DEPARTMENTS = Object.freeze([
    "Public Works Department",
    "Municipal Waste Department",
    "Water Supply Department",
    "Electricity Department",
    "Sanitation Department",
    "Transport Department",
    "Municipal Corporation",
    "General Administration"
  ]);

  function currentProfile() {
    return window.CivicAuth?.getProfile() || null;
  }

  function requireAdministrator() {
    const profile = currentProfile();
    if (!profile || profile.role !== "administrator") {
      throw new Error("Only administrators can manage role accounts.");
    }
    return profile;
  }

  function firebaseServices() {
    const services = window.CivicAuth?.getFirebaseServices();
    if (!services?.db || !services?.sdk) throw new Error("Firestore is not available for role management.");
    return services;
  }

  function dateValue(value) {
    if (!value) return "";
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  function normaliseAccount(data, documentId = "") {
    return {
      uid: data.uid || documentId,
      email: data.email || "",
      displayName: data.displayName || data.email?.split("@")[0] || "CivicResolve User",
      phone: data.phone || "",
      role: ROLES.includes(data.role) ? data.role : "citizen",
      department: data.department || "",
      createdAt: dateValue(data.createdAt),
      updatedAt: dateValue(data.updatedAt),
      roleUpdatedAt: dateValue(data.roleUpdatedAt),
      roleUpdatedBy: data.roleUpdatedBy || "",
      roleUpdatedByName: data.roleUpdatedByName || ""
    };
  }

  function sortAccounts(accounts) {
    const rank = { administrator: 0, "department-officer": 1, citizen: 2 };
    return accounts.sort((a, b) => rank[a.role] - rank[b.role]
      || a.displayName.localeCompare(b.displayName)
      || a.email.localeCompare(b.email));
  }

  function subscribe(onData, onError = console.error) {
    const administrator = requireAdministrator();
    if (window.CivicAuth?.isDemoMode()) {
      queueMicrotask(() => onData([normaliseAccount(administrator, administrator.uid)]));
      return () => {};
    }

    const { db, sdk } = firebaseServices();
    return sdk.onSnapshot(sdk.collection(db, "users"), snapshot => {
      const accounts = snapshot.docs.map(item => normaliseAccount(item.data(), item.id));
      onData(sortAccounts(accounts));
    }, onError);
  }

  function roleDepartment(role, department) {
    if (!ROLES.includes(role)) throw new Error("Choose a valid CivicResolve role.");
    if (role === "citizen") return "";
    if (role === "administrator") return "General Administration";
    if (!DEPARTMENTS.includes(department)) throw new Error("Choose the officer's assigned department.");
    return department;
  }

  async function updateRole(targetUid, role, department = "") {
    const administrator = requireAdministrator();
    if (!targetUid) throw new Error("The selected account does not have a valid UID.");
    if (targetUid === administrator.uid) throw new Error("You cannot change your own administrator role.");

    const assignedDepartment = roleDepartment(role, department);
    if (window.CivicAuth?.isDemoMode()) throw new Error("Role changes require the connected Firebase project.");

    const { db, sdk } = firebaseServices();
    const accountRef = sdk.doc(db, "users", targetUid);
    const snapshot = await sdk.getDoc(accountRef);
    if (!snapshot.exists()) throw new Error("This user profile no longer exists.");

    const existing = normaliseAccount(snapshot.data(), targetUid);
    if (existing.role === role && existing.department === assignedDepartment) {
      throw new Error("This account already has the selected role and department.");
    }

    const changedAt = sdk.serverTimestamp();
    const auditRef = sdk.doc(sdk.collection(db, "roleAudit"));
    const batch = sdk.writeBatch(db);
    batch.update(accountRef, {
      role,
      department: assignedDepartment,
      updatedAt: changedAt,
      roleUpdatedAt: changedAt,
      roleUpdatedBy: administrator.uid,
      roleUpdatedByName: administrator.displayName
    });
    batch.set(auditRef, {
      targetUid,
      targetEmail: existing.email,
      targetDisplayName: existing.displayName,
      previousRole: existing.role,
      previousDepartment: existing.department,
      newRole: role,
      newDepartment: assignedDepartment,
      changedByUid: administrator.uid,
      changedByEmail: administrator.email,
      changedByName: administrator.displayName,
      changedAt
    });
    await batch.commit();
  }

  async function sendPasswordReset(email) {
    requireAdministrator();
    if (!email) throw new Error("This account does not have an email address.");
    if (window.CivicAuth?.isDemoMode()) throw new Error("Password emails require the connected Firebase project.");
    const { auth, sdk } = firebaseServices();
    if (!auth) throw new Error("Firebase Authentication is not available.");
    await sdk.sendPasswordResetEmail(auth, email);
  }

  window.CivicRoleAccounts = Object.freeze({
    ROLES,
    DEPARTMENTS,
    subscribe,
    updateRole,
    sendPasswordReset
  });
})();
