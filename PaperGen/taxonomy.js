// ============================================================
// TAXONOMY.JS
// Manages the Board -> Grade -> Subject -> Chapter -> Topics tree.
// Stored as ONE small document at taxonomy/data so it's cheap to
// read and simple to edit (read whole tree, change it, write it back).
// ============================================================

const TAXONOMY_DOC = () => db.collection("taxonomy").doc("data");
const NEW_VALUE = "__new__";

let taxonomyCache = null; // { boards: { board: { grades: { grade: { subjects: { subject: { chapters: { chapter: { topics: [..] } } } } } } } } }

async function loadTaxonomy() {
  const snap = await TAXONOMY_DOC().get();
  taxonomyCache = snap.exists ? snap.data() : { boards: {} };
  if (!taxonomyCache.boards) taxonomyCache.boards = {};
  return taxonomyCache;
}

async function saveTaxonomy() {
  await TAXONOMY_DOC().set(taxonomyCache);
}

function getBoards() {
  return Object.keys(taxonomyCache.boards).sort();
}
function getGrades(board) {
  const b = taxonomyCache.boards[board];
  return b ? Object.keys(b.grades || {}).sort() : [];
}
function getSubjects(board, grade) {
  const g = taxonomyCache.boards[board]?.grades?.[grade];
  return g ? Object.keys(g.subjects || {}).sort() : [];
}
function getChapters(board, grade, subject) {
  const s = taxonomyCache.boards[board]?.grades?.[grade]?.subjects?.[subject];
  return s ? Object.keys(s.chapters || {}).sort() : [];
}
function getTopics(board, grade, subject, chapter) {
  const c = taxonomyCache.boards[board]?.grades?.[grade]?.subjects?.[subject]?.chapters?.[chapter];
  return c ? (c.topics || []).slice().sort() : [];
}

async function addBoard(board) {
  if (!taxonomyCache.boards[board]) taxonomyCache.boards[board] = { grades: {} };
  await saveTaxonomy();
}
async function addGrade(board, grade) {
  await addBoard(board);
  const b = taxonomyCache.boards[board];
  if (!b.grades[grade]) b.grades[grade] = { subjects: {} };
  await saveTaxonomy();
}
async function addSubject(board, grade, subject) {
  await addGrade(board, grade);
  const g = taxonomyCache.boards[board].grades[grade];
  if (!g.subjects[subject]) g.subjects[subject] = { chapters: {} };
  await saveTaxonomy();
}
async function addChapter(board, grade, subject, chapter) {
  await addSubject(board, grade, subject);
  const s = taxonomyCache.boards[board].grades[grade].subjects[subject];
  if (!s.chapters[chapter]) s.chapters[chapter] = { topics: [] };
  await saveTaxonomy();
}
async function addTopic(board, grade, subject, chapter, topic) {
  await addChapter(board, grade, subject, chapter);
  const c = taxonomyCache.boards[board].grades[grade].subjects[subject].chapters[chapter];
  if (!c.topics.includes(topic)) c.topics.push(topic);
  await saveTaxonomy();
}

// ---- Populating a <select> with options + a "+ Add new" entry ----
function fillSelect(selectEl, values, placeholder) {
  selectEl.innerHTML = "";
  const optPlaceholder = document.createElement("option");
  optPlaceholder.value = "";
  optPlaceholder.textContent = placeholder;
  selectEl.appendChild(optPlaceholder);

  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    selectEl.appendChild(opt);
  });

  const optNew = document.createElement("option");
  optNew.value = NEW_VALUE;
  optNew.textContent = "+ Add new...";
  selectEl.appendChild(optNew);
}

