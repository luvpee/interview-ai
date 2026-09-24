# Interview Master 🎯

An intelligent full-stack AI interview preparation platform. Input a target job description and your resume (or self-description) to receive a role-tailored interview strategy: match score, critical skill gaps, technical and behavioral questions with model answers, a day-by-day study roadmap, and an ATS-optimized downloadable resume PDF.

---

## ✨ Features

- **Personalized Interview Plan**: Generates match score (0–100%), severity-ranked skill gaps (`low`, `medium`, `high`), technical questions with interviewer intentions, behavioral questions with STAR framework guidance, and a multi-day study plan.
- **Factual Grounding & Hallucination Critic**: Secondary AI evaluation pipeline audits generated questions and skill gaps against source documents, providing a confidence score and flagging ungrounded items.
- **Interactive Resume Upload**: Drag-and-drop PDF dropzone with real-time file preview (name, size, status badge, remove/replace controls) and file validation.
- **Tailored PDF Resume**: Generates an ATS-friendly, job-specific resume in HTML/CSS and streams an A4 PDF via headless Puppeteer.
- **Dynamic 6-Stage Waiting Screen**: Multi-step state machine with animated AI orb, smooth progress bar, elapsed timer, and rotating interview tips during 20s inference.
- **Feedback & Analytics**: Thumbs up/down ratings on individual questions, with an analytics dashboard tracking match score trends and recurring skill gaps.
- **Secure Authentication**: JWT in `httpOnly` cookies, `bcryptjs` password hashing, server-side token blacklisting on logout, and protected routes.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, React Router 8, Vite 8, Axios, SCSS
- **Backend**: Node.js, Express 5, MongoDB (Mongoose 9), Multer, `pdf-parse`
- **AI & Automation**: Google GenAI (`gemini-3.6-flash` with `gemini-3-flash-preview` fallback), Zod v4 schema enforcement, Puppeteer

---

## 📈 Benchmarks & Quality Metrics

All metrics are backed by automated test scripts in `Backend/scripts/`:

| Benchmark | Metric | What It Proves |
|---|:---:|---|
| **Reliability** | **68% $\to$ 99%** | Exponential backoff retry and model failover recover from transient Gemini 503 capacity spikes. |
| **Pipeline Latency** | **$p50$ 18s / $p95$ 31s** | Profiled generation latency, isolating secondary grounding critic overhead to ~2.1s. |
| **Grounding Detection** | **5/5 (100%)** | Critic pipeline caught 100% of planted out-of-domain hallucinations with 0% false flags on valid skills. |
| **Skill-Gap Recall** | **5/5 (100%)** | Accurately detected all known missing competencies across 5 distinct job fixtures (Frontend, Backend, Data, DevOps, PM). |
| **Cross-Tenant Security** | **6/6 (100% Pass)** | Integration test suite verifying multi-tenant isolation, 404s on cross-user reports/PDFs, and 401s on unauthenticated calls. |

Run the test suites yourself from `Backend/`:
```bash
npm run test:security     # Run cross-tenant access control tests (Benchmark 5)
npm run benchmark:eval    # Run planted hallucination detection test (Benchmark 3)
npm run benchmark:all     # Run latency & fixture skill-gap recall suite (Benchmarks 2 & 4)
```

---

## 🚀 Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB instance (local or Atlas)
- Google GenAI API key ([Google AI Studio](https://aistudio.google.com/apikey))

### 2. Environment Setup
Create `Backend/.env`:
```env
MONGO_URI=mongodb://localhost:27017/interview-master
JWT_SECRET=your-secure-random-jwt-secret
GOOGLE_GENAI_API_KEY=your-gemini-api-key
```

### 3. Run Locally

**Backend:**
```bash
cd Backend
npm install
npm run dev        # http://localhost:3000
```

**Frontend:**
```bash
cd Frontend
npm install
npm run dev        # http://localhost:5173
```

---

## 📡 API Reference

All interview endpoints require a valid JWT session cookie set upon login.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new account |
| `POST` | `/api/auth/login` | Log in and receive httpOnly JWT cookie |
| `GET` | `/api/auth/logout` | Clear cookie and blacklist token |
| `GET` | `/api/auth/get-me` | Get current user session |
| `POST` | `/api/interview/` | Generate interview report (`jobDescription`, `selfDescription`, `resume`) |
| `GET` | `/api/interview/` | List all reports belonging to logged-in user |
| `GET` | `/api/interview/report/:interviewId` | Get full interview report by ID |
| `POST` | `/api/interview/resume/pdf/:interviewReportId` | Stream tailored resume PDF |
| `POST` | `/api/interview/report/:interviewId/feedback` | Submit thumbs up/down rating on a question |
| `GET` | `/api/interview/analytics` | Fetch match score trends & top skill gap frequency |

---

## 📄 License
ISC
