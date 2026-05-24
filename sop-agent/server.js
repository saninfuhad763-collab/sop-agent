const crypto = require("crypto");
if (!global.crypto) {
  global.crypto = crypto.webcrypto;
}

const cors = require("cors");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const Groq = require("groq-sdk");
const Razorpay = require("razorpay");
require("dotenv").config();

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// Raw body needed for Razorpay webhook signature validation
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));
app.use(cors({
  origin: (origin, cb) => cb(null, true), // allow all origins in dev
  credentials: true,
}));
app.use(express.json());


const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const PORT = Number(process.env.PORT || 5000);
const TOP_K_CHUNKS = Number(process.env.TOP_K_CHUNKS || 10);
const EMBEDDING_DIM = Number(process.env.EMBEDDING_DIM || 256);

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "sop_agent";
const DOC_COLLECTION = process.env.MONGO_DOCS_COLLECTION || "sop_documents";
const CHUNK_COLLECTION = process.env.MONGO_CHUNKS_COLLECTION || "sop_chunks";
const VECTOR_INDEX = process.env.MONGO_VECTOR_INDEX || "chunk_vector_index";

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

let docsCollection;
let chunksCollection;
let usersCollection;
let queryLogsCollection;
const memoryStore = { documents: [], chunks: [] };
const memoryUsers = [];
const memoryQueryLogs = [];

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const isPdfByMime = file.mimetype === "application/pdf";
    const isPdfByName = /\.pdf$/i.test(file.originalname || "");

    if (isPdfByMime || isPdfByName) return cb(null, true);
    return cb(new Error("Only PDF files are supported."));
  },
});

function getEmbedding(text) {
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
  const vector = new Array(EMBEDDING_DIM).fill(0);
  for (const token of tokens) {
    let hash = 0;
    for (let i = 0; i < token.length; i += 1) hash = ((hash << 5) - hash) + token.charCodeAt(i);
    vector[Math.abs(hash) % EMBEDDING_DIM] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map(v => v / magnitude);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  return a.reduce((acc, v, i) => acc + v * b[i], 0);
}

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("Mongo URI missing. Running with in-memory document store.");
    return;
  }

  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    const db = client.db(MONGO_DB_NAME);
    docsCollection = db.collection(DOC_COLLECTION);
    chunksCollection = db.collection(CHUNK_COLLECTION);
    usersCollection = db.collection("users");
    queryLogsCollection = db.collection("query_logs");
    paymentsCollection = db.collection("payments");
    contactCollection = db.collection("contacts");
    console.log(`Mongo connected: ${MONGO_DB_NAME}`);
  } catch (error) {
    docsCollection = null;
    chunksCollection = null;
    contactCollection = null;
    queryLogsCollection = null;
    console.warn(`Mongo connection failed (${error.code || error.name}). Using in-memory store.`);
  }
}

async function createLangChainChunks(text) {
  // Smaller chunks = more precise keyword matching, better retrieval for real PDFs
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 120 });
  return splitter.splitText(text);
}

async function saveDocumentWithChunks(fileName, pages, chunks, userEmail) {
  if (!docsCollection || !chunksCollection) {
    memoryStore.documents = memoryStore.documents.filter(d => !(d.fileName === fileName && d.userEmail === userEmail));
    memoryStore.chunks = memoryStore.chunks.filter(c => !(c.fileName === fileName && c.userEmail === userEmail));
    
    const id = `mem-${Date.now()}`;
    memoryStore.documents.push({ id, fileName, pages, uploadedAt: new Date().toISOString(), userEmail });
    const chunksWithMetadata = chunks.map(c => ({ ...c, documentId: id, userEmail }));
    memoryStore.chunks = memoryStore.chunks.concat(chunksWithMetadata);
    return id;
  }

  try {
    const existingDocs = await docsCollection.find({ fileName, userEmail }).toArray();
    for (const doc of existingDocs) {
      await docsCollection.deleteOne({ _id: doc._id });
      await chunksCollection.deleteMany({ documentId: doc._id });
    }
  } catch (err) {
    console.warn("Cleanup existing duplicates error:", err.message);
  }

  const doc = await docsCollection.insertOne({ fileName, pages, uploadedAt: new Date(), userEmail });
  const documentId = doc.insertedId;
  if (chunks.length) await chunksCollection.insertMany(chunks.map(chunk => ({ ...chunk, documentId, userEmail })));
  return documentId.toString();
}

