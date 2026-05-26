# OpsMind AI 🚀

OpsMind AI is a modern, enterprise-ready full-stack SaaS platform designed to automate and manage Standard Operating Procedures (SOPs) using the power of Artificial Intelligence. It features an advanced hybrid search copilot, strict input-boundary security defenses, multi-tenant workspace isolation, and a premium fluid interface.

---

## 🌟 Key Architectural Features

### 1. 🧠 Advanced Hybrid Okapi BM25 & Cosine RAG Engine (**Grade A+**)
Unlike basic tutorial setups that use simple character matching or standard text indexing, OpsMind AI features a custom, high-fidelity hybrid search pipeline built directly from mathematical principles:
*   **Okapi BM25 Relevance Scoring:** Evaluates precise keyword relevance using dynamic Inverse Document Frequency (IDF) corpus weighting and document-length normalization (`avgdl`) to score candidates.
*   **Synonyms-Based Query Expansion:** Rewrites user queries in real-time to match conceptual synonyms (e.g., querying *"leave"* automatically expands to match *"pto"*, *"vacation"*, *"absence"*, or *"sick"*).
*   **Phrase & Named Entity Boosters:** Inject structural weight boosts (+1.5 for bigrams, +2.0 for SOP keywords) to align candidate chunks exactly with contextual queries.
*   **Diversity Guarantee:** Enforces cross-entity representation to ensure Llama-3.1 receives balanced contexts when multiple concepts are queried.

### 2. 🛡️ Hardened Enterprise Security Layer (**Grade A+**)
Engineered to withstand external security audits with comprehensive boundary sanitization:
*   **NoSQL Query Injection Immunity:** Strict primitive type-coercion across `/auth/login`, `/auth/register`, and `/api/contact` paths using primitive JS string conversions (`String(value || "")`) to completely block JSON object injection attacks (e.g. bypassing filters via `{ "$ne": null }`).
*   **Stored XSS Neutralization:** A custom high-performance `escapeHTML` helper sanitizes name, email, and message inputs before database write actions, blocking arbitrary script payloads.
*   **Secure Payment Verification:** Employs HMAC-SHA256 signature verification matching Razorpay raw order payloads against private secret keys.

### 3. 👥 Multi-Tenant Team Workspaces
Supports secure team collaboration out of the box:
*   Users can register and invite up to 10 seat members on the **PRO** plan.
*   Multi-tenant isolation query middleware maps all user actions back to the `teamOwnerEmail` workspace database boundaries, allowing shared knowledge-base uploads while keeping independent user profiles private.

---

## 🛠️ Technology Stack

**Frontend:**
*   **React.js** (Vite-powered, optimized production bundles)
*   **Vanilla CSS3** (Curated custom design system, glassmorphic filters)
*   **Framer Motion** (Subtle micro-animations and route transitions)

**Backend:**
*   **Node.js & Express.js** (High-throughput event loop configuration)
*   **Multer & PDF-Parse** (Dynamic file handling and parsing pipelines)
*   **JSON Web Tokens (JWT) & Bcrypt** (Enrypted credential flows)

**Database & AI Ecosystem:**
*   **MongoDB Atlas** (Cloud NoSQL Database cluster)
*   **Groq API / Llama 3.1** (High-fidelity operational answer streaming)
*   **Razorpay API** (Mock-sandbox payment gateway processing)

---

## 🚀 Getting Started

### Prerequisites
Make sure you have Node.js and npm installed on your machine. You will also need a MongoDB Atlas account, a Groq API key, and Razorpay test credentials.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/saninfuhad763-collab/sop-agent.git
   cd sop-agent
   ```

2. **Install Root & Backend Dependencies:**
   ```bash
   npm install
   ```

3. **Install Frontend Dependencies:**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

### Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=5000

# Authentication Secret
JWT_SECRET=your_super_secret_jwt_key_here

# Database Connectivity
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/
MONGO_DB_NAME=sop_agent

# AI Provider (Groq API)
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.1-8b-instant

# Payment Gateway (Razorpay Keys)
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### Running the Application

To run the unified backend server and frontend development server concurrently, launch the following command from the root folder:

```bash
npm run dev
```

> [!WARNING]
> **DO NOT** run `npm run dev` inside the `frontend/` subdirectory separately!
> The root startup script uses `concurrently` to launch the backend server on port 5000 and the frontend compiler on port 5173 at the same time. Starting a second instance inside the `frontend/` folder manually will result in a port conflict: `Error: Port 5173 is already in use`. Always start the application exclusively from the root workspace folder.

*   **Frontend Client:** `http://localhost:5173`
*   **Express API Backend:** `http://localhost:5000`

---

## 📁 Core Directory Structure

```text
opsmind-ai/
├── frontend/                # React Vite Frontend Client
│   ├── src/
│   │   ├── App.jsx          # Dynamic routes, tab rendering, and stream handling
│   │   ├── Home.jsx         # Premium landing page and secure contact form
│   │   ├── Billing.jsx      # Invoices, PRO badges, and plan details
│   │   ├── Pricing.jsx      # Billing plan tiers (Free, Pro, Enterprise)
│   │   └── styles.css       # Deep navy glassmorphic layout stylesheet
├── server.js                # Secure Express API Server
├── package.json             # Root dependency manifests
└── .env                     # Local configuration parameters (git-ignored)
```

---

## 🤝 Contributing
Contributions, issue reports, and architecture enhancements are welcome! Feel free to open a pull request.

## 📝 License
This project is licensed under the MIT License.
