# RepoForge — AI-Powered Codebase Intelligence Platform

> Point it at any repository. Get an interactive dependency graph and an AI that actually understands your code.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Powered by Groq](https://img.shields.io/badge/Powered%20by-Groq-orange)](https://groq.com/)
[![AWS](https://img.shields.io/badge/Deployed%20on-AWS-232F3E)](https://aws.amazon.com/)

**Author**: [Abhinav Walde](https://github.com/abhinavwalde204)

---

## 💡 Motivation

Onboarding into an unfamiliar codebase is expensive. You spend hours tracing imports, reading stale docs, and asking colleagues questions that should have obvious answers. I built RepoForge to eliminate that friction — it ingests a repository, builds a live dependency graph of how files and components relate to each other, and layers a RAG-powered AI on top so you can ask architectural questions in plain English and get accurate answers instantly.

---

## 📷 Screenshots

<!-- Add your screenshots here -->

---

## ✨ Features

- **AI Code Analyzer** — A RAG pipeline backed by Groq answers complex questions about your codebase: architecture, data flow, module responsibilities, and more
- **Interactive Dependency Graph** — Visualizes how every file and component in the repository connects, rendered as a navigable, zoomable graph
- **Async Repository Processing** — Bull queues handle ingestion in the background so heavy codebases don't block the server
- **Vector Search** — `pgvector` stores code embeddings, enabling semantically accurate retrieval before every AI response
- **JWT Authentication** — Secure user sessions with token-based auth
- **Email Integration** — Transactional emails via Nodemailer and Resend
- **Production Deployment** — Frontend on AWS S3, backend on AWS Elastic Beanstalk

---

## 🛠️ Tech Stack

### Frontend
- **React 19 + Vite** — UI framework and build tool
- **Tailwind CSS v4** — Utility-first styling
- **React Flow (`@xyflow/react`)** — Interactive dependency graph rendering
- **Zustand** — Lightweight global state management
- **GSAP** — Micro-animations and transitions
- **Recharts** — Data visualization

### Backend
- **Node.js + Express** — REST API server
- **PostgreSQL + pgvector** — Relational database with vector embedding support
- **Bull** — Redis-backed job queues for async processing
- **Archiver** — Repository compression and handling

### AI / Inference
- **Groq API** — LLM inference (migrated from local Ollama for production speed)

### Deployment
- **AWS S3** — Frontend hosting
- **AWS Elastic Beanstalk** — Backend hosting
- **Nodemailer + Resend** — Email service

---

## 📁 Project Structure

```
RepoForge/
├── repoforge-frontend/         # React frontend
│   └── src/
│       ├── components/         # UI components
│       ├── store/              # Zustand state
│       ├── utils/              # Helper functions
│       └── App.jsx
├── repoforge-api/              # Express backend
│   ├── routes/                 # API route handlers
│   ├── workers/                # Bull queue workers
│   ├── services/               # RAG pipeline, embeddings, graph logic
│   ├── db/                     # PostgreSQL connection and queries
│   └── index.js                # Server entry point
└── README.md
```

---

## ⚙️ Installation & Setup

### Prerequisites
- [Node.js v18+](https://nodejs.org/)
- [PostgreSQL](https://www.postgresql.org/) with `pgvector` extension enabled
- [Redis](https://redis.io/) (required for Bull queues)
- A free [Groq API key](https://console.groq.com/)

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/RepoForge.git
cd RepoForge
```

### 2. Backend Setup

```bash
cd repoforge-api
npm install
```

Create a `repoforge-api/.env` file:

```env
DATABASE_URL=your_postgres_connection_string
GROQ_API_KEY=your_groq_api_key
JWT_SECRET=your_jwt_secret
REDIS_URL=your_redis_url
RESEND_API_KEY=your_resend_api_key
```

Enable `pgvector` in your PostgreSQL instance:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Start the backend:

```bash
npm run dev
# API runs on http://localhost:5000
```

### 3. Frontend Setup

```bash
cd ../repoforge-frontend
npm install
```

Create a `repoforge-frontend/.env` file:

```env
VITE_API_BASE_URL=http://localhost:5000
```

Start the frontend:

```bash
npm run dev
# Client runs on http://localhost:5173
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | POST | Register a new user |
| `/api/auth/login` | POST | Login and receive JWT |
| `/api/repo/ingest` | POST | Submit a repository for processing |
| `/api/repo/:id/graph` | GET | Fetch the dependency graph for a repository |
| `/api/repo/:id/query` | POST | Ask the AI a question about the repository |
| `/ping` | GET | Health check |

---

## 🔧 How It Works

1. User submits a repository URL
2. A Bull worker clones and parses the repo asynchronously
3. Files are chunked and embedded using the Groq API
4. Embeddings are stored in PostgreSQL via `pgvector`
5. A dependency graph is constructed and persisted
6. When the user queries the AI, relevant code chunks are retrieved via vector similarity search
7. Retrieved context is injected into the prompt and sent to Groq for a grounded, accurate response

---

## 🎨 Design Decisions

- **Bull queues over direct processing** — Repository ingestion is CPU and I/O heavy. Offloading to workers keeps the API responsive and makes failures recoverable
- **pgvector over a dedicated vector DB** — Keeps the stack simple. One database handles both relational data and embeddings without introducing Pinecone or Chroma as dependencies
- **Groq over Ollama in production** — Local inference works for development but Groq's hosted models are significantly faster under real load
- **React Flow for graphs** — Provides a solid base for interactive node-edge rendering without writing a custom canvas implementation

---

## 🔮 Roadmap

- [ ] Support for private repositories via OAuth (GitHub/GitLab)
- [ ] File-level diff analysis (what changed between two commits)
- [ ] Shareable repository snapshots with public URLs
- [ ] VS Code extension for in-editor querying
- [ ] Support for monorepos with multiple package boundaries

---

## 📝 License

MIT License — feel free to use, modify, and distribute.

---

## 👤 Author

**Your Name**

[GitHub](https://github.com/yourusername)

---

## 🙏 Acknowledgments

- [Groq](https://groq.com/) for fast and free LLM inference
- [@xyflow/react](https://reactflow.dev/) for the graph rendering primitives
- [pgvector](https://github.com/pgvector/pgvector) for making Postgres a viable vector store
