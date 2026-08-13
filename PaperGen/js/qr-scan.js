// ============================================================
// QR-SCAN.JS (PC side)
// Handles the "Scan from phone" button on the Add Question form:
// - Creates a photoSessions doc in Firestore
// - Shows a QR code pointing the phone to scan.html?session=<id>
// - Listens live for the phone to finish uploading + cropping
// - Drops the resulting image straight into the form
// ============================================================

const PHOTO_SESSIONS_COL = () => db.collection("photoSessions");

let scannedImageData = null; // { url, path } once a phone upload completes
let activeSessionUnsubscribe = null;

function initQrScan() {
  const scanBtn = document.getElementById("scan-phone-btn");
  if (!scanBtn) return;

  const modal = document.getElementById("qr-modal");
  const qrImg = document.getElementById("qr-code-img");
  const qrStatus = document.getElementById("qr-status");
  const cancelBtn = document.getElementById("qr-cancel-btn");
  const previewWrap = document.getElementById("scanned-preview");
  const previewImg = document.getElementById("scanned-preview-img");
  const removeBtn = document.getElementById("remove-scanned-btn");

  scanBtn.addEventListener("click", async () => {
    const mode = document.querySelector('input[name="scan-mode"]:checked').value;

    const sessionRef = await PHOTO_SESSIONS_COL().add({
      status: "pending",
      mode,
      imageURL: null,
      imagePath: null,
      createdBy: auth.currentUser.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    const scanUrl = new URL("scan.html", window.location.href);
    scanUrl.searchParams.set("session", sessionRef.id);

    qrImg.src = "https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=" + encodeURIComponent(scanUrl.toString());
    qrStatus.textContent = "Waiting for your phone...";
    modal.classList.remove("hidden");

    if (activeSessionUnsubscribe) activeSessionUnsubscribe();
    activeSessionUnsubscribe = sessionRef.onSnapshot((snap) => {
      const data = snap.data();
      if (!data) return;
      if (data.status === "uploaded") {
        scannedImageData = { url: data.imageURL, path: data.imagePath };
        previewImg.src = data.imageURL;
        previewWrap.classList.remove("hidden");
        applyScanMode(mode);
        modal.classList.add("hidden");
        activeSessionUnsubscribe();
        activeSessionUnsubscribe = null;
      }
    });
  });

  cancelBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    if (activeSessionUnsubscribe) {
      activeSessionUnsubscribe();
      activeSessionUnsubscribe = null;
    }
  });

  removeBtn.addEventListener("click", () => {
    scannedImageData = null;
    previewWrap.classList.add("hidden");
    previewImg.src = "";
    const qText = document.getElementById("q-text");
    qText.required = true;
    qText.placeholder = "Type the question here...";
  });
}

// When the scanned image is meant to BE the whole question, the typed
// question text becomes optional rather than required.
function applyScanMode(mode) {
  const qText = document.getElementById("q-text");
  if (mode === "full") {
    qText.required = false;
    qText.placeholder = "Optional — the scanned image contains the full question";
  } else {
    qText.required = true;
    qText.placeholder = "Type the question here...";
  }
}

// Clears scan state when the form is reset (new question / cancel edit)
function resetScanState() {
  scannedImageData = null;
  const previewWrap = document.getElementById("scanned-preview");
  const previewImg = document.getElementById("scanned-preview-img");
  if (previewWrap) previewWrap.classList.add("hidden");
  if (previewImg) previewImg.src = "";
  const qText = document.getElementById("q-text");
  if (qText) {
    qText.required = true;
    qText.placeholder = "Type the question here...";
  }
  const fullRadio = document.querySelector('input[name="scan-mode"][value="partial"]');
  if (fullRadio) fullRadio.checked = true;
}
