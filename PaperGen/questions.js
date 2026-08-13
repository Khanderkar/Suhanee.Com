// ============================================================
// QUESTIONS.JS
// Handles: the "Add question" form, uploading images to Storage,
// and the "Question bank" browse/filter/delete view.
// ============================================================

const QUESTIONS_COL = () => db.collection("questions");

let addQuestionCascade = null;

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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const statusEl = document.getElementById("save-status");
    statusEl.textContent = "Saving...";

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
        difficulty,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: auth.currentUser.uid
      };

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
      } else {
        data.answerText = document.getElementById("q-answer-text").value.trim();
      }

      // Upload image if provided
      const imageFile = document.getElementById("q-image").files[0];
      if (imageFile) {
        statusEl.textContent = "Uploading image...";
        const path = `question-images/${auth.currentUser.uid}/${Date.now()}_${imageFile.name}`;
        const ref = storage.ref(path);
        await ref.put(imageFile);
        data.imageURL = await ref.getDownloadURL();
        data.imagePath = path;
      }

      await QUESTIONS_COL().add(data);

      statusEl.textContent = "Saved!";
      form.reset();
      mcqBlock.classList.remove("hidden");
      subjectiveBlock.classList.add("hidden");
      // Re-collapse the cascading dropdowns back to just "Board" enabled
      const boardSelect = document.getElementById("q-board");
      boardSelect.value = "";
      boardSelect.dispatchEvent(new Event("change"));
      setTimeout(() => (statusEl.textContent = ""), 2000);
    } catch (err) {
      console.error(err);
      document.getElementById("save-status").textContent = "Error saving question. See console for details.";
    }
  });
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
    const questions = await loadQuestionsByFilter(filters);
    countEl.textContent = `${questions.length} question(s) found`;
    renderQuestionList(listEl, questions);
  });
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
        <button class="btn-ghost btn-small delete-q" data-id="${q.id}">Delete</button>
      </div>
    `;
    card.querySelector(".delete-q").addEventListener("click", async () => {
      if (!confirm("Delete this question? This can't be undone.")) return;
      await QUESTIONS_COL().doc(q.id).delete();
      card.remove();
    });
    listEl.appendChild(card);
  });
}
