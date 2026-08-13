// ============================================================
// FIREBASE CONFIG
// ============================================================
// Go to https://console.firebase.google.com
// -> Project settings (gear icon) -> General tab -> "Your apps"
// -> Click the web icon (</>) to register a web app
// -> Copy the config object it gives you and paste the values below.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyCacW4VdF1mgrMp1p2j3D4Ai2Az5TxCdlU",
  authDomain: "suhanee-papergen.firebaseapp.com",
  projectId: "suhanee-papergen",
  storageBucket: "suhanee-papergen.firebasestorage.app",
  messagingSenderId: "1098056725129",
  appId: "1:1098056725129:web:1e3b458e2518bba1ad4c58",
  measurementId: "G-B6KMX3L61E"
};

// Initialize Firebase (using the "compat" SDK loaded via <script> tags in the HTML files)
firebase.initializeApp(firebaseConfig);

// These are used across every page - just import this file first
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
