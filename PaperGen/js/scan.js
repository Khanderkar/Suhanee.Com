// ============================================================
// SCAN.JS (phone side)
// Self-contained — does not rely on auth.js, since this page has its
// own flow (stay on this page after sign-in, rather than redirecting
// to the dashboard).
// ============================================================

const MAX_DIMENSION = 1400; // longest side, in pixels, after resizing
const JPEG_QUALITY = 0.82;

const steps = {
  signin: document.getElementById("scan-signin"),
  invalid: document.getElementById("scan-invalid"),
  capture: document.getElementById("scan-capture"),
  crop: document.getElementById("scan-crop"),
  review: document.getElementById("scan-review"),
  uploading: document.getElementById("scan-uploading"),
  done: document.getElementById("scan-done"),
  cancelled: document.getElementById("scan-cancelled")
};
const questionInfoBox = document.getElementById("scan-question-info");

function showStep(name) {
  Object.values(steps).forEach((el) => el.classList.add("hidden"));
  steps[name].classList.remove("hidden");
}

const sessionId = new URL(window.location.href).searchParams.get("session");
let cropper = null;
let sessionRef = null;
let resizedBlob = null; // set once the review step computes the final image

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
    try {
      const snap = await sessionRef.get();
      if (!snap.exists || snap.data().status !== "pending") {
        showStep("invalid");
        return;
      }
      renderQuestionInfo(snap.data().questionInfo);
      showStep("capture");
    } catch (err) {
      console.error(err);
      showStep("invalid");
    }
  });
}

function renderQuestionInfo(info) {
  if (!info) {
    questionInfoBox.classList.add("hidden");
    return;
  }
  const crumbs = [info.board, info.grade, info.subject, info.chapter, info.topic].filter(Boolean).join(" · ");
  questionInfoBox.innerHTML = `
    <p class="question-info-crumbs">${crumbs}</p>
    <p class="question-info-type">${info.type === "mcq" ? "Multiple choice" : "Subjective"} · ${info.modeLabel}</p>
  `;
  questionInfoBox.classList.remove("hidden");
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

function resetToCapture() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById("scan-file-input").value = "";
  resizedBlob = null;
  showStep("capture");
}

document.getElementById("scan-retake-btn").addEventListener("click", resetToCapture);
document.getElementById("scan-review-retake-btn").addEventListener("click", resetToCapture);

document.getElementById("scan-cancel-btn").addEventListener("click", cancelScan);
document.getElementById("scan-review-cancel-btn").addEventListener("click", cancelScan);

function cancelScan() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  showStep("cancelled");
}

// Scales a canvas down so its longest side is at most maxDim (never scales up)
function resizeCanvas(sourceCanvas, maxDim) {
  const { width, height } = sourceCanvas;
  const longest = Math.max(width, height);
  if (longest <= maxDim) return sourceCanvas;

  const scale = maxDim / longest;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = Math.round(width * scale);
  outCanvas.height = Math.round(height * scale);
  const ctx = outCanvas.getContext("2d");
  ctx.drawImage(sourceCanvas, 0, 0, outCanvas.width, outCanvas.height);
  return outCanvas;
}

document.getElementById("scan-confirm-btn").addEventListener("click", () => {
  if (!cropper) return;

  const croppedCanvas = cropper.getCroppedCanvas({ maxWidth: 3000, maxHeight: 3000 });
  const finalCanvas = resizeCanvas(croppedCanvas, MAX_DIMENSION);

  finalCanvas.toBlob(
    (blob) => {
      resizedBlob = blob;
      const previewImg = document.getElementById("scan-review-image");
      previewImg.src = URL.createObjectURL(blob);

      const kb = (blob.size / 1024).toFixed(0);
      document.getElementById("scan-review-stats").textContent =
        `${finalCanvas.width} × ${finalCanvas.height} px · ${kb} KB`;

      showStep("review");
    },
    "image/jpeg",
    JPEG_QUALITY
  );
});

document.getElementById("scan-upload-btn").addEventListener("click", async () => {
  if (!resizedBlob) return;
  showStep("uploading");
  try {
    const path = `question-images/${auth.currentUser.uid}/${Date.now()}_scan.jpg`;
    const ref = storage.ref(path);
    await ref.put(resizedBlob);
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
    showStep("review");
  }
});

init();
