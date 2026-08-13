// ============================================================
// PAPER.JS
// The random paper generator: pick a scope (board/grade/subject/...),
// how many MCQs + subjective questions, and produce a shuffled,
// printable paper with a hideable answer key.
// ============================================================

let paperFilters = {};

function initPaperGeneratorView() {
  const filterBar = document.getElementById("paper-filter-bar");
  const generateBtn = document.getElementById("generate-btn");
  if (!filterBar) return;

  renderFilterBar(filterBar, (filters) => {
    paperFilters = filters;
  });

  generateBtn.addEventListener("click", async () => {
    const outputEl = document.getElementById("paper-output");
    outputEl.innerHTML = '<p class="hint">Generating...</p>';

    const numMcq = Number(document.getElementById("p-num-mcq").value) || 0;
    const numSubjective = Number(document.getElementById("p-num-subjective").value) || 0;

    const allMatching = await loadQuestionsByFilter(paperFilters);
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
          ${[paperFilters.board, paperFilters.grade, paperFilters.chapter, paperFilters.topic]
            .filter(Boolean)
            .map(escapeHtml)
            .join(" · ") || "Mixed scope"}
        </p>
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