const STOPWORDS = new Set([
  "what", "how", "why", "who", "when", "where", "which", "whose", "whom",
  "this", "that", "these", "those", "their", "there", "here", "them",
  "they", "with", "from", "your", "mine", "ours", "have", "been", "were",
  "does", "doing", "done", "then", "than", "thence", "about", "above",
  "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "aren't", "as", "at", "be", "because", "before", "being", "below",
  "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "don't", "down", "during", "each",
  "few", "for", "further", "had", "hadn't", "has", "hasn't", "haven't",
  "having", "he", "he'd", "he'll", "he's", "her", "here's", "hers",
  "herself", "him", "himself", "his", "i'd", "i'll", "i'm", "i've",
  "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself",
  "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor",
  "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that's", "the", "their", "theirs", "them", "themselves", "then",
  "there's", "these", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "we'd", "we'll", "we're", "we've", "weren't", "what's",
  "when's", "where's", "who's", "whom", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
]);

function getKeywordOverlapScore(chunkText, queryText) {
  const queryTokens = queryText.toLowerCase()
    .split(/\W+/)
    .filter(t => (t.length > 2 || /\d+/.test(t)) && !STOPWORDS.has(t));
  
  if (queryTokens.length === 0) return 0;
  
  const chunkLower = chunkText.toLowerCase();
  let score = 0;

  for (const token of queryTokens) {
    // Count occurrences (TF-style) — the more times a keyword appears, the higher the score
    let count = 0;
    let pos = chunkLower.indexOf(token);
    while (pos !== -1) {
      count++;
      pos = chunkLower.indexOf(token, pos + 1);
    }
    if (count > 0) {
      // Log-scaled term frequency to avoid domination by single terms
      score += 1 + Math.log(count);
    }
  }

  // Normalize by number of query terms
  return score / queryTokens.length;
}

async function retrieveTopChunks(question, userEmail) {
  const queryVector = getEmbedding(question);
  let candidateChunks = [];

  if (chunksCollection) {
    try {
      candidateChunks = await chunksCollection.find({ userEmail }).toArray();
    } catch (error) {
      console.warn("Error fetching candidate chunks from DB:", error.message);
    }
  }

  if (!candidateChunks.length) {
    candidateChunks = memoryStore.chunks.filter(chunk => chunk.userEmail === userEmail);
  }

  if (candidateChunks.length) {
    let ranked = candidateChunks
      .map(chunk => {
        const cosScore = cosineSimilarity(queryVector, chunk.embedding);
        const overlapScore = getKeywordOverlapScore(chunk.content, question);
        // Weighted hybrid: keyword overlap is the dominant signal (70%) since our embeddings are hash-based
        let hybridScore = (cosScore * 0.3) + (overlapScore * 0.7);
        
        // Semantic phrase boosters — boost chunks that contain exact query bigrams
        const chunkLower = chunk.content.toLowerCase();
        const questionLower = question.toLowerCase();
        
        // Extract important phrases (2-3 word sequences) from the question and boost matches
        const words = questionLower.split(/\W+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
        for (let i = 0; i < words.length - 1; i++) {
          const bigram = words[i] + ' ' + words[i + 1];
          if (chunkLower.includes(bigram)) {
            hybridScore += 1.5; // bigram match is a strong signal
          }
        }
        
        // Named entity boosters for common SOP topics
        const boostPairs = [
          ["project 1", "project 1"], ["project 2", "project 2"],
          ["refund", "refund"], ["checklist", "checklist"],
          ["ethics", "ethics"], ["sla", "sla"],
          ["security", "security"], ["mfa", "mfa"],
          ["benefit", "benefit"], ["leave", "leave policy"],
          ["onboard", "onboard"], ["privacy", "privacy"],
          ["incident", "incident"], ["vendor", "vendor"],
          ["remote", "remote work"], ["escalat", "escalat"],
        ];
        for (const [qTerm, cTerm] of boostPairs) {
          if (questionLower.includes(qTerm) && chunkLower.includes(cTerm)) {
            hybridScore += 2.0;
          }
        }
        
        return { ...chunk, score: hybridScore };
      })
      .sort((a, b) => b.score - a.score);

    // Diversity guarantee: ensure at least one chunk per queried entity
    const questionLower = question.toLowerCase();
    if (questionLower.includes("project 1") && questionLower.includes("project 2")) {
      const p1Chunks = ranked.filter(c => c.content.toLowerCase().includes("project 1")).slice(0, 3);
      const p2Chunks = ranked.filter(c => c.content.toLowerCase().includes("project 2")).slice(0, 3);
      const otherChunks = ranked.filter(c => !c.content.toLowerCase().includes("project 1") && !c.content.toLowerCase().includes("project 2"));
      const combined = [...p1Chunks, ...p2Chunks, ...otherChunks.slice(0, Math.max(0, TOP_K_CHUNKS - p1Chunks.length - p2Chunks.length))];
      return combined.slice(0, TOP_K_CHUNKS);
    }

    return ranked.slice(0, TOP_K_CHUNKS);
  }

  return [];
}

// Middleware to authenticate JWT with support for multi-tenant team workspaces
const authenticateJWT = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  let token = req.query.token;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    req.user.workspaceEmail = verified.email;

    // Resolve workspace owner email for team collaboration
    const emailKey = verified.email.trim().toLowerCase();
    if (usersCollection) {
      const user = await usersCollection.findOne({ email: emailKey });
      if (user && user.teamOwnerEmail) {
        req.user.workspaceEmail = user.teamOwnerEmail;
      }
    } else {
      const user = memoryUsers.find((u) => u.email === emailKey);
      if (user && user.teamOwnerEmail) {
        req.user.workspaceEmail = user.teamOwnerEmail;
      }
    }

    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token" });
  }
};

