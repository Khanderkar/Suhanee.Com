// ============================================================
// PAPER.JS
// The random paper generator: pick a scope (board/grade/subject/...),
// how many MCQs + subjective questions, and produce a shuffled,
// printable paper with a hideable answer key.
// ============================================================

let paperFilters = { board: null, grade: null, subject: null, chapters: [], topics: [], difficulties: [] };

function initPaperGeneratorView() {
  const filterBar = document.getElementById("paper-filter-bar");
  const generateBtn = document.getElementById("generate-btn");
  if (!filterBar) return;

  renderPaperFilterBar(filterBar, (filters) => {
    paperFilters = filters;
  });

  generateBtn.addEventListener("click", async () => {
    const outputEl = document.getElementById("paper-output");
    outputEl.innerHTML = '<p class="hint">Generating...</p>';

    const numMcq = Number(document.getElementById("p-num-mcq").value) || 0;
    const numSubjective = Number(document.getElementById("p-num-subjective").value) || 0;

    const allMatching = await loadQuestionsForPaper(paperFilters);
    const mcqPool = allMatching.filter((q) => q.type === "mcq");
    const subjectivePool = allMatching.filter((q) => q.type === "subjective");

    const chosenMcq = sampleRandom(mcqPool, numMcq);
    const chosenSubjective = sampleRandom(subjectivePool, numSubjective);

    if (chosenMcq.length < numMcq || chosenSubjective.length < numSubjective) {
      outputEl.innerHTML = `<p class="warning-banner">
        Only found ${mcqPool.length} MCQ(s) and ${subjectivePool.length} subjective question(s) matching this scope —
        generated with what's available. Add more questions to this scope, or widen the filters, for a full paper.
      </p>`;
    } else {
      outputEl.innerHTML = "";
    }

    renderPaper(outputEl, chosenMcq, chosenSubjective);
  });
}

// ---------- PAPER FILTER BAR (Board/Grade/Subject single-select, everything else multi-select) ----------
function renderPaperFilterBar(containerEl, onChange) {
  containerEl.innerHTML = `
    <div class="grid-3">
      <div class="field"><label>Board</label><select class="pf-board"><option value="">All boards</option></select></div>
      <div class="field"><label>Grade</label><select class="pf-grade"><option value="">All grades</option></select></div>
      <div class="field"><label>Subject</label><select class="pf-subject"><option value="">All subjects</option></select></div>
    </div>
    <div class="field">
      <label>Chapters <span class="hint-inline">(leave all unticked to include every chapter)</span></label>
      <div class="checkbox-grid pf-chapters"><p class="hint">Choose a subject first.</p></div>
    </div>
    <div class="field">
      <label>Topics <span class="hint-inline">(leave all unticked to include every topic)</span></label>
      <div class="checkbox-grid pf-topics"><p class="hint">Choose a subject first.</p></div>
    </div>
    <div class="field">
      <label>Difficulty <span class="hint-inline">(leave all unticked to include every difficulty)</span></label>
      <div class="checkbox-grid pf-difficulty">
        <label class="checkbox-inline"><input type="checkbox" value="easy" /> Easy</label>
        <label class="checkbox-inline"><input type="checkbox" value="medium" /> Medium</label>
        <label class="checkbox-inline"><input type="checkbox" value="hard" /> Hard</label>
      </div>
    </div>
  `;

  const els = {
    board: containerEl.querySelector(".pf-board"),
    grade: containerEl.querySelector(".pf-grade"),
    subject: containerEl.querySelector(".pf-subject"),
    chapters: containerEl.querySelector(".pf-chapters"),
    topics: containerEl.querySelector(".pf-topics"),
    difficulty: containerEl.querySelector(".pf-difficulty")
  };

  function fillSelectSimple(select, values, placeholder) {
    select.innerHTML = `<option value="">${placeholder}</option>`;
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  }

  function checkedValues(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }

  function fillCheckboxGrid(container, values, emptyMessage) {
    if (values.length === 0) {
      container.innerHTML = `<p class="hint">${emptyMessage}</p>`;
      return;
    }
    container.innerHTML = values
      .map((v) => `<label class="checkbox-inline"><input type="checkbox" value="${escapeHtml(v)}" /> ${escapeHtml(v)}</label>`)
      .join("");
  }

  function rebuildTopics() {
    const selectedChapters = checkedValues(els.chapters);
    const chaptersToUse = selectedChapters.length ? selectedChapters : getChapters(els.board.value, els.grade.value, els.subject.value);
    const topicSet = new Set();
    chaptersToUse.forEach((ch) => {
      getTopics(els.board.value, els.grade.value, els.subject.value, ch).forEach((t) => topicSet.add(t));
    });
    fillCheckboxGrid(els.topics, Array.from(topicSet).sort(), "No topics yet for this selection.");
    els.topics.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", emit));
  }

  function rebuildChapters() {
    const chapters = els.subject.value ? getChapters(els.board.value, els.grade.value, els.subject.value) : [];
    fillCheckboxGrid(els.chapters, chapters, "Choose a subject first.");
    els.chapters.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        rebuildTopics();
        emit();
      })
    );
    rebuildTopics();
  }

  function emit() {
    onChange({
      board: els.board.value || null,
      grade: els.grade.value || null,
      subject: els.subject.value || null,
      chapters: checkedValues(els.chapters),
      topics: checkedValues(els.topics),
      difficulties: checkedValues(els.difficulty)
    });
  }

  fillSelectSimple(els.board, getBoards(), "All boards");
  fillSelectSimple(els.grade, [], "All grades");
  fillSelectSimple(els.subject, [], "All subjects");

  els.board.addEventListener("change", () => {
    fillSelectSimple(els.grade, els.board.value ? getGrades(els.board.value) : [], "All grades");
    fillSelectSimple(els.subject, [], "All subjects");
    rebuildChapters();
    emit();
  });
  els.grade.addEventListener("change", () => {
    fillSelectSimple(els.subject, els.grade.value ? getSubjects(els.board.value, els.grade.value) : [], "All subjects");
    rebuildChapters();
    emit();
  });
  els.subject.addEventListener("change", () => {
    rebuildChapters();
    emit();
  });
  els.difficulty.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", emit));

  rebuildChapters();
  emit();
}

