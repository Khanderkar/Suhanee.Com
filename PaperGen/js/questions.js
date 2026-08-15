// ============================================================
// QUESTIONS.JS
// Handles: the "Add question" form, uploading images to Storage,
// and the "Question bank" browse/filter/delete view.
// ============================================================

const QUESTIONS_COL = () => db.collection("questions");

let addQuestionCascade = null;
let editingQuestionId = null;
let lastBankFilters = {};
let clearImageOnSave = false; // set when user clicks "Remove image" on an existing saved image

// ---------- UNIFIED IMAGE PREVIEW (shown right under Question text) ----------
// Used for: a freshly phone-scanned image, a manually-picked file, or an
// existing saved image when editing a question — always the same spot.
function showQuestionImagePreview(url, caption) {
  const wrap = document.getElementById("question-image-preview");
  const img = document.getElementById("question-image-preview-img");
  const captionEl = document.getElementById("question-image-preview-caption");
  img.src = url;
  captionEl.textContent = caption || "";
  wrap.classList.remove("hidden");
}

function hideQuestionImagePreview() {
  const wrap = document.getElementById("question-image-preview");
  const img = document.getElementById("question-image-preview-img");
  wrap.classList.add("hidden");
  img.src = "";
}

// ---------- ADD QUESTION FORM ----------
function initAddQuestionForm() {
  const form = document.getElementById("question-form");
  if (!form) return;

  addQuestionCascade = wireCascadingSelects(["q-board", "q-grade", "q-subject", "q-chapter", "q-topic"]);
  initRichTextToolbars();

  // Restore the last-remembered scope, if any
  loadScopePreference().then((prefs) => {
    applyPreferenceToCascadingSelects(prefs, {
      board: document.getElementById("q-board"),
      grade: document.getElementById("q-grade"),
      subject: document.getElementById("q-subject"),
      chapter: document.getElementById("q-chapter"),
      topic: document.getElementById("q-topic")
    });
  });

  const rememberBtn = document.getElementById("remember-scope-btn");
  const rememberStatus = document.getElementById("remember-scope-status");
  rememberBtn.addEventListener("click", async () => {
    const selection = addQuestionCascade.getSelection();
    rememberStatus.textContent = "Saving...";
    await saveScopePreference({
      board: selection.board || null,
      grade: selection.grade || null,
      subject: selection.subject || null,
      chapter: selection.chapter || null,
      topic: selection.topic || null
    });
    rememberStatus.textContent = "Saved — this will load automatically next time.";
    setTimeout(() => (rememberStatus.textContent = ""), 3000);
  });

  const typeSelect = document.getElementById("q-type");
  const mcqBlock = document.getElementById("mcq-options");
  const subjectiveBlock = document.getElementById("subjective-answer");

  typeSelect.addEventListener("change", () => {
    const isMcq = typeSelect.value === "mcq";
    mcqBlock.classList.toggle("hidden", !isMcq);
    subjectiveBlock.classList.toggle("hidden", isMcq);
  });
  // Sync immediately in case the browser restored a previous selection on reload
  typeSelect.dispatchEvent(new Event("change"));

  document.getElementById("cancel-edit-btn").addEventListener("click", () => {
    exitEditMode(form, mcqBlock, subjectiveBlock);
  });

  // Manually picking a file previews it immediately, and takes priority over
  // any pending phone-scanned image (the most recent choice wins).
  document.getElementById("q-image").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    scannedImageData = null;
    clearImageOnSave = false;
    const reader = new FileReader();
    reader.onload = (ev) => showQuestionImagePreview(ev.target.result, "New image — will be uploaded when you save.");
    reader.readAsDataURL(file);
  });

  document.getElementById("remove-image-btn").addEventListener("click", () => {
    scannedImageData = null;
    clearImageOnSave = true;
    document.getElementById("q-image").value = "";
    hideQuestionImagePreview();
    const qText = document.getElementById("q-text");
    qText.dataset.required = "true";
    qText.dataset.placeholder = "Type the question here...";
  });

  // "Save" — saves, then fully clears the form for a brand-new question
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = await performSave(mcqBlock, typeSelect);
    if (result.ok) {
      exitEditMode(form, mcqBlock, subjectiveBlock);
      if (result.wasEditing) refreshBankList();
    }
  });

  // "Save & Add Another" — saves, then keeps Board/Grade/Subject/Chapter/Topic,
  // question type, question text and answer as-is, ready to tweak into the next one.
  document.getElementById("save-another-btn").addEventListener("click", async () => {
    const result = await performSave(mcqBlock, typeSelect);
    if (result.ok) {
      const wasEditing = result.wasEditing;
      editingQuestionId = null;
      document.getElementById("form-heading").textContent = "Add a question";
      document.getElementById("save-btn").textContent = "Save";
      document.getElementById("cancel-edit-btn").classList.add("hidden");
      clearImageOnSave = false;
      hideQuestionImagePreview();
      // Clear only the image-related state — attaching the same photo to two
      // different questions is rarely intended, everything else stays filled in.
      resetScanState();
      document.getElementById("q-image").value = "";
      if (wasEditing) refreshBankList();
      document.getElementById("q-text").focus();
    }
  });
}

