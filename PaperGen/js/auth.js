// ============================================================
// AUTH.JS - handles login, signup, logout, and route protection
// ============================================================

// ---- GOOGLE SIGN-IN ----
const googleBtn = document.getElementById("google-signin-btn");
if (googleBtn) {
  googleBtn.addEventListener("click", async () => {
    clearError();
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError(friendlyAuthError(err));
    }
  });
}

// ---- LOGIN PAGE LOGIC (only runs if these elements exist on the page) ----
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const authError = document.getElementById("auth-error");
const showSignupLink = document.getElementById("show-signup");
const showLoginLink = document.getElementById("show-login");

function showError(message) {
  if (!authError) return;
  authError.textContent = message;
  authError.classList.remove("hidden");
}

function clearError() {
  if (!authError) return;
  authError.classList.add("hidden");
  authError.textContent = "";
}

if (showSignupLink && showLoginLink) {
  showSignupLink.addEventListener("click", (e) => {
    e.preventDefault();
    clearError();
    loginForm.classList.add("hidden");
    signupForm.classList.remove("hidden");
  });
  showLoginLink.addEventListener("click", (e) => {
    e.preventDefault();
    clearError();
    signupForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError(friendlyAuthError(err));
    }
  });
}

if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("signup-email").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    if (password !== confirm) {
      showError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      showError("Password must be at least 6 characters.");
      return;
    }
    try {
      await auth.createUserWithEmailAndPassword(email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      showError(friendlyAuthError(err));
    }
  });
}

function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/user-not-found":
      return "No account found with that email.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect email or password.";
    case "auth/email-already-in-use":
      return "An account already exists with that email. Try logging in instead.";
    case "auth/weak-password":
      return "Password is too weak. Use at least 6 characters.";
    default:
      return "Something went wrong (" + err.code + "). Please try again.";
  }
}

// ---- ROUTE PROTECTION FOR DASHBOARD ----
// If we're on a page that has a #user-email element, it's a protected page.
// Redirect to login if not signed in; otherwise show the user's email.
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

if (userEmailEl) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = "index.html";
    } else {
      userEmailEl.textContent = user.email;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await auth.signOut();
    window.location.href = "index.html";
  });
}

// If already logged in and viewing the login page, skip straight to dashboard
if (loginForm && !userEmailEl) {
  auth.onAuthStateChanged((user) => {
    if (user) window.location.href = "dashboard.html";
  });
}