// ---- Wires up the cascading Board -> Grade -> Subject -> Chapter -> Topic selects ----
// Pass in the 5 <select> elements (in order) and it handles everything, including
// inline "add new" text boxes that sit right after each select (id = selectId + "-new").
function wireCascadingSelects(ids) {
  const [boardId, gradeId, subjectId, chapterId, topicId] = ids;
  const els = {
    board: document.getElementById(boardId),
    grade: document.getElementById(gradeId),
    subject: document.getElementById(subjectId),
    chapter: document.getElementById(chapterId),
    topic: document.getElementById(topicId)
  };
  const newInputs = {
    board: document.getElementById(boardId + "-new"),
    grade: document.getElementById(gradeId + "-new"),
    subject: document.getElementById(subjectId + "-new"),
    chapter: document.getElementById(chapterId + "-new"),
    topic: document.getElementById(topicId + "-new")
  };

  function resetBelow(level) {
    const order = ["board", "grade", "subject", "chapter", "topic"];
    const idx = order.indexOf(level);
    order.slice(idx + 1).forEach((l) => {
      els[l].innerHTML = '<option value="">Select above first</option>';
      els[l].disabled = true;
      newInputs[l].classList.add("hidden");
      newInputs[l].value = "";
    });
  }

  function currentValue(level) {
    if (els[level].value === NEW_VALUE) return newInputs[level].value.trim();
    return els[level].value;
  }

  fillSelect(els.board, getBoards(), "Select board");
  resetBelow("board");

  els.board.addEventListener("change", () => {
    newInputs.board.classList.toggle("hidden", els.board.value !== NEW_VALUE);
    resetBelow("board");
    const board = currentValue("board");
    if (els.board.value === NEW_VALUE) return; // wait until they type the new name
    els.grade.disabled = false;
    fillSelect(els.grade, getGrades(board), "Select grade");
  });

  newInputs.board.addEventListener("input", () => {
    els.grade.disabled = false;
    fillSelect(els.grade, [], "Select grade");
  });

  els.grade.addEventListener("change", () => {
    newInputs.grade.classList.toggle("hidden", els.grade.value !== NEW_VALUE);
    resetBelow("grade");
    const board = currentValue("board");
    const grade = currentValue("grade");
    if (els.grade.value === NEW_VALUE) return;
    els.subject.disabled = false;
    fillSelect(els.subject, getSubjects(board, grade), "Select subject");
  });

  newInputs.grade.addEventListener("input", () => {
    els.subject.disabled = false;
    fillSelect(els.subject, [], "Select subject");
  });

  els.subject.addEventListener("change", () => {
    newInputs.subject.classList.toggle("hidden", els.subject.value !== NEW_VALUE);
    resetBelow("subject");
    const board = currentValue("board");
    const grade = currentValue("grade");
    const subject = currentValue("subject");
    if (els.subject.value === NEW_VALUE) return;
    els.chapter.disabled = false;
    fillSelect(els.chapter, getChapters(board, grade, subject), "Select chapter");
  });

  newInputs.subject.addEventListener("input", () => {
    els.chapter.disabled = false;
    fillSelect(els.chapter, [], "Select chapter");
  });

  els.chapter.addEventListener("change", () => {
    newInputs.chapter.classList.toggle("hidden", els.chapter.value !== NEW_VALUE);
    resetBelow("chapter");
    const board = currentValue("board");
    const grade = currentValue("grade");
    const subject = currentValue("subject");
    const chapter = currentValue("chapter");
    if (els.chapter.value === NEW_VALUE) return;
    els.topic.disabled = false;
    fillSelect(els.topic, getTopics(board, grade, subject, chapter), "Select topic");
  });

  newInputs.chapter.addEventListener("input", () => {
    els.topic.disabled = false;
    fillSelect(els.topic, [], "Select topic");
  });

  els.topic.addEventListener("change", () => {
    newInputs.topic.classList.toggle("hidden", els.topic.value !== NEW_VALUE);
  });

  return {
    getSelection: () => ({
      board: currentValue("board"),
      grade: currentValue("grade"),
      subject: currentValue("subject"),
      chapter: currentValue("chapter"),
      topic: currentValue("topic")
    }),
    // Persists any newly-typed values into the taxonomy tree in Firestore
    async persistNewValues() {
      const board = currentValue("board");
      const grade = currentValue("grade");
      const subject = currentValue("subject");
      const chapter = currentValue("chapter");
      const topic = currentValue("topic");
      if (!board) return;
      if (topic) await addTopic(board, grade, subject, chapter, topic);
      else if (chapter) await addChapter(board, grade, subject, chapter);
      else if (subject) await addSubject(board, grade, subject);
      else if (grade) await addGrade(board, grade);
      else await addBoard(board);
    }
  };
}

// ---- Renders the read-only tree view on the "Manage categories" page ----
function renderTaxonomyTree(containerEl) {
  containerEl.innerHTML = "";
  const boards = getBoards();
  if (boards.length === 0) {
    containerEl.innerHTML = '<p class="hint">No categories yet — add your first question to create some.</p>';
    return;
  }
  boards.forEach((board) => {
    const boardDiv = document.createElement("details");
    boardDiv.className = "tree-node";
    boardDiv.innerHTML = `<summary>${escapeHtml(board)}</summary>`;
    getGrades(board).forEach((grade) => {
      const gradeDiv = document.createElement("details");
      gradeDiv.className = "tree-node indent-1";
      gradeDiv.innerHTML = `<summary>${escapeHtml(grade)}</summary>`;
      getSubjects(board, grade).forEach((subject) => {
        const subjectDiv = document.createElement("details");
        subjectDiv.className = "tree-node indent-2";
        subjectDiv.innerHTML = `<summary>${escapeHtml(subject)}</summary>`;
        getChapters(board, grade, subject).forEach((chapter) => {
          const chapterDiv = document.createElement("details");
          chapterDiv.className = "tree-node indent-3";
          const topics = getTopics(board, grade, subject, chapter);
          chapterDiv.innerHTML = `<summary>${escapeHtml(chapter)}</summary>` +
            (topics.length
              ? `<ul class="topic-list">${topics.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
              : '<p class="hint indent-4">No topics yet</p>');
          subjectDiv.appendChild(chapterDiv);
        });
        gradeDiv.appendChild(subjectDiv);
      });
      boardDiv.appendChild(gradeDiv);
    });
    containerEl.appendChild(boardDiv);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