// Runs validation, builds the question data, uploads/attaches any image, and
// writes to Firestore. Shared by both the "Save" and "Save & Add Another" buttons.
// Does NOT touch the form's fields — callers decide what to reset afterward.
async function performSave(mcqBlock, typeSelect) {
  const statusEl = document.getElementById("save-status");
  statusEl.textContent = editingQuestionId ? "Updating..." : "Saving...";

  try {
    const selection = addQuestionCascade.getSelection();
    if (!selection.board || !selection.grade || !selection.subject || !selection.chapter) {
      statusEl.textContent = "Please fill in Board, Grade, Subject and Chapter.";
      return { ok: false };
    }

    // Persist any brand-new taxonomy values (e.g. a newly typed chapter/topic) first
    await addQuestionCascade.persistNewValues();

    const type = typeSelect.value;
    const qTextEl = document.getElementById("q-text");
    const questionText = qTextEl.innerHTML.trim();
    const questionTextPlain = qTextEl.textContent.trim();
    const marks = Number(document.getElementById("q-marks").value) || 1;
    const difficulty = document.getElementById("q-difficulty").value;

    if (!questionTextPlain && qTextEl.dataset.required !== "false") {
      statusEl.textContent = "Please type the question (or switch to a full-question scanned image).";
      return { ok: false };
    }

    const data = {
      board: selection.board,
      grade: selection.grade,
      subject: selection.subject,
      chapter: selection.chapter,
      topic: selection.topic || null,
      type,
      questionText,
      marks,
      difficulty,
      ref: document.getElementById("q-ref").value.trim() || null
    };

    const wasEditing = !!editingQuestionId;

    if (wasEditing) {
      data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      data.createdBy = auth.currentUser.uid;
    }

    if (type === "mcq") {
      const optionEls = mcqBlock.querySelectorAll(".option-text");
      const rawOptions = Array.from(optionEls).map((el) => el.value.trim());

      if (!rawOptions[0] || !rawOptions[1]) {
        statusEl.textContent = "Please fill in at least Options A and B.";
        return { ok: false };
      }

      const correctOriginalIndex = Number(
        mcqBlock.querySelector('input[name="correct-option"]:checked').value
      );
      if (!rawOptions[correctOriginalIndex]) {
        statusEl.textContent = "The option marked as correct is empty — fill it in, or mark a different option as correct.";
        return { ok: false };
      }

      // Only keep options that actually have text (C/D are optional), and
      // remap the correct-answer index to match the resulting shorter list.
      const filled = rawOptions.map((text, idx) => ({ text, idx })).filter((o) => o.text);
      data.options = filled.map((o) => o.text);
      data.correctOption = filled.findIndex((o) => o.idx === correctOriginalIndex);

      // FieldValue.delete() is only valid on an update/merge, not on a brand-new document
      if (wasEditing) data.answerText = firebase.firestore.FieldValue.delete();
    } else {
      data.answerText = document.getElementById("q-answer-text").innerHTML.trim();
      if (wasEditing) {
        data.options = firebase.firestore.FieldValue.delete();
        data.correctOption = firebase.firestore.FieldValue.delete();
      }
    }

    // Attach an image: prefer a phone-scanned image if one is waiting; otherwise
    // upload a manually-picked file, if any; otherwise honor an explicit removal;
    // otherwise leave whatever image is already saved untouched.
    if (scannedImageData) {
      data.imageURL = scannedImageData.url;
      data.imagePath = scannedImageData.path;
    } else {
      const imageFile = document.getElementById("q-image").files[0];
      if (imageFile) {
        statusEl.textContent = "Uploading image...";
        const path = `question-images/${auth.currentUser.uid}/${Date.now()}_${imageFile.name}`;
        const ref = storage.ref(path);
        await ref.put(imageFile);
        data.imageURL = await ref.getDownloadURL();
        data.imagePath = path;
      } else if (clearImageOnSave && wasEditing) {
        data.imageURL = firebase.firestore.FieldValue.delete();
        data.imagePath = firebase.firestore.FieldValue.delete();
      }
    }

    if (wasEditing) {
      // FieldValue.delete() can't be used on .add(), but is fine on .set()/.update()
      await QUESTIONS_COL().doc(editingQuestionId).set(data, { merge: true });
      statusEl.textContent = "Updated!";
    } else {
      await QUESTIONS_COL().add(data);
      statusEl.textContent = "Saved!";
    }

    setTimeout(() => (statusEl.textContent = ""), 2000);
    return { ok: true, wasEditing };
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Error saving question. See console for details.";
    return { ok: false };
  }
}

