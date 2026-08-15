// ============================================================
// PREFERENCES.JS
// Remembers your last-used Board/Grade/Subject/Chapter/Topic scope
// (and, for the paper generator, chapters/topics/difficulties as lists)
// so it can be restored automatically next time you open a page.
// Stored per-user in Firestore so it follows you across devices/browsers.
// ============================================================

const PREFERENCES_DOC = () => db.collection("preferences").doc(auth.currentUser.uid);

async function saveScopePreference(data) {
  await PREFERENCES_DOC().set(data, { merge: true });
}

async function loadScopePreference() {
  try {
    const snap = await PREFERENCES_DOC().get();
    return snap.exists ? snap.data() : null;
  } catch (err) {
    console.error("Could not load saved scope:", err);
    return null;
  }
}

// Applies a saved {board, grade, subject, chapter, topic} preference to a set
// of cascading <select> elements — used by both the Add Question form and the
// Question Bank filter bar, since both are single-select cascades. Stops at
// the first level whose saved value no longer exists (e.g. was renamed/deleted).
function applyPreferenceToCascadingSelects(prefs, els) {
  if (!prefs) return;

  function hasOption(select, value) {
    return Array.from(select.options).some((o) => o.value === value);
  }

  if (prefs.board && hasOption(els.board, prefs.board)) {
    els.board.value = prefs.board;
    els.board.dispatchEvent(new Event("change"));
  } else return;

  if (prefs.grade && hasOption(els.grade, prefs.grade)) {
    els.grade.value = prefs.grade;
    els.grade.dispatchEvent(new Event("change"));
  } else return;

  if (prefs.subject && hasOption(els.subject, prefs.subject)) {
    els.subject.value = prefs.subject;
    els.subject.dispatchEvent(new Event("change"));
  } else return;

  if (prefs.chapter && els.chapter && hasOption(els.chapter, prefs.chapter)) {
    els.chapter.value = prefs.chapter;
    els.chapter.dispatchEvent(new Event("change"));
  } else return;

  if (prefs.topic && els.topic && hasOption(els.topic, prefs.topic)) {
    els.topic.value = prefs.topic;
    els.topic.dispatchEvent(new Event("change"));
  }
}