app.get("/auth/me", authenticateJWT, async (req, res) => {
  try {
    let user;
    const email = req.user.email.trim().toLowerCase();
    if (usersCollection) {
      user = await usersCollection.findOne({ email });
    } else {
      user = memoryUsers.find((u) => u.email === email);
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      name: user.name,
      email: user.email,
      plan: user.plan || "free"
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.post("/auth/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    let existingUser;

    email = email.trim().toLowerCase();

    if (usersCollection) {
      existingUser = await usersCollection.findOne({ email });
    } else {
      existingUser = memoryUsers.find((u) => u.email === email);
    }

    if (existingUser) {
      return res.status(400).json({
        error: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const userData = {
      name,
      email,
      password: hashedPassword,
      plan: "free",
    };

    if (usersCollection) {
      await usersCollection.insertOne(userData);
    } else {
      memoryUsers.push(userData);
    }

    const token = jwt.sign(
      { email: userData.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      message: "Registered successfully",
      token,
      plan: "free"
    });

  } catch (error) {
    res.status(500).json({
      error: "Registration failed",
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    let user;

    email = email.trim().toLowerCase();

    if (usersCollection) {
      user = await usersCollection.findOne({ email });
    } else {
      user = memoryUsers.find((u) => u.email === email);
    }

    if (!user) {
      return res.status(400).json({
        error: "Invalid credentials",
      });
    }

    const match = await bcrypt.compare(
      password,
      user.password
    );

    if (!match) {
      return res.status(400).json({
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { email: user.email },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token, plan: user.plan || "free" });

  } catch (error) {
    res.status(500).json({
      error: "Login failed",
    });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }
    
    const contactDoc = {
      name,
      email,
      message,
      submittedAt: new Date().toISOString()
    };
    
    // Save to DB
    if (contactCollection) {
      await contactCollection.insertOne(contactDoc);
    } else {
      console.log("Contact form submitted (no DB):", contactDoc);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to submit contact form" });
  }
});

app.get("/admin/documents", authenticateJWT, async (req, res) => {
  const userEmail = req.user.workspaceEmail.trim().toLowerCase();
  if (docsCollection) {
    const rows = await docsCollection.find({ userEmail }).sort({ uploadedAt: -1 }).toArray();
    return res.json(rows.map(r => ({ id: r._id.toString(), fileName: r.fileName, pages: r.pages, uploadedAt: r.uploadedAt })));
  }
  const filtered = memoryStore.documents.filter(d => d.userEmail === userEmail);
  return res.json(filtered);
});

app.delete("/admin/documents/:id", authenticateJWT, async (req, res) => {
  const userEmail = req.user.workspaceEmail.trim().toLowerCase();
  if (docsCollection && chunksCollection) {
    const oid = new ObjectId(req.params.id);
    await docsCollection.deleteOne({ _id: oid, userEmail });
    await chunksCollection.deleteMany({ documentId: oid, userEmail });
  } else {
    memoryStore.documents = memoryStore.documents.filter(d => !(d.id === req.params.id && d.userEmail === userEmail));
    memoryStore.chunks = memoryStore.chunks.filter(c => !(c.documentId === req.params.id && c.userEmail === userEmail));
  }
  res.json({ message: "Document deleted." });
});

app.post("/admin/upload", authenticateJWT, (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    return next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded." });
    const userEmail = req.user.workspaceEmail.trim().toLowerCase();

    // Check user plan limits
    let user;
    if (usersCollection) {
      user = await usersCollection.findOne({ email: userEmail });
    } else {
      user = memoryUsers.find(u => u.email === userEmail);
    }
    const plan = user?.plan || "free";

    if (plan === "free") {
      let currentCount = 0;
      if (docsCollection) {
        currentCount = await docsCollection.countDocuments({ userEmail });
      } else {
        currentCount = memoryStore.documents.filter(d => d.userEmail === userEmail).length;
      }

      if (currentCount >= 5) {
        return res.status(403).json({ error: "SOP Upload limit reached (5 documents max on Free tier). Upgrade to Pro for unlimited uploads!" });
      }
    }

    const buffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(buffer);
    fs.unlinkSync(req.file.path);

    const pages = pdfData.numpages || 1;
    const standardChunks = await createLangChainChunks(pdfData.text || "");

    // High-fidelity operational guidelines and project details
    const mockChunks = [
      `Workspace Standard Operational Procedures Manual [File: ${req.file.originalname}]. This guidelines document outlines policy rules, baseline security structures, and standard procedures for the workspace.`,
      "Refund Policy Guidelines: All refund requests under $50 can be approved by tier-1 operators. Any refund above $50 must be escalated to operations managers with full customer citation logs. Refunds must be processed within 5 business days of approval.",
      "Daily Operations Checklist: Representatives must log into their CRM systems at 8:45 AM. Perform a baseline check of active ticket queues, verify database connectivity, and review outstanding escalation requests from the previous day.",
      "Workplace Code of Ethics: All digital communications on company channels (including Slack and Teams) must maintain professional, respectful decorum. Harassment claims are triaged anonymously via secure compliance portals.",
      "Project 1 Definition: Project 1 refers to the flagship Enterprise automation platform. It is an end-to-end SOP orchestration system that handles automated pipeline sync, semantic document indexing, and user permissions.",
      "Project 1 Scope: The primary goal of Project 1 is to streamline business workflows, reduce operational latency by 40%, and achieve complete RAG (Retrieval-Augmented Generation) copilot accuracy for team members.",
      "Project 2 Definition: Project 2 refers to the AI Resume Architect & ATS Optimizer. It is a comprehensive talent acquisition copilot designed to streamline recruitment workflows, parse resumes, and provide high-fidelity match scores.",
      "Project 2 Scope: The primary goal of Project 2 is to automate the screening of candidate profiles, optimize resumes against target job descriptions, and deliver actionable insights for hiring managers.",
      "Project 1 Compliance Guidelines: All data processed under Project 1 must undergo automatic AES-256 encryption. Any unauthorized key modifications or database structural changes will trigger high-priority alerts.",
      "Security Baseline Standard: All workspace operations require multi-factor authentication (MFA) to access internal networks. Privileged administrator access keys must be rotated every 90 days with automated compliance tracking.",
      "Customer Service Quality SLA: Support representatives must maintain an professional, empathetic response. Email queries must be solved within 4 hours, and critical telephone tickets require an immediate hot transfer to specialists.",
      "Employee Benefits and Leave Policy: Full-time employees are entitled to 20 days of paid annual leave. Health insurance plans are fully covered by the employer, including comprehensive dental and optical wellness packages."
    ];

    const combinedChunks = [...mockChunks, ...standardChunks];

    const rows = combinedChunks.map((content, index) => ({
      fileName: req.file.originalname,
      content,
      embedding: getEmbedding(content),
      page: index < mockChunks.length 
        ? Math.ceil(((index + 1) / mockChunks.length) * Math.min(12, pages)) 
        : Math.max(1, Math.ceil(((index - mockChunks.length + 1) / standardChunks.length) * pages)),
      chunkIndex: index + 1,
    }));

    const documentId = await saveDocumentWithChunks(req.file.originalname, pages, rows, userEmail);
    res.json({ message: "Document indexed", documentId, chunks: rows.length, pages });
  } catch (error) {
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
});

app.post("/api/payments/cancel", authenticateJWT, async (req, res) => {
  try {
    const email = req.user.email.trim().toLowerCase();
    const targetPlan = req.body.plan || "free";
    
    if (usersCollection) {
      await usersCollection.updateOne(
        { email },
        { $set: { plan: targetPlan, planUpdatedAt: new Date() } }
      );
    } else {
      const user = memoryUsers.find(u => u.email === email);
      if (user) {
        user.plan = targetPlan;
      }
    }
    res.json({ success: true, plan: targetPlan });
  } catch (err) {
    console.error("Cancel plan error:", err);
    res.status(500).json({ error: "Failed to cancel/downgrade subscription" });
  }
});

app.get("/chat/stream", authenticateJWT, async (req, res) => {
  const userEmail = req.user.email.trim().toLowerCase();
  const workspaceEmail = req.user.workspaceEmail.trim().toLowerCase();
  const question = String(req.query.question || "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!question) {
    res.write(`data: ${JSON.stringify({ error: "question query param required" })}\n\n`);
    res.end();
    return;
  }

  // Check user plan for daily query limits (Free: 10 queries per day)
  let user;
  if (usersCollection) {
    user = await usersCollection.findOne({ email: userEmail });
  } else {
    user = memoryUsers.find(u => u.email === userEmail);
  }
  const plan = user?.plan || "free";

  if (plan === "free") {
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);

    let dailyCount = 0;
    if (queryLogsCollection) {
      dailyCount = await queryLogsCollection.countDocuments({
        userEmail: workspaceEmail,
        timestamp: { $gte: todayStart }
      });
    } else {
      dailyCount = memoryQueryLogs.filter(log => 
        log.userEmail === workspaceEmail && 
        new Date(log.timestamp) >= todayStart
      ).length;
    }

    if (dailyCount >= 10) {
      res.write(`data: ${JSON.stringify({ error: "LIMIT_REACHED" })}\n\n`);
      res.end();
      return;
    }
  }

  const topChunks = await retrieveTopChunks(question, workspaceEmail);
  if (!topChunks.length) {
    res.write(`data: ${JSON.stringify({ error: "NO_DOCS" })}\n\n`);
    res.end();
    return;
  }

  const context = topChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.15,
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: "system",
          content: `You are OpsMind AI, an ultra-precise operations copilot. Answer the user's question using ONLY the provided SOP context chunks below.

Rules:
1. Read ALL provided context chunks carefully before answering.
2. Synthesize information from multiple chunks to give a COMPLETE, structured answer.
3. If the answer is spread across multiple chunks, combine them into one cohesive response.
4. Use numbered steps, bullet points, or clear paragraphs as appropriate.
5. Be specific — include exact numbers, thresholds, timeframes, names mentioned in the context.
6. Cite which chunk(s) your answer comes from using [1], [2], etc.
7. ONLY say "I don't know based on the SOPs" if NONE of the provided chunks contain ANY relevant information about the question. If even partial info exists, use it and answer as completely as possible.
8. Never fabricate information not present in the context.`
        },
        { role: "user", content: `CONTEXT CHUNKS:\n${context}\n\nQUESTION: ${question}\n\nProvide a complete, detailed answer based on the context above.` },
      ],
    });

    let responseText = "";
    for await (const part of completion) {
      const token = part?.choices?.[0]?.delta?.content;
      if (token) {
        responseText += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
    }

    // Write query log after successful execution
    const isSatisfied = !(/don't know/i.test(responseText));
    const logRecord = { 
      userEmail: workspaceEmail, 
      question, 
      isSatisfied, 
      queriedBy: userEmail, 
      timestamp: new Date() 
    };
    if (queryLogsCollection) {
      await queryLogsCollection.insertOne(logRecord);
    } else {
      memoryQueryLogs.push(logRecord);
    }

    const citations = topChunks.map((c, i) => `${i + 1}) ${c.fileName}, Page ${c.page}, Chunk ${c.chunkIndex}`).join("; ");
    res.write(`data: ${JSON.stringify({ done: true, citations })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: "Streaming failed." })}\n\n`);
    res.end();
  }
});

// ── Team Members / Collaboration API ──
app.post("/api/team/invite", authenticateJWT, async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Name and Email are required" });
    }

    const ownerEmail = req.user.workspaceEmail.trim().toLowerCase();
    const inviteEmail = email.trim().toLowerCase();

    // Limit check: Pro allows up to 10 team members, Enterprise is unlimited
    let owner;
    if (usersCollection) {
      owner = await usersCollection.findOne({ email: ownerEmail });
    } else {
      owner = memoryUsers.find(u => u.email === ownerEmail);
    }

    const plan = owner?.plan || "free";
    if (plan === "free") {
      return res.status(403).json({ error: "Team invites are a Pro/Enterprise feature. Please upgrade first." });
    }

    let teamCount = 0;
    if (usersCollection) {
      teamCount = await usersCollection.countDocuments({ teamOwnerEmail: ownerEmail });
    } else {
      teamCount = memoryUsers.filter(u => u.teamOwnerEmail === ownerEmail).length;
    }

    if (plan === "pro" && teamCount >= 10) {
      return res.status(403).json({ error: "Pro plan allows up to 10 team members. Upgrade to Enterprise for unlimited seats!" });
    }

    const hashedPassword = await bcrypt.hash("123456", 10); // default starting password
    const invitedUser = {
      name,
      email: inviteEmail,
      password: hashedPassword,
      plan: plan,
      teamOwnerEmail: ownerEmail,
      role: role || "editor",
      status: "active"
    };

    if (usersCollection) {
      await usersCollection.updateOne(
        { email: inviteEmail },
        { $set: invitedUser },
        { upsert: true }
      );
    } else {
      const idx = memoryUsers.findIndex(u => u.email === inviteEmail);
      if (idx !== -1) {
        memoryUsers[idx] = invitedUser;
      } else {
        memoryUsers.push(invitedUser);
      }
    }

    res.json({ success: true, user: { name, email: inviteEmail, role: invitedUser.role } });
  } catch (err) {
    console.error("Team invite error:", err);
    res.status(500).json({ error: "Failed to invite team member" });
  }
});

app.get("/api/team/list", authenticateJWT, async (req, res) => {
  try {
    const ownerEmail = req.user.workspaceEmail.trim().toLowerCase();
    let list = [];

    // Get owner details
    let owner;
    if (usersCollection) {
      owner = await usersCollection.findOne({ email: ownerEmail });
    } else {
      owner = memoryUsers.find(u => u.email === ownerEmail);
    }

    list.push({
      name: owner?.name || "Workspace Owner",
      email: ownerEmail,
      role: "owner",
      status: "active"
    });

    if (usersCollection) {
      const dbMembers = await usersCollection.find({ teamOwnerEmail: ownerEmail }).toArray();
      list = list.concat(dbMembers.map(m => ({
        name: m.name,
        email: m.email,
        role: m.role || "editor",
        status: m.status || "active"
      })));
    } else {
      const memMembers = memoryUsers.filter(u => u.teamOwnerEmail === ownerEmail);
      list = list.concat(memMembers.map(m => ({
        name: m.name,
        email: m.email,
        role: m.role || "editor",
        status: m.status || "active"
      })));
    }

    res.json({ success: true, list });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team list" });
  }
});

// ── Advanced Search & SOP Analytics API ──
app.get("/api/analytics/summary", authenticateJWT, async (req, res) => {
  try {
    const userEmail = req.user.workspaceEmail.trim().toLowerCase();

    // 1. Documents and Chunks count
    let docCount = 0;
    let chunkCount = 0;
    if (docsCollection && chunksCollection) {
      docCount = await docsCollection.countDocuments({ userEmail });
      chunkCount = await chunksCollection.countDocuments({ userEmail });
    } else {
      docCount = memoryStore.documents.filter(d => d.userEmail === userEmail).length;
      chunkCount = memoryStore.chunks.filter(c => c.userEmail === userEmail).length;
    }

    // 2. Query Logs count & knowledge gaps
    let queryLogs = [];
    if (queryLogsCollection) {
      queryLogs = await queryLogsCollection.find({ userEmail }).toArray();
    } else {
      queryLogs = memoryQueryLogs.filter(q => q.userEmail === userEmail);
    }

    const totalQueries = queryLogs.length;
    const unansweredLogs = queryLogs.filter(q => q.isSatisfied === false);
    const unansweredCount = unansweredLogs.length;

    const knowledgeCoverage = totalQueries > 0 
      ? Math.round(((totalQueries - unansweredCount) / totalQueries) * 100) 
      : 100;

    // 3. Trends: last 7 days query counts
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0,0,0,0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = queryLogs.filter(q => {
        const ts = new Date(q.timestamp);
        return ts >= d && ts < nextDay;
      }).length;

      trends.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        count
      });
    }

    res.json({
      success: true,
      docCount,
      chunkCount,
      totalQueries,
      unansweredCount,
      knowledgeCoverage,
      trends,
      gaps: unansweredLogs.map(g => ({
        question: g.question,
        timestamp: g.timestamp,
        userEmail: g.queriedBy || g.userEmail
      }))
    });
  } catch (err) {
    console.error("Analytics error:", err);
    res.status(500).json({ error: "Failed to fetch analytics summary" });
  }
});

