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
  camera: document.getElementById("scan-camera"),
  crop: document.getElementById("scan-crop"),
  review: document.getElementById("scan-review"),
  uploading: document.getElementById("scan-uploading"),
  done: document.getElementById("scan-done"),
  cancelled: document.getElementById("scan-cancelled")
};

function showStep(name) {
  Object.values(steps).forEach((el) => el.classList.add("hidden"));
  steps[name].classList.remove("hidden");
}

const sessionId = new URL(window.location.href).searchParams.get("session");
let cropper = null;
let sessionRef = null;
let resizedBlob = null; // set once the review step computes the final image
let currentStream = null; // the live camera stream, so we can stop it when done with it

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
      startCamera();
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

// ---------- LIVE CAMERA ----------
async function startCamera() {
  showStep("camera");
  const video = document.getElementById("scan-video");
  const errEl = document.getElementById("camera-error");
  errEl.classList.add("hidden");

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    video.srcObject = currentStream;
  } catch (err) {
    console.error(err);
    errEl.textContent = "Couldn't access the camera — use \"choose a photo from your gallery\" below instead.";
    errEl.classList.remove("hidden");
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
    currentStream = null;
  }
}

document.getElementById("capture-btn").addEventListener("click", () => {
  const video = document.getElementById("scan-video");
  const canvas = document.getElementById("scan-canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  stopCamera();
  openCropStep(canvas.toDataURL("image/jpeg", 0.92));
});

document.getElementById("scan-file-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  stopCamera();
  const reader = new FileReader();
  reader.onload = (ev) => openCropStep(ev.target.result);
  reader.readAsDataURL(file);
});

// ---------- CROP ----------
function openCropStep(imageDataUrl) {
  const img = document.getElementById("scan-crop-image");
  img.src = imageDataUrl;
  showStep("crop");
  if (cropper) cropper.destroy();
  cropper = new Cropper(img, {
    viewMode: 1,
    autoCropArea: 0.5, // start with a smaller, easy-to-drag box instead of the full image
    background: false,
    movable: true,
    cropBoxResizable: true,
    cropBoxMovable: true
  });
}

function resetToCamera() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  document.getElementById("scan-file-input").value = "";
  resizedBlob = null;
  startCamera();
}

document.getElementById("scan-retake-btn").addEventListener("click", resetToCamera);
document.getElementById("scan-review-retake-btn").addEventListener("click", resetToCamera);

document.getElementById("scan-cancel-btn").addEventListener("click", cancelScan);
document.getElementById("scan-review-cancel-btn").addEventListener("click", cancelScan);

function cancelScan() {
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  stopCamera();
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
