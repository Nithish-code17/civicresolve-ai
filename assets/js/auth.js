(() => {
  "use strict";

  const FIREBASE_VERSION = "12.17.0";
  const DEMO_SESSION_KEY = "civicresolve_demo_auth_v1";
  const ROLES = Object.freeze({
    CITIZEN: "citizen",
    OFFICER: "department-officer",
    ADMIN: "administrator"
  });
  const ROLE_LABELS = Object.freeze({
    [ROLES.CITIZEN]: "Citizen",
    [ROLES.OFFICER]: "Department Officer",
    [ROLES.ADMIN]: "Administrator"
  });
  const PAGE_ACCESS = Object.freeze({
    dashboard: [ROLES.CITIZEN, ROLES.OFFICER, ROLES.ADMIN],
    submit: [ROLES.CITIZEN],
    track: [ROLES.CITIZEN, ROLES.OFFICER, ROLES.ADMIN],
    admin: [ROLES.OFFICER, ROLES.ADMIN],
    analytics: [ROLES.OFFICER, ROLES.ADMIN]
  });
  const DEMO_PROFILES = Object.freeze({
    [ROLES.CITIZEN]: {
      uid: "demo-citizen",
      email: "arun@example.com",
      displayName: "Arun Kumar",
      phone: "9876543210",
      role: ROLES.CITIZEN,
      department: ""
    },
    [ROLES.OFFICER]: {
      uid: "demo-officer",
      email: "officer@civicresolve.demo",
      displayName: "Priya Rajan",
      phone: "",
      role: ROLES.OFFICER,
      department: "Public Works Department"
    },
    [ROLES.ADMIN]: {
      uid: "demo-administrator",
      email: "admin@civicresolve.demo",
      displayName: "Municipal Admin",
      phone: "",
      role: ROLES.ADMIN,
      department: "General Administration"
    }
  });

  const state = {
    ready: false,
    mode: "loading",
    user: null,
    profile: null,
    auth: null,
    db: null,
    sdk: null,
    pendingRegistrationProfile: null
  };

  let resolveReady;
  const readyPromise = new Promise(resolve => { resolveReady = resolve; });

  function configured() {
    const config = window.CIVICRESOLVE_FIREBASE_CONFIG || {};
    return [config.apiKey, config.authDomain, config.projectId, config.appId]
      .every(value => typeof value === "string" && value.trim());
  }

  function safeText(value = "") {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normaliseRole(role) {
    return Object.values(ROLES).includes(role) ? role : ROLES.CITIZEN;
  }

  function normaliseProfile(profile, user) {
    return {
      uid: user.uid,
      email: user.email || profile?.email || "",
      displayName: profile?.displayName || user.displayName || user.email?.split("@")[0] || "CivicResolve User",
      phone: profile?.phone || "",
      role: normaliseRole(profile?.role),
      department: profile?.department || ""
    };
  }

  function completeReady() {
    if (state.ready) return;
    state.ready = true;
    resolveReady();
  }

  function notifyChange() {
    document.dispatchEvent(new CustomEvent("civic-auth-changed", {
      detail: { authenticated: Boolean(state.user), role: state.profile?.role || null }
    }));
  }

  function setSession(user, profile) {
    state.user = user;
    state.profile = profile;
    if (!user) renderAuthScreen();
    notifyChange();
  }

  async function loadFirebaseSdk() {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`)
    ]);
    return { ...appSdk, ...authSdk, ...firestoreSdk };
  }

  async function getOrCreateProfile(user) {
    const { doc, getDoc, setDoc, serverTimestamp } = state.sdk;
    const profileRef = doc(state.db, "users", user.uid);
    const snapshot = await getDoc(profileRef);
    if (snapshot.exists()) return normaliseProfile(snapshot.data(), user);

    const citizenProfile = normaliseProfile({
      role: ROLES.CITIZEN,
      ...(state.pendingRegistrationProfile || {})
    }, user);
    await setDoc(profileRef, {
      ...citizenProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return citizenProfile;
  }

  async function initialiseFirebase() {
    state.mode = "firebase";
    state.sdk = await loadFirebaseSdk();
    const app = state.sdk.initializeApp(window.CIVICRESOLVE_FIREBASE_CONFIG);
    state.auth = state.sdk.getAuth(app);
    state.auth.useDeviceLanguage();
    state.db = state.sdk.getFirestore(app);

    let firstAuthState = true;
    state.sdk.onAuthStateChanged(state.auth, async user => {
      if (!user) {
        setSession(null, null);
        if (firstAuthState) completeReady();
        firstAuthState = false;
        return;
      }

      try {
        const profile = await getOrCreateProfile(user);
        setSession(user, profile);
      } catch (error) {
        console.error("Unable to load the CivicResolve user profile.", error);
        // Fail closed to the least-privileged role when a profile cannot load.
        setSession(user, normaliseProfile({ role: ROLES.CITIZEN }, user));
        showAuthMessage("Signed in, but your role profile could not be loaded. Citizen access was applied.", "warning");
      }

      if (firstAuthState) completeReady();
      firstAuthState = false;
    });
  }

  function initialiseDemoMode() {
    state.mode = "demo";
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEMO_SESSION_KEY));
      if (saved?.role && DEMO_PROFILES[saved.role]) {
        const profile = { ...DEMO_PROFILES[saved.role] };
        state.user = { uid: profile.uid, email: profile.email, displayName: profile.displayName };
        state.profile = profile;
      }
    } catch {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
    }
    completeReady();
    if (!state.user) renderAuthScreen();
  }

  function authBrand() {
    return `<div class="auth-brand"><div class="auth-logo">✦</div><div><strong>CivicResolve</strong><span>AI Grievance Portal</span></div></div>`;
  }

  function renderAuthScreen(view = "signin") {
    const root = document.getElementById("app");
    if (!root || state.user) return;
    const isRegister = view === "register";
    const demoEnabled = state.mode === "demo" && window.CIVICRESOLVE_AUTH_OPTIONS?.allowDemoMode !== false;

    root.innerHTML = `<main class="auth-shell">
      <section class="auth-showcase">
        ${authBrand()}
        <div class="auth-showcase-copy">
          <span class="auth-kicker">Secure public service access</span>
          <h1>One portal. Clear responsibility. Faster resolution.</h1>
          <p>Citizens, department officers and administrators receive only the tools and complaint data required for their role.</p>
          <div class="auth-role-list">
            <div><span>01</span><p><strong>Citizens</strong>Submit and track personal grievances</p></div>
            <div><span>02</span><p><strong>Department officers</strong>Update assigned department work</p></div>
            <div><span>03</span><p><strong>Administrators</strong>Manage routing, priority and oversight</p></div>
          </div>
        </div>
        <p class="auth-security-note">Firebase Authentication · Firestore role profiles · Least-privilege access</p>
      </section>
      <section class="auth-form-side">
        <div class="auth-card">
          <div class="auth-mobile-brand">${authBrand()}</div>
          <p class="eyebrow">${isRegister ? "Citizen registration" : "Welcome back"}</p>
          <h2>${isRegister ? "Create your citizen account" : "Sign in to CivicResolve"}</h2>
          <p class="auth-subtitle">${isRegister ? "New accounts are securely created with the Citizen role." : "Use your registered email and password to continue."}</p>
          <div id="authMessage" class="auth-message hidden" role="alert"></div>
          <form id="authForm" class="auth-form" data-view="${view}">
            ${isRegister ? `<label><span>Full name</span><input name="displayName" autocomplete="name" placeholder="Enter your full name" required></label><label><span>Phone number</span><input name="phone" autocomplete="tel" inputmode="numeric" pattern="[0-9]{10}" placeholder="10-digit mobile number" required></label>` : ""}
            <label><span>Email address</span><input name="email" type="email" autocomplete="email" placeholder="name@example.com" required></label>
            <label><span>Password</span><input name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" minlength="6" placeholder="Minimum 6 characters" required></label>
            ${isRegister ? `<label><span>Confirm password</span><input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" placeholder="Enter the password again" required></label>` : `<button type="button" id="forgotPassword" class="auth-link align-right">Forgot password?</button>`}
            <button id="authSubmit" class="primary-button auth-submit" type="submit">${isRegister ? "Create Citizen Account" : "Sign In"}</button>
          </form>
          ${state.mode === "firebase" ? `<div class="auth-divider"><span>or</span></div><button id="googleSignIn" class="google-button" type="button"><span>G</span> Continue with Google</button>` : ""}
          <p class="auth-switch">${isRegister ? "Already registered?" : "New citizen?"} <button type="button" id="authSwitch">${isRegister ? "Sign in" : "Create an account"}</button></p>
          ${demoEnabled ? renderDemoAccess() : ""}
        </div>
      </section>
    </main>`;
    attachAuthEvents(view);
  }

  function renderDemoAccess() {
    return `<section class="demo-access"><div><strong>Hackathon demo access</strong><span>Firebase keys are not configured yet. Choose a role to test its protected workspace.</span></div><div class="demo-role-grid"><button data-demo-role="citizen"><span>◉</span>Citizen</button><button data-demo-role="department-officer"><span>▤</span>Officer</button><button data-demo-role="administrator"><span>⚙</span>Admin</button></div></section>`;
  }

  function attachAuthEvents(view) {
    document.getElementById("authSwitch")?.addEventListener("click", () => renderAuthScreen(view === "signin" ? "register" : "signin"));
    document.getElementById("authForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget));
      if (view === "register" && data.password !== data.confirmPassword) {
        showAuthMessage("The passwords do not match.");
        return;
      }
      await withBusyState(() => view === "register" ? register(data) : signIn(data.email, data.password));
    });
    document.getElementById("forgotPassword")?.addEventListener("click", async () => {
      const email = document.querySelector('#authForm [name="email"]')?.value.trim();
      if (!email) {
        showAuthMessage("Enter your email address first.");
        return;
      }
      await withBusyState(() => resetPassword(email), "Password reset email sent. Check your inbox.");
    });
    document.getElementById("googleSignIn")?.addEventListener("click", () => withBusyState(signInWithGoogle));
    document.querySelectorAll("[data-demo-role]").forEach(button => button.addEventListener("click", () => demoSignIn(button.dataset.demoRole)));
  }

  async function withBusyState(action, successMessage = "") {
    const submit = document.getElementById("authSubmit");
    const original = submit?.textContent;
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Please wait…";
    }
    try {
      await action();
      if (successMessage) showAuthMessage(successMessage, "success");
    } catch (error) {
      console.error(error);
      showAuthMessage(humaniseAuthError(error));
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = original;
      }
    }
  }

  function showAuthMessage(message, tone = "error") {
    const box = document.getElementById("authMessage");
    if (!box) return;
    box.className = `auth-message ${tone}`;
    box.textContent = message;
  }

  function humaniseAuthError(error) {
    const messages = {
      "auth/invalid-credential": "The email or password is incorrect.",
      "auth/email-already-in-use": "An account already exists for this email.",
      "auth/weak-password": "Choose a stronger password with at least 6 characters.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/popup-blocked": "The browser blocked the Google sign-in window. Allow pop-ups and try again.",
      "auth/too-many-requests": "Too many attempts. Wait a moment and try again."
    };
    return messages[error?.code] || error?.message || "Authentication failed. Please try again.";
  }

  async function signIn(email, password) {
    if (state.mode !== "firebase") throw new Error("Firebase is not configured. Use a demo role or add the Firebase project configuration.");
    await state.sdk.signInWithEmailAndPassword(state.auth, email.trim(), password);
  }

  async function register(data) {
    if (state.mode !== "firebase") throw new Error("Firebase is not configured. Add the Firebase project configuration before creating accounts.");
    state.pendingRegistrationProfile = {
      displayName: data.displayName.trim(),
      phone: data.phone.trim(),
      role: ROLES.CITIZEN,
      department: ""
    };
    try {
      const credential = await state.sdk.createUserWithEmailAndPassword(state.auth, data.email.trim(), data.password);
      await state.sdk.updateProfile(credential.user, { displayName: data.displayName.trim() });
      const profile = normaliseProfile(state.pendingRegistrationProfile, credential.user);
      await state.sdk.setDoc(state.sdk.doc(state.db, "users", credential.user.uid), {
        ...profile,
        createdAt: state.sdk.serverTimestamp(),
        updatedAt: state.sdk.serverTimestamp()
      });
    } finally {
      state.pendingRegistrationProfile = null;
    }
  }

  async function signInWithGoogle() {
    if (state.mode !== "firebase") return;
    const provider = new state.sdk.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await state.sdk.signInWithPopup(state.auth, provider);
  }

  async function resetPassword(email) {
    if (state.mode !== "firebase") throw new Error("Firebase is not configured yet.");
    await state.sdk.sendPasswordResetEmail(state.auth, email.trim());
  }

  function demoSignIn(role) {
    const profile = DEMO_PROFILES[normaliseRole(role)];
    if (!profile) return;
    sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ role: profile.role }));
    state.user = { uid: profile.uid, email: profile.email, displayName: profile.displayName };
    state.profile = { ...profile };
    notifyChange();
  }

  async function signOutCurrentUser() {
    if (state.mode === "firebase" && state.auth) await state.sdk.signOut(state.auth);
    if (state.mode === "demo") {
      sessionStorage.removeItem(DEMO_SESSION_KEY);
      setSession(null, null);
    }
  }

  function canAccess(page) {
    return Boolean(state.profile && PAGE_ACCESS[page]?.includes(state.profile.role));
  }

  function canManageComplaint(complaint) {
    if (!state.profile || !complaint) return false;
    if (state.profile.role === ROLES.ADMIN) return true;
    return state.profile.role === ROLES.OFFICER
      && Boolean(state.profile.department)
      && complaint.department === state.profile.department;
  }

  function ownsComplaint(complaint) {
    if (!state.profile || !complaint) return false;
    return complaint.createdByUid === state.profile.uid
      || (!complaint.createdByUid && complaint.email?.toLowerCase() === state.profile.email?.toLowerCase());
  }

  window.CivicAuth = Object.freeze({
    ROLES,
    ready: () => readyPromise,
    isAuthenticated: () => Boolean(state.user),
    isDemoMode: () => state.mode === "demo",
    getUser: () => state.user,
    getProfile: () => state.profile,
    getRole: () => state.profile?.role || null,
    getRoleLabel: () => ROLE_LABELS[state.profile?.role] || "User",
    canAccess,
    canManageComplaint,
    canDeleteComplaint: () => state.profile?.role === ROLES.ADMIN,
    ownsComplaint,
    signOut: signOutCurrentUser,
    renderAuthScreen
  });

  (async () => {
    try {
      if (configured()) await initialiseFirebase();
      else initialiseDemoMode();
    } catch (error) {
      console.error("Firebase initialisation failed. Demo mode was activated.", error);
      initialiseDemoMode();
      showAuthMessage("Firebase could not start, so local demo access is available.", "warning");
    }
  })();
})();