// ---------- RICH TEXT TOOLBARS (used for Question text + Answer key) ----------
// Uses the browser's built-in execCommand — simple, dependency-free, and
// good enough for bold/italic/underline/lists/super-subscript/symbols.
function initRichTextToolbars() {
  document.querySelectorAll(".rte-toolbar").forEach((toolbar) => {
    const targetId = toolbar.dataset.target;
    const editable = document.getElementById(targetId);
    if (!editable) return;

    toolbar.querySelectorAll("button[data-cmd]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        editable.focus();
        document.execCommand(btn.dataset.cmd, false, btn.dataset.value || null);
      });
    });

    // "Insert fraction" — builds a proper stacked fraction (numerator over
    // denominator), not just a slash, since that's what actually looks right
    // for grade-level math. Asks for the two numbers via simple prompts.
    toolbar.querySelectorAll('button[data-action="fraction"]').forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        editable.focus();
        const numerator = prompt("Numerator (top number):", "1");
        if (numerator === null || numerator.trim() === "") return;
        const denominator = prompt("Denominator (bottom number):", "2");
        if (denominator === null || denominator.trim() === "") return;
        const html =
          `<span class="frac" contenteditable="false">` +
          `<span class="num">${escapeHtml(numerator.trim())}</span>` +
          `<span class="denom">${escapeHtml(denominator.trim())}</span>` +
          `</span>&nbsp;`;
        document.execCommand("insertHTML", false, html);
      });
    });
  });
}

// Resets the Add Question form back to its normal "create new" state
function exitEditMode(form, mcqBlock, subjectiveBlock) {
  editingQuestionId = null;
  form.reset();
  document.getElementById("q-text").innerHTML = "";
  document.getElementById("q-answer-text").innerHTML = "";
  mcqBlock.classList.add("hidden");
  subjectiveBlock.classList.remove("hidden");
  document.getElementById("q-type").value = "subjective";
  document.getElementById("form-heading").textContent = "Add a question";
  document.getElementById("save-btn").textContent = "Save";
  document.getElementById("cancel-edit-btn").classList.add("hidden");
  clearImageOnSave = false;
  hideQuestionImagePreview();
  resetScanState();
  // Re-collapse the cascading dropdowns back to just "Board" enabled
  const boardSelect = document.getElementById("q-board");
  boardSelect.value = "";
  boardSelect.dispatchEvent(new Event("change"));
}