// Fetches by Board/Grade/Subject on the server (cheap equality filters), then
// narrows by chapter/topic/difficulty on the client — simplest way to support
// multi-select without needing Firestore composite indexes.
async function loadQuestionsForPaper(filters) {
  let query = QUESTIONS_COL();
  if (filters.board) query = query.where("board", "==", filters.board);
  if (filters.grade) query = query.where("grade", "==", filters.grade);
  if (filters.subject) query = query.where("subject", "==", filters.subject);

  const snap = await query.get();
  let results = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (filters.chapters && filters.chapters.length) {
    results = results.filter((q) => filters.chapters.includes(q.chapter));
  }
  if (filters.topics && filters.topics.length) {
    results = results.filter((q) => q.topic && filters.topics.includes(q.topic));
  }
  if (filters.difficulties && filters.difficulties.length) {
    results = results.filter((q) => filters.difficulties.includes(q.difficulty));
  }
  return results;
}

function sampleRandom(pool, count) {
  const shuffled = pool.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function renderPaper(outputEl, mcqQuestions, subjectiveQuestions) {
  const totalMarks =
    mcqQuestions.reduce((sum, q) => sum + q.marks, 0) +
    subjectiveQuestions.reduce((sum, q) => sum + q.marks, 0);

  const paperWrap = document.createElement("div");
  paperWrap.className = "paper-wrap";
  paperWrap.innerHTML = `
    <div class="paper-toolbar no-print">
      <button id="regen-btn" class="btn-ghost">Shuffle again</button>
      <label class="toggle-label"><input type="checkbox" id="show-answers" /> Show answer key</label>
      <button id="print-btn" class="btn-primary">Print / Save as PDF</button>
    </div>

    <div class="paper-sheet" id="printable-paper">
      <div class="paper-header">
        <h2>${escapeHtml(paperFilters.subject || "Exam")} Practice Paper</h2>
        <p>
          ${[paperFilters.board, paperFilters.grade, paperFilters.subject]
            .filter(Boolean)
            .map(escapeHtml)
            .join(" · ") || "Mixed scope"}
        </p>
        ${paperFilters.chapters && paperFilters.chapters.length ? `<p class="scope-line">Chapters: ${paperFilters.chapters.map(escapeHtml).join(", ")}</p>` : ""}
        ${paperFilters.topics && paperFilters.topics.length ? `<p class="scope-line">Topics: ${paperFilters.topics.map(escapeHtml).join(", ")}</p>` : ""}
        ${paperFilters.difficulties && paperFilters.difficulties.length ? `<p class="scope-line">Difficulty: ${paperFilters.difficulties.map(escapeHtml).join(", ")}</p>` : ""}
        <p>Total marks: ${totalMarks}</p>
      </div>

      <div class="candidate-strip">
        <span>Name: <i></i></span>
        <span>Date: <i></i></span>
        <span>Time allowed: <i></i></span>
      </div>

      ${mcqQuestions.length ? `<h3>Section A — Multiple Choice</h3>` : ""}
      <ol class="paper-questions">
        ${mcqQuestions
          .map(
            (q, i) => `
          <li>
            <div class="rich-content question-inline"><span class="marks-tag">[${q.marks}]</span> ${q.questionText || ""}</div>
            ${q.imageURL ? `<img class="q-card-image" src="${q.imageURL}" alt="" />` : ""}
            <ol type="A" class="mcq-options">
              ${q.options.map((o, oi) => `<li class="${oi === q.correctOption ? "answer-highlight" : ""}">${escapeHtml(o)}</li>`).join("")}
            </ol>
          </li>`
          )
          .join("")}
      </ol>

      ${subjectiveQuestions.length ? `<h3>Section B — Subjective</h3>` : ""}
      <ol class="paper-questions" start="${mcqQuestions.length + 1}">
        ${subjectiveQuestions
          .map(
            (q) => `
          <li>
            <div class="rich-content question-inline"><span class="marks-tag">[${q.marks}]</span> ${q.questionText || ""}</div>
            ${q.imageURL ? `<img class="q-card-image" src="${q.imageURL}" alt="" />` : ""}
            <div class="answer-highlight answer-only"><em>Answer key:</em> <span class="rich-content">${q.answerText || "—"}</span></div>
          </li>`
          )
          .join("")}
      </ol>
    </div>
  `;

  outputEl.innerHTML = "";
  outputEl.appendChild(paperWrap);

  const showAnswersCheckbox = paperWrap.querySelector("#show-answers");
  showAnswersCheckbox.addEventListener("change", () => {
    paperWrap.querySelectorAll(".answer-highlight").forEach((el) => {
      el.classList.toggle("answer-visible", showAnswersCheckbox.checked);
    });
  });

  paperWrap.querySelector("#print-btn").addEventListener("click", () => {
    window.print();
  });

  paperWrap.querySelector("#regen-btn").addEventListener("click", () => {
    document.getElementById("generate-btn").click();
  });
}
