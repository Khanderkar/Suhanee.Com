// ============================================================
// FIREBASE CONFIG
// ============================================================
// Go to https://console.firebase.google.com
// -> Project settings (gear icon) -> General tab -> "Your apps"
// -> Click the web icon (</>) to register a web app
// -> Copy the config object it gives you and paste the values below.
// ============================================================

const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_AUTH_DOMAIN_HERE",
  projectId: "PASTE_YOUR_PROJECT_ID_HERE",
  storageBucket: "PASTE_YOUR_STORAGE_BUCKET_HERE",
  messagingSenderId: "PASTE_YOUR_SENDER_ID_HERE",
  appId: "PASTE_YOUR_APP_ID_HERE"
};

// Initialize Firebase (using the "compat" SDK loaded via <script> tags in the HTML files)
firebase.initializeApp(firebaseConfig);

// These are used across every page - just import this file first
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