// Loads a question's data into the Add Question form and switches to that tab
function startEditQuestion(q) {
  editingQuestionId = q.id;

  // Switch to the "Add question" tab
  document.querySelector('.nav-btn[data-view="add-question"]').click();

  document.getElementById("form-heading").textContent = "Edit question";
  document.getElementById("save-btn").textContent = "Update question";
  document.getElementById("cancel-edit-btn").classList.remove("hidden");

  const boardSelect = document.getElementById("q-board");
  const gradeSelect = document.getElementById("q-grade");
  const subjectSelect = document.getElementById("q-subject");
  const chapterSelect = document.getElementById("q-chapter");
  const topicSelect = document.getElementById("q-topic");

  boardSelect.value = q.board;
  boardSelect.dispatchEvent(new Event("change"));
  gradeSelect.value = q.grade;
  gradeSelect.dispatchEvent(new Event("change"));
  subjectSelect.value = q.subject;
  subjectSelect.dispatchEvent(new Event("change"));
  chapterSelect.value = q.chapter;
  chapterSelect.dispatchEvent(new Event("change"));
  if (q.topic) {
    topicSelect.value = q.topic;
    topicSelect.dispatchEvent(new Event("change"));
  }

  const typeSelect = document.getElementById("q-type");
  typeSelect.value = q.type;
  typeSelect.dispatchEvent(new Event("change"));

  const qTextEl = document.getElementById("q-text");
  qTextEl.innerHTML = q.questionText || "";
  qTextEl.dataset.required = (!q.questionText && q.imageURL) ? "false" : "true";
  document.getElementById("q-marks").value = q.marks || 1;
  document.getElementById("q-difficulty").value = q.difficulty || "medium";
  document.getElementById("q-ref").value = q.ref || "";

  const mcqBlock = document.getElementById("mcq-options");
  if (q.type === "mcq") {
    const optionEls = mcqBlock.querySelectorAll(".option-text");
    optionEls.forEach((el) => (el.value = "")); // clear stale values first — this question may have fewer than 4 saved options
    (q.options || []).forEach((val, i) => {
      if (optionEls[i]) optionEls[i].value = val;
    });
    const radio = mcqBlock.querySelector(`input[name="correct-option"][value="${q.correctOption}"]`);
    if (radio) radio.checked = true;
  } else {
    document.getElementById("q-answer-text").innerHTML = q.answerText || "";
  }

  clearImageOnSave = false;
  if (q.imageURL) {
    showQuestionImagePreview(q.imageURL, "Existing image — uploading a new one will replace it, or use \"Remove image\" to delete it.");
  } else {
    hideQuestionImagePreview();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ---------- SHARED FILTER BAR (used by Question Bank + Paper Generator) ----------
// Renders Board/Grade/Subject/Chapter/Topic dropdowns with an "All" option (not "add new").
// Calls onChange(filters) whenever a selection changes. filters has null for "All".
function renderFilterBar(containerEl, onChange) {
  containerEl.innerHTML = `
    <div class="grid-5">
      <div class="field"><label>Board</label><select class="f-board"></select></div>
      <div class="field"><label>Grade</label><select class="f-grade"></select></div>
      <div class="field"><label>Subject</label><select class="f-subject"></select></div>
      <div class="field"><label>Chapter</label><select class="f-chapter"></select></div>
      <div class="field"><label>Topic</label><select class="f-topic"></select></div>
    </div>
  `;
  const els = {
    board: containerEl.querySelector(".f-board"),
    grade: containerEl.querySelector(".f-grade"),
    subject: containerEl.querySelector(".f-subject"),
    chapter: containerEl.querySelector(".f-chapter"),
    topic: containerEl.querySelector(".f-topic")
  };

  function fillWithAll(select, values, label) {
    select.innerHTML = `<option value="">All ${label}</option>`;
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function emit() {
    onChange({
      board: els.board.value || null,
      grade: els.grade.value || null,
      subject: els.subject.value || null,
      chapter: els.chapter.value || null,
      topic: els.topic.value || null
    });
  }

  fillWithAll(els.board, getBoards(), "boards");
  fillWithAll(els.grade, [], "grades");
  fillWithAll(els.subject, [], "subjects");
  fillWithAll(els.chapter, [], "chapters");
  fillWithAll(els.topic, [], "topics");

  els.board.addEventListener("change", () => {
    fillWithAll(els.grade, els.board.value ? getGrades(els.board.value) : [], "grades");
    fillWithAll(els.subject, [], "subjects");
    fillWithAll(els.chapter, [], "chapters");
    fillWithAll(els.topic, [], "topics");
    emit();
  });
  els.grade.addEventListener("change", () => {
    fillWithAll(els.subject, els.grade.value ? getSubjects(els.board.value, els.grade.value) : [], "subjects");
    fillWithAll(els.chapter, [], "chapters");
    fillWithAll(els.topic, [], "topics");
    emit();
  });
  els.subject.addEventListener("change", () => {
    fillWithAll(els.chapter, els.subject.value ? getChapters(els.board.value, els.grade.value, els.subject.value) : [], "chapters");
    fillWithAll(els.topic, [], "topics");
    emit();
  });
  els.chapter.addEventListener("change", () => {
    fillWithAll(els.topic, els.chapter.value ? getTopics(els.board.value, els.grade.value, els.subject.value, els.chapter.value) : [], "topics");
    emit();
  });
  els.topic.addEventListener("change", emit);

  emit();

  // Restore the last-remembered scope, if any (set via the Add Question page)
  loadScopePreference().then((prefs) => applyPreferenceToCascadingSelects(prefs, els));
}

// ---------- QUESTION BANK VIEW ----------
async function loadQuestionsByFilter(filters) {
  let query = QUESTIONS_COL();
  ["board", "grade", "subject", "chapter", "topic"].forEach((key) => {
    if (filters[key]) query = query.where(key, "==", filters[key]);
  });
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function initQuestionBankView() {
  const filterBar = document.getElementById("bank-filter-bar");
  const listEl = document.getElementById("bank-list");
  const countEl = document.getElementById("bank-count");
  if (!filterBar) return;

  renderFilterBar(filterBar, async (filters) => {
    lastBankFilters = filters;
    const questions = await loadQuestionsByFilter(filters);
    countEl.textContent = `${questions.length} question(s) found`;
    renderQuestionList(listEl, questions);
  });
}

async function refreshBankList() {
  const listEl = document.getElementById("bank-list");
  const countEl = document.getElementById("bank-count");
  if (!listEl) return;
  const questions = await loadQuestionsByFilter(lastBankFilters);
  countEl.textContent = `${questions.length} question(s) found`;
  renderQuestionList(listEl, questions);
}

function renderQuestionList(listEl, questions) {
  listEl.innerHTML = "";
  if (questions.length === 0) {
    listEl.innerHTML = '<p class="hint">No questions match these filters yet.</p>';
    return;
  }
  questions.forEach((q) => {
    const card = document.createElement("div");
    card.className = "question-card";
    card.innerHTML = `
      <div class="q-card-header">
        <span class="tag">${escapeHtml(q.board)} · ${escapeHtml(q.grade)} · ${escapeHtml(q.subject)}</span>
        <span class="tag tag-muted">${escapeHtml(q.chapter)}${q.topic ? " · " + escapeHtml(q.topic) : ""}</span>
        <span class="tag tag-type">${q.type === "mcq" ? "MCQ" : "Subjective"}</span>
        <span class="tag tag-marks">${q.marks} mark(s)</span>
        ${q.ref ? `<span class="tag tag-ref">Ref: ${escapeHtml(q.ref)}</span>` : ""}
      </div>
      <div class="q-card-text rich-content">${q.questionText || ""}</div>
      ${q.imageURL ? `<img class="q-card-image" src="${q.imageURL}" alt="question diagram" />` : ""}
      ${
        q.type === "mcq"
          ? `<ul class="q-card-options">${(q.options || [])
              .map((o, i) => `<li class="${i === q.correctOption ? "correct" : ""}">${escapeHtml(o)}</li>`)
              .join("")}</ul>`
          : `<div class="q-card-answer"><em>Answer key:</em></div><div class="q-card-answer rich-content">${q.answerText || "—"}</div>`
      }
      <div class="q-card-actions">
        <button class="btn-ghost btn-small edit-q">Edit</button>
        <button class="btn-ghost btn-small delete-q" data-id="${q.id}">Delete</button>
      </div>
    `;
    card.querySelector(".edit-q").addEventListener("click", () => {
      startEditQuestion(q);
    });
    card.querySelector(".delete-q").addEventListener("click", async () => {
      if (!confirm("Delete this question? This can't be undone.")) return;
      await QUESTIONS_COL().doc(q.id).delete();
      card.remove();
    });
    listEl.appendChild(card);
  });
}