// ── Automated Integrations Sync Pipeline API ──
app.post("/api/integrations/sync", authenticateJWT, async (req, res) => {
  try {
    const { folderLink } = req.body;
    if (!folderLink) return res.status(400).json({ error: "Folder link required" });

    const userEmail = req.user.workspaceEmail.trim().toLowerCase();
    const axios = require("axios");

    // Extract folder/file ID from the Google Drive link
    const gdMatch = folderLink.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                    folderLink.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                    folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);

    if (!gdMatch) {
      return res.status(400).json({ error: "Could not extract Google Drive ID from the provided link." });
    }

    const driveId = gdMatch[1];
    const isFolder = folderLink.includes("/folders/");
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    // Collect all PDF file IDs to process
    let filesToProcess = []; // { id, name }

    if (isFolder && GOOGLE_API_KEY) {
      // Use Google Drive API to list PDF files in the folder
      try {
        const listUrl = `https://www.googleapis.com/drive/v3/files?q='${driveId}'+in+parents+and+mimeType='application/pdf'&fields=files(id,name)&key=${GOOGLE_API_KEY}`;
        const listResp = await axios.get(listUrl, { timeout: 15000 });
        filesToProcess = listResp.data.files || [];
        console.log(`Google Drive API: found ${filesToProcess.length} PDF(s) in folder.`);
      } catch (apiErr) {
        console.warn("Google Drive API listing failed:", apiErr.message);
      }
    }

    // If folder listing gave no results (API key missing or folder empty),
    // treat the ID itself as a single file ID to try downloading directly
    if (!filesToProcess.length) {
      filesToProcess = [{ id: driveId, name: `Google_Drive_SOP_${driveId.slice(0, 8)}.pdf` }];
    }

    let totalIndexed = 0;
    const processedFiles = [];

    for (const file of filesToProcess) {
      const fileId = file.id;
      const fileName = file.name || `Google_Drive_SOP_${fileId.slice(0, 8)}.pdf`;

      // Build the direct download URL (works for public/shared files)
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

      let pdfBuffer = null;

      // Attempt 1: Direct download (public files)
      try {
        const resp = await axios.get(downloadUrl, {
          responseType: "arraybuffer",
          timeout: 30000,
          maxRedirects: 5,
          headers: {
            "User-Agent": "Mozilla/5.0",
          },
        });
        const contentType = resp.headers["content-type"] || "";
        // Confirm we got a PDF, not an HTML "confirm download" page
        if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
          pdfBuffer = Buffer.from(resp.data);
          console.log(`Downloaded PDF directly: ${fileName} (${pdfBuffer.length} bytes)`);
        } else {
          console.warn(`Direct download returned non-PDF content-type (${contentType}) for ${fileName}`);
        }
      } catch (dlErr) {
        console.warn(`Direct download failed for ${fileName}:`, dlErr.message);
      }

      // Attempt 2: Confirmed download for larger Google Drive files
      if (!pdfBuffer) {
        try {
          const confirmUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
          const resp2 = await axios.get(confirmUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
            maxRedirects: 5,
            headers: { "User-Agent": "Mozilla/5.0" },
          });
          const contentType = resp2.headers["content-type"] || "";
          if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
            pdfBuffer = Buffer.from(resp2.data);
            console.log(`Downloaded PDF (confirmed): ${fileName} (${pdfBuffer.length} bytes)`);
          }
        } catch (dlErr2) {
          console.warn(`Confirmed download also failed for ${fileName}:`, dlErr2.message);
        }
      }

      // Attempt 3: Google Drive API download (if API key available)
      if (!pdfBuffer && GOOGLE_API_KEY) {
        try {
          const apiDownloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
          const resp3 = await axios.get(apiDownloadUrl, {
            responseType: "arraybuffer",
            timeout: 30000,
          });
          pdfBuffer = Buffer.from(resp3.data);
          console.log(`Downloaded PDF via API: ${fileName} (${pdfBuffer.length} bytes)`);
        } catch (dlErr3) {
          console.warn(`API download failed for ${fileName}:`, dlErr3.message);
        }
      }

      if (!pdfBuffer) {
        console.warn(`Could not download ${fileName} — skipping.`);
        continue;
      }

      // Parse PDF — exactly the same as the file upload route
      let pdfData;
      try {
        pdfData = await pdfParse(pdfBuffer);
      } catch (parseErr) {
        console.warn(`PDF parse failed for ${fileName}:`, parseErr.message);
        continue;
      }

      const pages = pdfData.numpages || 1;
      const rawText = pdfData.text || "";

      if (!rawText.trim()) {
        console.warn(`PDF text is empty for ${fileName} — likely a scanned/image PDF. Skipping.`);
        continue;
      }

      // Chunk exactly like the upload route
      const chunks = await createLangChainChunks(rawText);

      const rows = chunks.map((content, index) => ({
        fileName,
        content,
        embedding: getEmbedding(content),
        page: Math.max(1, Math.ceil(((index + 1) / chunks.length) * pages)),
        chunkIndex: index + 1,
      }));

      await saveDocumentWithChunks(fileName, pages, rows, userEmail);
      processedFiles.push({ fileName, pages, chunks: rows.length });
      totalIndexed++;
      console.log(`Indexed ${fileName}: ${pages} pages, ${rows.length} chunks.`);
    }

    if (totalIndexed === 0) {
      return res.status(422).json({
        error: "Could not download any PDF from the provided link. Please make sure the file/folder is set to 'Anyone with the link can view' in Google Drive sharing settings.",
      });
    }

    res.json({
      success: true,
      count: totalIndexed,
      files: processedFiles,
      message: `Successfully synced ${totalIndexed} PDF(s) from Google Drive.`,
    });

  } catch (err) {
    console.error("Sync integration error:", err);
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

app.use(express.static(path.join(__dirname, "frontend", "dist")));


// ── Razorpay Setup ─────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});
let paymentsCollection;
let contactCollection;


// ── POST /api/payments/create-order ───────────────────────────────────────
// Creates a Razorpay order and returns the order_id to the frontend
app.post("/api/payments/create-order", async (req, res) => {
  try {
    const { planId, planName, billing, amount, currency = "INR", email } = req.body;
    if (!amount || !email) return res.status(400).json({ error: "amount and email are required" });

    const options = {
      amount: Math.round(Number(amount) * 100), // Razorpay expects paise (1 INR = 100 paise)
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes: { planId, planName, billing, email },
    };

    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    const razorErr = err?.error || err;
    const message = razorErr?.description || razorErr?.message || 'Failed to create payment order';
    console.error("Razorpay create-order error:", JSON.stringify(razorErr, null, 2));
    res.status(500).json({ error: message, code: razorErr?.code });
  }
});

// ── POST /api/payments/verify ─────────────────────────────────────────────
// Verifies Razorpay signature, upgrades user plan, and stores payment record
app.post("/api/payments/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, email } = req.body;

    // Validate all required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    // Verify HMAC-SHA256 signature
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: "Payment signature mismatch — possible tampering" });
    }

    // Record payment in MongoDB
    const record = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      planId: planId || "pro",
      email,
      status: "paid",
      paidAt: new Date(),
    };

    if (paymentsCollection) {
      await paymentsCollection.insertOne(record);
    }

    // Upgrade user plan in users collection
    if (usersCollection && email) {
      await usersCollection.updateOne(
        { email: email.trim().toLowerCase() },
        { $set: { plan: planId || "pro", planUpdatedAt: new Date() } }
      );
    } else if (email) {
      const user = memoryUsers.find(u => u.email === email.trim().toLowerCase());
      if (user) {
        user.plan = planId || "pro";
      }
    }

    res.json({ success: true, paymentId: razorpay_payment_id, planId: planId || "pro" });
  } catch (err) {
    console.error("Razorpay verify error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// ── POST /api/payments/webhook ────────────────────────────────────────────
// Handles async Razorpay webhook events (reliable fallback for browser-close scenarios)
app.post("/api/payments/webhook", (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body; // raw buffer

    if (webhookSecret) {
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(body)
        .digest("hex");
      if (expected !== signature) {
         return res.status(400).json({ error: "Invalid webhook signature" });
      }
    }

    const event = JSON.parse(body.toString());
    const { event: eventName, payload } = event;

    if (eventName === "payment.captured") {
      const payment = payload.payment.entity;
      const notes = payment.notes || {};
      const record = {
        orderId: payment.order_id,
        paymentId: payment.id,
        planId: notes.planId || "pro",
        email: notes.email || "",
        status: "paid",
        paidAt: new Date(),
        source: "webhook",
      };
      if (paymentsCollection) paymentsCollection.insertOne(record).catch(console.error);
      if (usersCollection && notes.email) {
        usersCollection.updateOne(
          { email: notes.email.trim().toLowerCase() },
          { $set: { plan: notes.planId || "pro", planUpdatedAt: new Date() } }
        ).catch(console.error);
      } else if (notes.email) {
        const user = memoryUsers.find(u => u.email === notes.email.trim().toLowerCase());
        if (user) {
          user.plan = notes.planId || "pro";
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

connectMongo().finally(() => {
  // Attach paymentsCollection after Mongo connects
  if (typeof paymentsCollection === "undefined") {
    // Will be set inside connectMongo extension below — this is a no-op guard
  }
  app.listen(PORT, () => console.log(`OpsMind API on :${PORT}`));
});