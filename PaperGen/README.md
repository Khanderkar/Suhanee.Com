# Exam Prep Bank

A private question repository for building practice papers by **Board → Grade → Subject → Chapter → Topic**, with random paper generation. Plain HTML/CSS/JS — no build tools, no npm — so you can host it directly on GitHub Pages.

---

## 1. Create your Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Name it anything (e.g. "exam-prep-bank"). You can skip Google Analytics.
2. Once created, click the **web icon (`</>`)** on the project overview page to register a web app. Give it any nickname. You do **not** need Firebase Hosting for this step — just register the app.
3. Firebase will show you a `firebaseConfig` object with keys like `apiKey`, `authDomain`, etc. Copy these.
4. Open `js/firebase-config.js` in this project and paste your values in, replacing the placeholder text.

## 2. Turn on Authentication

1. In the Firebase console sidebar: **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password**.

## 3. Turn on Firestore (the database)

1. **Build → Firestore Database → Create database**.
2. Choose **Start in production mode** (we'll set proper rules ourselves) and pick a region close to you.

## 4. Turn on Storage (for question images/diagrams)

1. **Build → Storage → Get started**. Use production mode again, same region.

## 5. Lock the app down to just you

By default, "production mode" blocks everyone — we need to explicitly allow your account.

1. **Open the app locally first** (see step 6) and use the **"Create an account"** link to sign up with your own email/password. This creates your user, but rules aren't set yet so it may fail — that's expected, continue to the next step first if signup doesn't go through, then retry after step 5.3.
2. In Firebase console: **Build → Authentication → Users** tab, find your account, and copy its **User UID**.
3. Open `firestore.rules` and `storage.rules` in this project, and replace `PASTE_YOUR_USER_UID_HERE` with your actual UID (keep the quotes).
4. In Firebase console: **Firestore Database → Rules** tab → paste in the entire contents of `firestore.rules` → click **Publish**.
5. In Firebase console: **Storage → Rules** tab → paste in the entire contents of `storage.rules` → click **Publish**.
6. Now sign up / log in again from the app — it should work.

> Want a co-parent or tutor to also add questions? Have them sign up once, grab their UID the same way, and add it as a second entry in both rules files.

## 6. Run it locally before deploying

Since this is plain HTML/JS, you can't just double-click `index.html` (browsers block some Firebase features on `file://` URLs). Use a simple local server instead:

- **Easiest:** In VS Code, install the "Live Server" extension, right-click `index.html`, choose "Open with Live Server".
- **Or**, if you have Python installed, run this in the project folder: `python3 -m http.server 8000`, then visit `http://localhost:8000`.

## 7. Deploy to GitHub Pages

1. Create a new GitHub repository and push this whole folder to it.
2. In the repo on GitHub: **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch", pick your main branch and `/ (root)` folder, then **Save**.
4. GitHub will give you a URL like `https://yourusername.github.io/your-repo-name/` within a minute or two — that's your live app.

---

## How the app is organized

- **Add question** — pick Board/Grade/Subject/Chapter/Topic (or type a new one inline via "+ Add new..."), write the question, mark the correct MCQ option (or provide a model answer for subjective questions), set marks/difficulty, and optionally attach an image/diagram.
- **Question bank** — filter your existing questions by any combination of Board/Grade/Subject/Chapter/Topic, review them, delete any that need retiring.
- **Generate paper** — set the same filters to define scope, choose how many MCQs and how many subjective questions you want, and click **Generate paper**. You get a shuffled, printable paper with a "Show answer key" toggle and a "Print / Save as PDF" button (uses your browser's print dialog — choose "Save as PDF" as the destination).
- **Manage categories** — a read-only tree view of every Board/Grade/Subject/Chapter/Topic you've created so far, so you can see your whole taxonomy at a glance.

## Notes & things you might want to extend later

- Categories (Board/Grade/etc.) are created the first time you use a new name in the "Add question" form — there's nothing to pre-configure.
- The paper generator currently picks purely at random from whatever matches your filters. If you want it to also balance by difficulty (e.g. "2 easy, 2 medium, 1 hard") or guarantee topic coverage, that's a natural next step — just ask and it can be added.
- All images are stored in Firebase Storage under `question-images/<your-uid>/...` — Firebase's free tier includes 5GB of storage, which is a lot of diagrams.
- If you ever want question versioning (e.g. mark a question as "used in Term 1 paper" so it's not repeated), that's straightforward to add as an extra field.
