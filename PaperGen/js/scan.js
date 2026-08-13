// ============================================================
// SCAN.JS (phone side)
// Self-contained — does not rely on auth.js, since this page has its
// own flow (stay on this page after sign-in, rather than redirecting
// to the dashboard).
// ============================================================

const steps = {
  signin: document.getElementById("scan-signin"),
  invalid: document.getElementById("scan-invalid"),
  capture: document.getElementById("scan-capture"),
  crop: document.getElementById("scan-crop"),
  uploading: document.getElementById("scan-uploading"),
  done: document.getElementById("scan-done")
};

function showStep(name) {
  Object.values(steps).forEach((el) => el.classList.add("hidden"));
  steps[name].classList.remove("hidden");
}

const sessionId = new URL(window.location.href).searchParams.get("session");
let cropper = null;
let sessionRef = null;

async function init() {
  if (!sessionId) {
    showStep("invalid");
    return;
  }
  sessionRef = db.collection("photoSessions").doc(sessionId);

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showStep("signin");
      return;
    }
    // Confirm the session still exists and hasn't already been used
    try {
      const snap = await sessionRef.get();
      if (!snap.exists || snap.data().status !== "pending") {
        showStep("invalid");
        return;
      }
      showStep("capture");
    } catch (err) {
      console.error(err);
      showStep("invalid");
    }
  });
}

document.getElementById("scan-google-btn").addEventListener("click", async () => {
  const errEl = document.getElementById("scan-auth-error");
  errEl.classList.add("hidden");
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await auth.signInWithPopup(provider);
    // onAuthStateChanged above will take it from here
  } catch (err) {
    errEl.textContent = "Sign-in failed: " + err.message;
    errEl.classList.remove("hidden");
  }
});

document.getElementById("scan-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = document.getElementById("scan-crop-image");
    img.src = ev.target.result;
    showStep("crop");
    if (cropper) cropper.destroy();
    cropper = new Cropper(img, {
      viewMode: 1,
      autoCropArea: 1,
      background: false
    });
  };
  reader.readAsDataURL(file);
});

document.getElementById("scan-retake-btn").addEventListener("click", () => {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById("scan-file-input").value = "";
  showStep("capture");
});

document.getElementById("scan-confirm-btn").addEventListener("click", () => {
  if (!cropper) return;
  const canvas = cropper.getCroppedCanvas({ maxWidth: 1600, maxHeight: 1600 });
  canvas.toBlob(async (blob) => {
    showStep("uploading");
    try {
      const path = `question-images/${auth.currentUser.uid}/${Date.now()}_scan.jpg`;
      const ref = storage.ref(path);
      await ref.put(blob);
      const url = await ref.getDownloadURL();

      await sessionRef.update({
        status: "uploaded",
        imageURL: url,
        imagePath: path,
        uploadedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      showStep("done");
    } catch (err) {
      console.error(err);
      alert("Upload failed: " + err.message);
      showStep("crop");
    }
  }, "image/jpeg", 0.9);
});

init();
