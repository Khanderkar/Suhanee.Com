// ============================================================
// APP.JS
// Wires up the sidebar navigation and kicks off each view's setup
// once the user is confirmed logged in and taxonomy data is loaded.
// ============================================================

const navButtons = document.querySelectorAll(".nav-btn");
const views = document.querySelectorAll(".view");

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    navButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    views.forEach((v) => v.classList.add("hidden"));
    document.getElementById("view-" + btn.dataset.view).classList.remove("hidden");

    // Refresh the "manage categories" tree whenever that tab is opened,
    // since it might have changed since last loaded.
    if (btn.dataset.view === "manage-categories") {
      renderTaxonomyTree(document.getElementById("taxonomy-tree"));
    }
  });
});

// Only run dashboard setup once we know a user is logged in
if (document.getElementById("user-email")) {
  auth.onAuthStateChanged(async (user) => {
    if (!user) return; // auth.js already redirects to login
    await loadTaxonomy();
    initAddQuestionForm();
    initQrScan();
    initQuestionBankView();
    initPaperGeneratorView();
  });
}
