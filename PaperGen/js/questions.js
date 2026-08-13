// ============================================================
// QUESTIONS.JS
// Handles: the "Add question" form, uploading images to Storage,
// and the "Question bank" browse/filter/delete view.
// ============================================================

const QUESTIONS_COL = () => db.collection("questions");

let addQuestionCascade = null;
let editingQuestionId = null;
let lastBankFilters = {};

// ---------- ADD QUESTION FORM ----------
function initAddQuestionForm() {
  const form = document.getElementById("question-form");
  if (!form) return;

  addQuestionCascade = wireCascadingSelects(["q-board", "q-grade", "q-subject", "q-chapter", "q-topic"]);

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("save-status");
    statusEl.textContent = editingQuestionId ? "Updating..." : "Saving...";

    try {
      const selection = addQuestionCascade.getSelection();
      if (!selection.board || !selection.grade || !selection.subject || !selection.chapter) {
        statusEl.textContent = "Please fill in Board, Grade, Subject and Chapter.";
        return;
      }

      // Persist any brand-new taxonomy values (e.g. a newly typed chapter/topic) first
      await addQuestionCascade.persistNewValues();

      const type = typeSelect.value;
      const questionText = document.getElementById("q-text").value.trim();
      const marks = Number(document.getElementById("q-marks").value) || 1;
      const difficulty = document.getElementById("q-difficulty").value;

      const data = {
        board: selection.board,
        grade: selection.grade,
        subject: selection.subject,
        chapter: selection.chapter,
        topic: selection.topic || null,
        type,
        questionText,
        marks,
        difficulty
      };

      if (editingQuestionId) {
        data.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        data.createdBy = auth.currentUser.uid;
      }

      if (type === "mcq") {
        const optionEls = mcqBlock.querySelectorAll(".option-text");
        const options = Array.from(optionEls).map((el) => el.value.trim());
        if (options.some((o) => !o)) {
          statusEl.textContent = "Please fill in all 4 options.";
          return;
        }
        const correctIndex = Number(
          mcqBlock.querySelector('input[name="correct-option"]:checked').value
        );
        data.options = options;
        data.correctOption = correctIndex;
        // FieldValue.delete() is only valid on an update/merge, not on a brand-new document
        if (editingQuestionId) data.answerText = firebase.firestore.FieldValue.delete();
      } else {
        data.answerText = document.getElementById("q-answer-text").value.trim();
        if (editingQuestionId) {
          data.options = firebase.firestore.FieldValue.delete();
          data.correctOption = firebase.firestore.FieldValue.delete();
        }
      }

      // Attach an image: prefer a phone-scanned image if one is waiting; otherwise
      // upload a manually-picked file, if any.
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
        }
      }

      if (editingQuestionId) {
        // FieldValue.delete() can't be used on .add(), but is fine on .set()/.update()
        await QUESTIONS_COL().doc(editingQuestionId).set(data, { merge: true });
        statusEl.textContent = "Updated!";
      } else {
        await QUESTIONS_COL().add(data);
        statusEl.textContent = "Saved!";
      }

      const wasEditing = !!editingQuestionId;
      exitEditMode(form, mcqBlock, subjectiveBlock);
      setTimeout(() => (statusEl.textContent = ""), 2000);

      if (wasEditing) {
        refreshBankList();
      }
    } catch (err) {
      console.error(err);
      document.getElementById("save-status").textContent = "Error saving question. See console for details.";
    }
  });
}

// Resets the Add Question form back to its normal "create new" state
function exitEditMode(form, mcqBlock, subjectiveBlock) {
  editingQuestionId = null;
  form.reset();
  mcqBlock.classList.remove("hidden");
  subjectiveBlock.classList.add("hidden");
  document.getElementById("form-heading").textContent = "Add a question";
  document.getElementById("save-btn").textContent = "Save question";
  document.getElementById("cancel-edit-btn").classList.add("hidden");
  document.getElementById("existing-image-note").classList.add("hidden");
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

  document.getElementById("q-text").value = q.questionText || "";
  document.getElementById("q-marks").value = q.marks || 1;
  document.getElementById("q-difficulty").value = q.difficulty || "medium";

  const mcqBlock = document.getElementById("mcq-options");
  if (q.type === "mcq") {
    const optionEls = mcqBlock.querySelectorAll(".option-text");
    (q.options || []).forEach((val, i) => {
      if (optionEls[i]) optionEls[i].value = val;
    });
    const radio = mcqBlock.querySelector(`input[name="correct-option"][value="${q.correctOption}"]`);
    if (radio) radio.checked = true;
  } else {
    document.getElementById("q-answer-text").value = q.answerText || "";
  }

  const imageNote = document.getElementById("existing-image-note");
  if (q.imageURL) {
    imageNote.textContent = "This question already has an image. Uploading a new one will replace it; leave blank to keep it.";
    imageNote.classList.remove("hidden");
  } else {
    imageNote.classList.add("hidden");
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
      </div>
      <p class="q-card-text">${escapeHtml(q.questionText)}</p>
      ${q.imageURL ? `<img class="q-card-image" src="${q.imageURL}" alt="question diagram" />` : ""}
      ${
        q.type === "mcq"
          ? `<ul class="q-card-options">${(q.options || [])
              .map((o, i) => `<li class="${i === q.correctOption ? "correct" : ""}">${escapeHtml(o)}</li>`)
              .join("")}</ul>`
          : `<p class="q-card-answer"><em>Answer key:</em> ${escapeHtml(q.answerText || "—")}</p>`
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
