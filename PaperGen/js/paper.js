// ============================================================
// PAPER.JS
// The random paper generator: pick a scope (board/grade/subject/...),
// how many MCQs + subjective questions, and produce a shuffled,
// printable paper with a hideable answer key.
//
// Live counts: whenever Board/Grade/Subject is chosen, we fetch every
// question in that scope ONCE (subjectPool) and then compute all the
// per-chapter / per-topic / per-difficulty counts from that in-memory
// list — so ticking checkboxes updates counts instantly with no extra
// Firestore reads.
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

// Fetches every question in a Board/Grade/Subject scope — the only
// server-side filtering we do; everything else is computed client-side.
async function fetchSubjectPool(board, grade, subject) {
  let query = QUESTIONS_COL();
  if (board) query = query.where("board", "==", board);
  if (grade) query = query.where("grade", "==", grade);
  if (subject) query = query.where("subject", "==", subject);
  const snap = await query.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadQuestionsForPaper(filters) {
  let results = await fetchSubjectPool(filters.board, filters.grade, filters.subject);
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

// ---------- PAPER FILTER BAR (Board/Grade/Subject single-select, everything else multi-select with live counts) ----------
function renderPaperFilterBar(containerEl, onChange) {
  containerEl.innerHTML = `
    <div class="grid-3">
      <div class="field"><label>Board</label><select class="pf-board"><option value="">All boards</option></select></div>
      <div class="field"><label>Grade</label><select class="pf-grade"><option value="">All grades</option></select></div>
      <div class="field"><label>Subject</label><select class="pf-subject"><option value="">All subjects</option></select></div>
    </div>
    <div class="field">
      <label>Chapters <span class="hint-inline">(leave all unticked to include every chapter)</span></label>
      <div class="checkbox-grid checkbox-grid-vertical pf-chapters"><p class="hint">Choose a subject first.</p></div>
    </div>
    <div class="field">
      <label>Topics <span class="hint-inline">(leave all unticked to include every topic)</span></label>
      <div class="checkbox-grid checkbox-grid-vertical pf-topics"><p class="hint">Choose a subject first.</p></div>
    </div>
    <div class="field">
      <label>Difficulty <span class="hint-inline">(leave all unticked to include every difficulty)</span></label>
      <div class="checkbox-grid pf-difficulty"></div>
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

  let subjectPool = [];

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

  // Renders a checkbox list with a live "(n)" count after each label
  function fillCheckboxGridWithCounts(container, values, counts, emptyMessage) {
    if (values.length === 0) {
      container.innerHTML = `<p class="hint">${emptyMessage}</p>`;
      return;
    }
    container.innerHTML = values
      .map((v) => {
        const count = counts[v] || 0;
        return `<label class="checkbox-inline"><input type="checkbox" value="${escapeHtml(v)}" /> ${escapeHtml(v)} <span class="count-badge">(${count})</span></label>`;
      })
      .join("");
  }

  async function refreshSubjectPool() {
    subjectPool = await fetchSubjectPool(els.board.value || null, els.grade.value || null, els.subject.value || null);
  }

  function rebuildChapters() {
    const chapters = els.subject.value ? getChapters(els.board.value, els.grade.value, els.subject.value) : [];
    const counts = {};
    chapters.forEach((ch) => {
      counts[ch] = subjectPool.filter((q) => q.chapter === ch).length;
    });
    fillCheckboxGridWithCounts(els.chapters, chapters, counts, "Choose a subject first.");
    els.chapters.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        rebuildTopics();
        emit();
      })
    );
    rebuildTopics();
  }

  function rebuildTopics() {
    const selectedChapters = checkedValues(els.chapters);
    const chaptersToUse = selectedChapters.length ? selectedChapters : getChapters(els.board.value, els.grade.value, els.subject.value);
    const poolForChapters = subjectPool.filter((q) => chaptersToUse.includes(q.chapter));

    const topicSet = new Set();
    chaptersToUse.forEach((ch) => {
      getTopics(els.board.value, els.grade.value, els.subject.value, ch).forEach((t) => topicSet.add(t));
    });
    const topics = Array.from(topicSet).sort();
    const counts = {};
    topics.forEach((t) => {
      counts[t] = poolForChapters.filter((q) => q.topic === t).length;
    });
    fillCheckboxGridWithCounts(els.topics, topics, counts, "No topics yet for this selection.");
    els.topics.querySelectorAll('input[type="checkbox"]').forEach((cb) =>
      cb.addEventListener("change", () => {
        rebuildDifficulty();
        emit();
      })
    );
    rebuildDifficulty();
  }

  // The pool implied by whatever chapters/topics are currently ticked —
  // used to compute how many Easy/Medium/Hard questions are in that scope.
  function scopedPool() {
    const selectedChapters = checkedValues(els.chapters);
    const selectedTopics = checkedValues(els.topics);
    let pool = subjectPool;
    if (selectedChapters.length) pool = pool.filter((q) => selectedChapters.includes(q.chapter));
    if (selectedTopics.length) pool = pool.filter((q) => q.topic && selectedTopics.includes(q.topic));
    return pool;
  }

  // scopedPool() further narrowed by whatever difficulty levels are ticked —
  // this is the exact pool the paper generator will draw from.
  function finalScopedPool() {
    const selectedDifficulties = checkedValues(els.difficulty);
    let pool = scopedPool();
    if (selectedDifficulties.length) pool = pool.filter((q) => selectedDifficulties.includes(q.difficulty));
    return pool;
  }

  function rebuildDifficulty() {
    const pool = scopedPool();
    const counts = { easy: 0, medium: 0, hard: 0 };
    pool.forEach((q) => {
      if (counts[q.difficulty] !== undefined) counts[q.difficulty]++;
    });
    els.difficulty.innerHTML = ["easy", "medium", "hard"]
      .map((level) => {
        const label = level.charAt(0).toUpperCase() + level.slice(1);
        return `<label class="checkbox-inline"><input type="checkbox" value="${level}" /> ${label} <span class="count-badge">(${counts[level]})</span></label>`;
      })
      .join("");
    els.difficulty.querySelectorAll('input[type="checkbox"]').forEach((cb) => cb.addEventListener("change", emit));
  }

  function emit() {
    const finalPool = finalScopedPool();
    const mcqCount = finalPool.filter((q) => q.type === "mcq").length;
    const subjCount = finalPool.filter((q) => q.type === "subjective").length;
    const mcqLabel = document.getElementById("label-num-mcq");
    const subjLabel = document.getElementById("label-num-subjective");
    if (mcqLabel) mcqLabel.textContent = `Number of MCQs (${mcqCount} available)`;
    if (subjLabel) subjLabel.textContent = `Number of subjective (${subjCount} available)`;

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

  els.board.addEventListener("change", async () => {
    fillSelectSimple(els.grade, els.board.value ? getGrades(els.board.value) : [], "All grades");
    fillSelectSimple(els.subject, [], "All subjects");
    await refreshSubjectPool();
    rebuildChapters();
    emit();
  });
  els.grade.addEventListener("change", async () => {
    fillSelectSimple(els.subject, els.grade.value ? getSubjects(els.board.value, els.grade.value) : [], "All subjects");
    await refreshSubjectPool();
    rebuildChapters();
    emit();
  });
  els.subject.addEventListener("change", async () => {
    await refreshSubjectPool();
    rebuildChapters();
    emit();
  });

  (async () => {
    await refreshSubjectPool();
    rebuildChapters();
    emit();
  })();
}

// Builds a clean, nested "Chapter: its topics" summary for the paper header,
// instead of two disconnected flat lists. Truncates long selections so the
// header doesn't sprawl.
function buildScopeSummary() {
  const chapters = paperFilters.chapters && paperFilters.chapters.length ? paperFilters.chapters : null;
  const topics = paperFilters.topics && paperFilters.topics.length ? paperFilters.topics : null;
  const difficulties = paperFilters.difficulties && paperFilters.difficulties.length ? paperFilters.difficulties : null;

  let scopeHtml = "";

  if (chapters) {
    const MAX_SHOWN = 4;
    const lines = chapters.slice(0, MAX_SHOWN).map((ch) => {
      const chapterTopics = getTopics(paperFilters.board, paperFilters.grade, paperFilters.subject, ch);
      const selectedForThisChapter = topics ? chapterTopics.filter((t) => topics.includes(t)) : [];
      return selectedForThisChapter.length
        ? `<strong>${escapeHtml(ch)}</strong> (${selectedForThisChapter.map(escapeHtml).join(", ")})`
        : `<strong>${escapeHtml(ch)}</strong>`;
    });
    const extra = chapters.length - MAX_SHOWN;
    const line = lines.join(" &nbsp;•&nbsp; ") + (extra > 0 ? ` &nbsp;+${extra} more chapter${extra > 1 ? "s" : ""}` : "");
    scopeHtml += `<p class="scope-line">${line}</p>`;
  } else if (topics) {
    scopeHtml += `<p class="scope-line">Topics: ${topics.map(escapeHtml).join(", ")}</p>`;
  }

  if (difficulties) {
    scopeHtml += `<p class="scope-line">Difficulty: ${difficulties.map(escapeHtml).join(", ")}</p>`;
  }

  return scopeHtml;
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
        ${buildScopeSummary()}
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
            <div class="question-row">
              <div class="rich-content question-inline">${q.questionText || ""}</div>
              <span class="marks-tag">[${q.marks}]</span>
            </div>
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
            <div class="question-row">
              <div class="rich-content question-inline">${q.questionText || ""}</div>
              <span class="marks-tag">[${q.marks}]</span>
            </div>
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
