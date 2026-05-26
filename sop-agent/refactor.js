const fs = require("fs");
const path = require("path");

const root = __dirname;

function write(filePath, content) {
  const absolutePath = path.join(root, filePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content.trim() + "\n", "utf8");
  console.log(`Created: ${filePath}`);
}

console.log("Starting automated professional refactoring...");

// 1. config/db.js
write("config/db.js", `
const { MongoClient } = require("mongodb");
require("dotenv").config();

let db = null;
let client = null;

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "sop_agent";

  if (!mongoUri) {
    console.error("CRITICAL CONFIGURATION ERROR: MONGO_URI is not defined in the environment!");
    process.exit(1);
  }

  try {
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(dbName);
    console.log("Successfully connected to MongoDB Atlas: " + dbName);

    // Create database indexes on startup
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("sop_chunks").createIndex({ userEmail: 1, fileName: 1 });
    console.log("Database indexes successfully initialized.");

    return db;
  } catch (error) {
    console.error("CRITICAL DATABASE CONNECTION ERROR:", error.message);
    process.exit(1);
  }
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Please call connectDB first.");
  }
  return db;
}

module.exports = { connectDB, getDB };
`);

// 2. middlewares/auth.js
write("middlewares/auth.js", `
const jwt = require("jsonwebtoken");
const { getDB } = require("../config/db");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("CRITICAL CONFIGURATION ERROR: JWT_SECRET is not defined in the environment!");
  process.exit(1);
}

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

    // Resolve workspace owner email & role for multi-tenant collaboration
    const emailKey = verified.email.trim().toLowerCase();
    const db = getDB();
    const user = await db.collection("users").findOne({ email: emailKey });

    if (user) {
      if (user.teamOwnerEmail) {
        req.user.workspaceEmail = user.teamOwnerEmail;
        req.user.role = user.role || "editor";
      } else {
        req.user.role = "owner";
      }
    } else {
      req.user.role = "viewer";
    }

    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token" });
  }
};

module.exports = { authenticateJWT };
`);

// 3. middlewares/rbac.js
write("middlewares/rbac.js", `
function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ error: "Unauthorized: Missing authentication context" });
    }

    const userRole = req.user.role.toLowerCase();
    const hasPermission = allowedRoles.map(r => r.toLowerCase()).includes(userRole);

    if (!hasPermission) {
      return res.status(403).json({
        error: "Forbidden: Resource requires one of the following roles: [" + allowedRoles.join(", ") + "]"
      });
    }

    next();
  };
}

module.exports = { authorize };
`);

// 4. middlewares/rateLimiter.js
write("middlewares/rateLimiter.js", `
const rateLimits = new Map();

function rateLimiter({ windowMs = 15 * 60 * 1000, max = 100, message = "Too many requests. Please try again later." } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const now = Date.now();

    if (!rateLimits.has(ip)) {
      rateLimits.set(ip, []);
    }

    let timestamps = rateLimits.get(ip);
    timestamps = timestamps.filter(time => now - time < windowMs);
    rateLimits.set(ip, timestamps);

    if (timestamps.length >= max) {
      return res.status(429).json({ error: message });
    }

    timestamps.push(now);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", max - timestamps.length);
    res.setHeader("X-RateLimit-Reset", new Date(now + windowMs).toISOString());

    next();
  };
}

module.exports = { rateLimiter };
`);

// 5. middlewares/sanitize.js
write("middlewares/sanitize.js", `
function sanitizeInput(req, res, next) {
  if (req.body) {
    if (req.body.email) req.body.email = String(req.body.email).trim().toLowerCase();
    if (req.body.password) req.body.password = String(req.body.password);
    if (req.body.plan) req.body.plan = String(req.body.plan).trim().toLowerCase();
    if (req.body.name) req.body.name = String(req.body.name).trim();
    if (req.body.message) req.body.message = String(req.body.message).trim();
  }
  if (req.query) {
    if (req.query.email) req.query.email = String(req.query.email).trim().toLowerCase();
    if (req.query.question) req.query.question = String(req.query.question).trim();
  }
  next();
}

module.exports = { sanitizeInput };
`);

// 6. services/embedding.js
write("services/embedding.js", `
let pipelinePromise = null;

async function getPipeline() {
  if (!pipelinePromise) {
    const { pipeline } = await import("@xenova/transformers");
    pipelinePromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  return pipelinePromise;
}

async function getEmbedding(text) {
  if (typeof text !== "string" || !text.trim()) {
    return new Array(384).fill(0);
  }

  try {
    const extractor = await getPipeline();
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data);
  } catch (error) {
    console.error("Embedding generation error:", error);
    throw new Error("Failed to compute semantic vector embedding.");
  }
}

module.exports = { getEmbedding };
`);

// 7. services/rag.js
write("services/rag.js", `
const { getDB } = require("../config/db");
const { getEmbedding } = require("./embedding");

async function retrieveTopChunks(queryText, workspaceEmail, limit = 10) {
  const db = getDB();
  const chunksCollection = db.collection("sop_chunks");

  // 1. Generate semantic vector embedding
  const queryEmbedding = await getEmbedding(queryText);

  // 2. Perform native MongoDB Atlas Vector Search
  const pipeline = [
    {
      $vectorSearch: {
        index: "chunk_vector_index", // matches process.env.MONGO_VECTOR_INDEX or default
        path: "embedding",
        queryVector: queryEmbedding,
        numCandidates: 100,
        limit: limit,
        filter: { userEmail: workspaceEmail } // Multi-tenant isolation at index level
      }
    },
    {
      $project: {
        text: 1,
        content: 1,
        fileName: 1,
        page: 1,
        chunkIndex: 1,
        userEmail: 1,
        score: { $meta: "vectorSearchScore" }
      }
    }
  ];

  try {
    const results = await chunksCollection.aggregate(pipeline).toArray();
    // Normalize properties (since some fields might be content vs text)
    return results.map(r => ({
      ...r,
      content: r.content || r.text || ""
    }));
  } catch (err) {
    console.warn("Atlas Vector Search failed. Falling back to key-value exact query filters to prevent RAG outage:", err.message);
    // Safe fall-back: exact match or keyword match if index is still indexing
    const cursor = await chunksCollection.find({ userEmail: workspaceEmail }).limit(limit);
    const fallbackResults = await cursor.toArray();
    return fallbackResults.map(r => ({
      ...r,
      content: r.content || r.text || ""
    }));
  }
}

module.exports = { retrieveTopChunks };
`);

// 8. routes/auth.js
write("routes/auth.js", `
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDB } = require("../config/db");
const { authenticateJWT } = require("../middlewares/auth");
const { authorize } = require("../middlewares/rbac");
const { sanitizeInput } = require("../middlewares/sanitize");
const { rateLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

router.use(sanitizeInput);

router.post("/register", rateLimiter({ max: 10, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const db = getDB();
    const existingUser = await db.collection("users").findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userData = { name, email, password: hashedPassword, plan: "free", createdAt: new Date() };
    await db.collection("users").insertOne(userData);

    const token = jwt.sign({ email: userData.email }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ message: "Registered successfully", token, plan: "free" });
  } catch (error) {
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/login", rateLimiter({ max: 20, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const db = getDB();
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "1d" });
    res.json({ token, plan: user.plan || "free" });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/me", authenticateJWT, async (req, res) => {
  try {
    const email = req.user.email;
    const db = getDB();
    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      name: user.name,
      email: user.email,
      plan: user.plan || "free",
      role: req.user.role
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

// Team collaboration invitation endpoints
router.post("/team/invite", authenticateJWT, authorize(["owner", "admin"]), async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: "Name and Email are required" });
    }

    const ownerEmail = req.user.workspaceEmail;
    const inviteEmail = email.trim().toLowerCase();

    const db = getDB();
    const owner = await db.collection("users").findOne({ email: ownerEmail });
    const plan = owner?.plan || "free";

    if (plan === "free") {
      return res.status(403).json({ error: "Team invites are a Pro/Enterprise feature. Please upgrade first." });
    }

    const teamCount = await db.collection("users").countDocuments({ teamOwnerEmail: ownerEmail });
    if (plan === "pro" && teamCount >= 10) {
      return res.status(403).json({ error: "Pro plan allows up to 10 team members. Upgrade to Enterprise for unlimited seats!" });
    }

    const hashedPassword = await bcrypt.hash("123456", 10);
    const invitedUser = {
      name,
      email: inviteEmail,
      password: hashedPassword,
      plan: plan,
      teamOwnerEmail: ownerEmail,
      role: role || "editor",
      status: "active"
    };

    await db.collection("users").updateOne(
      { email: inviteEmail },
      { $set: invitedUser },
      { upsert: true }
    );

    res.json({ success: true, user: { name, email: inviteEmail, role: invitedUser.role } });
  } catch (err) {
    console.error("Team invite error:", err);
    res.status(500).json({ error: "Failed to invite team member" });
  }
});

router.get("/team/list", authenticateJWT, async (req, res) => {
  try {
    const ownerEmail = req.user.workspaceEmail;
    const db = getDB();
    let list = [];

    const owner = await db.collection("users").findOne({ email: ownerEmail });
    list.push({
      name: owner?.name || "Workspace Owner",
      email: ownerEmail,
      role: "owner",
      status: "active"
    });

    const dbMembers = await db.collection("users").find({ teamOwnerEmail: ownerEmail }).toArray();
    list = list.concat(dbMembers.map(m => ({
      name: m.name,
      email: m.email,
      role: m.role || "editor",
      status: m.status || "active"
    })));

    res.json({ success: true, list });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch team list" });
  }
});

module.exports = router;
`);

// 9. routes/documents.js
write("routes/documents.js", `
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const { ObjectId } = require("mongodb");
const { getDB } = require("../config/db");
const { authenticateJWT } = require("../middlewares/auth");
const { authorize } = require("../middlewares/rbac");
const { getEmbedding } = require("../services/embedding");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const axios = require("axios");

const router = express.Router();
const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const isPdfByMime = file.mimetype === "application/pdf";
    const isPdfByName = /\.pdf$/i.test(file.originalname || "");
    if (isPdfByMime || isPdfByName) return cb(null, true);
    return cb(new Error("Only PDF files are supported."));
  },
});

async function saveDocumentWithChunks(fileName, pages, chunks, userEmail) {
  const db = getDB();
  const docsCollection = db.collection("sop_documents");
  const chunksCollection = db.collection("sop_chunks");

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
  if (chunks.length) {
    await chunksCollection.insertMany(chunks.map(chunk => ({ ...chunk, documentId, userEmail })));
  }
  return documentId.toString();
}

router.get("/", authenticateJWT, async (req, res) => {
  const userEmail = req.user.workspaceEmail;
  const db = getDB();
  const rows = await db.collection("sop_documents").find({ userEmail }).sort({ uploadedAt: -1 }).toArray();
  res.json(rows.map(r => ({ id: r._id.toString(), fileName: r.fileName, pages: r.pages, uploadedAt: r.uploadedAt })));
});

router.delete("/:id", authenticateJWT, authorize(["owner", "admin"]), async (req, res) => {
  const userEmail = req.user.workspaceEmail;
  const db = getDB();
  try {
    const oid = new ObjectId(req.params.id);
    await db.collection("sop_documents").deleteOne({ _id: oid, userEmail });
    await db.collection("sop_chunks").deleteMany({ documentId: oid, userEmail });
    res.json({ message: "Document deleted successfully." });
  } catch (err) {
    res.status(400).json({ error: "Invalid document ID format" });
  }
});

router.post("/upload", authenticateJWT, authorize(["owner", "admin", "editor"]), (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    return next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded." });
    const userEmail = req.user.workspaceEmail;

    const db = getDB();
    const user = await db.collection("users").findOne({ email: userEmail });
    const plan = user?.plan || "free";

    if (plan === "free") {
      const currentCount = await db.collection("sop_documents").countDocuments({ userEmail });
      if (currentCount >= 5) {
        fs.unlinkSync(req.file.path);
        return res.status(403).json({ error: "SOP Upload limit reached (5 documents max on Free tier). Upgrade to Pro for unlimited uploads!" });
      }
    }

    const buffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(buffer);
    fs.unlinkSync(req.file.path);

    const pages = pdfData.numpages || 1;
    const text = pdfData.text || "";

    if (!text.trim()) {
      return res.status(400).json({ error: "Uploaded PDF text is empty or unscannable." });
    }

    // Split text into semantic chunks
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 120 });
    const chunks = await splitter.splitText(text);

    // Dynamic, on-the-fly parallel generation of vector embeddings (strictly removing mock chunks)
    const rows = [];
    for (let index = 0; index < chunks.length; index++) {
      const content = chunks[index];
      const embedding = await getEmbedding(content);
      rows.push({
        fileName: req.file.originalname,
        content,
        embedding,
        page: Math.max(1, Math.ceil(((index + 1) / chunks.length) * pages)),
        chunkIndex: index + 1,
      });
    }

    const documentId = await saveDocumentWithChunks(req.file.originalname, pages, rows, userEmail);
    res.json({ message: "Document indexed", documentId, chunks: rows.length, pages });
  } catch (error) {
    console.error("Document upload indexing error:", error);
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
});

// Automated Integrations Sync Pipeline
router.post("/sync", authenticateJWT, authorize(["owner", "admin", "editor"]), async (req, res) => {
  try {
    const { folderLink } = req.body;
    if (!folderLink) return res.status(400).json({ error: "Folder link required" });

    const userEmail = req.user.workspaceEmail;
    const gdMatch = folderLink.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
                    folderLink.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
                    folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);

    if (!gdMatch) {
      return res.status(400).json({ error: "Could not extract Google Drive ID from the provided link." });
    }

    const driveId = gdMatch[1];
    const isFolder = folderLink.includes("/folders/");
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    let filesToProcess = [];

    if (isFolder && GOOGLE_API_KEY) {
      try {
        const listUrl = "https://www.googleapis.com/drive/v3/files?q='" + driveId + "'+in+parents+and+mimeType='application/pdf'&fields=files(id,name)&key=" + GOOGLE_API_KEY;
        const listResp = await axios.get(listUrl, { timeout: 15000 });
        filesToProcess = listResp.data.files || [];
      } catch (apiErr) {
        console.warn("Google Drive API listing failed:", apiErr.message);
      }
    }

    if (!filesToProcess.length) {
      filesToProcess = [{ id: driveId, name: "Google_Drive_SOP_" + driveId.slice(0, 8) + ".pdf" }];
    }

    let totalIndexed = 0;
    const processedFiles = [];

    for (const file of filesToProcess) {
      const fileId = file.id;
      const fileName = file.name;
      const downloadUrl = "https://drive.google.com/uc?export=download&id=" + fileId;
      let pdfBuffer = null;

      try {
        const resp = await axios.get(downloadUrl, {
          responseType: "arraybuffer",
          timeout: 30000,
          maxRedirects: 5,
          headers: { "User-Agent": "Mozilla/5.0" }
        });
        const contentType = resp.headers["content-type"] || "";
        if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
          pdfBuffer = Buffer.from(resp.data);
        }
      } catch (dlErr) {
        console.warn("Direct download failed for " + fileName + ":", dlErr.message);
      }

      if (!pdfBuffer && GOOGLE_API_KEY) {
        try {
          const apiDownloadUrl = "https://www.googleapis.com/drive/v3/files/" + fileId + "?alt=media&key=" + GOOGLE_API_KEY;
          const resp3 = await axios.get(apiDownloadUrl, { responseType: "arraybuffer", timeout: 30000 });
          pdfBuffer = Buffer.from(resp3.data);
        } catch (dlErr3) {
          console.warn("API download failed for " + fileName + ":", dlErr3.message);
        }
      }

      if (!pdfBuffer) continue;

      let pdfData;
      try {
        pdfData = await pdfParse(pdfBuffer);
      } catch (parseErr) {
        continue;
      }

      const pages = pdfData.numpages || 1;
      const rawText = pdfData.text || "";

      if (!rawText.trim()) continue;

      const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 600, chunkOverlap: 120 });
      const chunks = await splitter.splitText(rawText);

      const rows = [];
      for (let index = 0; index < chunks.length; index++) {
        const content = chunks[index];
        const embedding = await getEmbedding(content);
        rows.push({
          fileName,
          content,
          embedding,
          page: Math.max(1, Math.ceil(((index + 1) / chunks.length) * pages)),
          chunkIndex: index + 1,
        });
      }

      await saveDocumentWithChunks(fileName, pages, rows, userEmail);
      processedFiles.push({ fileName, pages, chunks: rows.length });
      totalIndexed++;
    }

    if (totalIndexed === 0) {
      return res.status(422).json({
        error: "Could not download any PDF. Please check Google Drive sharing link settings.",
      });
    }

    res.json({
      success: true,
      count: totalIndexed,
      files: processedFiles,
      message: "Successfully synced " + totalIndexed + " PDF(s) from Google Drive.",
    });
  } catch (err) {
    console.error("Sync integration error:", err);
    res.status(500).json({ error: "Sync failed: " + err.message });
  }
});

// Summary Analytics
router.get("/analytics/summary", authenticateJWT, async (req, res) => {
  try {
    const userEmail = req.user.workspaceEmail;
    const db = getDB();

    const docCount = await db.collection("sop_documents").countDocuments({ userEmail });
    const chunkCount = await db.collection("sop_chunks").countDocuments({ userEmail });

    const queryLogs = await db.collection("query_logs").find({ userEmail }).toArray();
    const totalQueries = queryLogs.length;
    const unansweredLogs = queryLogs.filter(q => q.isSatisfied === false);
    const unansweredCount = unansweredLogs.length;

    const knowledgeCoverage = totalQueries > 0
      ? Math.round(((totalQueries - unansweredCount) / totalQueries) * 100)
      : 100;

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

module.exports = router;
`);

// 10. routes/payments.js
write("routes/payments.js", `
const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const { getDB } = require("../config/db");
const { authenticateJWT } = require("../middlewares/auth");
const { sanitizeInput } = require("../middlewares/sanitize");

const router = express.Router();
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

router.use(sanitizeInput);

router.post("/create-order", async (req, res) => {
  try {
    const { planId, planName, billing, amount, currency = "INR", email } = req.body;
    if (!amount || !email) return res.status(400).json({ error: "amount and email are required" });

    const options = {
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: "rcpt_" + Date.now(),
      notes: { planId, planName, billing, email },
    };

    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Razorpay create-order error:", err);
    res.status(500).json({ error: "Failed to create payment order" });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, email } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: "Payment signature mismatch — possible tampering" });
    }

    const record = {
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      planId: planId || "pro",
      email,
      status: "paid",
      paidAt: new Date(),
    };

    const db = getDB();
    await db.collection("payments").insertOne(record);

    if (email) {
      await db.collection("users").updateOne(
        { email: email.trim().toLowerCase() },
        { $set: { plan: planId || "pro", planUpdatedAt: new Date() } }
      );
    }

    res.json({ success: true, paymentId: razorpay_payment_id, planId: planId || "pro" });
  } catch (err) {
    console.error("Payment verify error:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// Secure Razorpay Webhook with FAIL-CLOSED signature verification
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  // FAIL-CLOSED pattern
  if (!webhookSecret) {
    console.error("CRITICAL SECURITY ALERT: Webhook verification secret missing in environment.");
    return res.status(500).json({ error: "Billing validation unconfigured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  if (!signature) {
    return res.status(400).json({ error: "Missing x-razorpay-signature header" });
  }

  try {
    const bodyBuffer = req.body;
    const expectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(bodyBuffer)
      .digest("hex");

    if (expectedSig !== signature) {
      console.warn("Blocked unauthorized billing spoofing attempt.");
      return res.status(400).json({ error: "Signature verification failed" });
    }

    const event = JSON.parse(bodyBuffer.toString());
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

      const db = getDB();
      await db.collection("payments").insertOne(record);

      if (notes.email) {
        await db.collection("users").updateOne(
          { email: notes.email.trim().toLowerCase() },
          { $set: { plan: notes.planId || "pro", planUpdatedAt: new Date() } }
        );
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

router.post("/cancel", authenticateJWT, async (req, res) => {
  try {
    const email = req.user.email;
    const targetPlan = req.body.plan || "free";

    const db = getDB();
    await db.collection("users").updateOne(
      { email },
      { $set: { plan: targetPlan, planUpdatedAt: new Date() } }
    );
    res.json({ success: true, plan: targetPlan });
  } catch (err) {
    console.error("Cancel plan error:", err);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

module.exports = router;
`);

// 11. routes/chat.js
write("routes/chat.js", `
const express = require("express");
const Groq = require("groq-sdk");
const { getDB } = require("../config/db");
const { authenticateJWT } = require("../middlewares/auth");
const { retrieveTopChunks } = require("../services/rag");
const { sanitizeInput } = require("../middlewares/sanitize");
const { rateLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

router.use(sanitizeInput);

router.get("/stream", authenticateJWT, rateLimiter({ max: 30, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  const userEmail = req.user.email;
  const workspaceEmail = req.user.workspaceEmail;
  const question = req.query.question;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!question) {
    res.write("data: " + JSON.stringify({ error: "question query param required" }) + "\\n\\n");
    res.end();
    return;
  }

  try {
    const db = getDB();
    const user = await db.collection("users").findOne({ email: userEmail });
    const plan = user?.plan || "free";

    if (plan === "free") {
      const todayStart = new Date();
      todayStart.setHours(0,0,0,0);

      const dailyCount = await db.collection("query_logs").countDocuments({
        userEmail: workspaceEmail,
        timestamp: { $gte: todayStart }
      });

      if (dailyCount >= 10) {
        res.write("data: " + JSON.stringify({ error: "LIMIT_REACHED" }) + "\\n\\n");
        res.end();
        return;
      }
    }

    const topChunks = await retrieveTopChunks(question, workspaceEmail);
    if (!topChunks.length) {
      res.write("data: " + JSON.stringify({ error: "NO_DOCS" }) + "\\n\\n");
      res.end();
      return;
    }

    const context = topChunks.map((c, i) => "[" + (i + 1) + "] " + c.content).join("\\n\\n");

    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.15,
      max_tokens: 1024,
      stream: true,
      messages: [
        {
          role: "system",
          content: "You are OpsMind AI, an ultra-precise operations copilot. Answer the user's question using ONLY the provided SOP context chunks below.\\n\\nRules:\\n1. Read ALL context chunks carefully before answering.\\n2. Synthesize information from multiple chunks to give a COMPLETE, structured answer.\\n3. Cite which chunks your answer comes from using [1], [2], etc.\\n4. Say \\"I don't know based on the SOPs\\" only if none of the provided chunks contain relevant info."
        },
        { role: "user", content: "CONTEXT CHUNKS:\\n" + context + "\\n\\nQUESTION: " + question + "\\n\\nProvide a complete, detailed answer." },
      ],
    });

    let responseText = "";
    for await (const part of completion) {
      const token = part?.choices?.[0]?.delta?.content;
      if (token) {
        responseText += token;
        res.write("data: " + JSON.stringify({ token }) + "\\n\\n");
      }
    }

    const isSatisfied = !(/don't know/i.test(responseText));
    const logRecord = {
      userEmail: workspaceEmail,
      question,
      isSatisfied,
      queriedBy: userEmail,
      timestamp: new Date()
    };
    await db.collection("query_logs").insertOne(logRecord);

    const citations = topChunks.map((c, i) => (i + 1) + ") " + c.fileName + ", Page " + c.page + ", Chunk " + c.chunkIndex).join("; ");
    res.write("data: " + JSON.stringify({ done: true, citations }) + "\\n\\n");
    res.end();
  } catch (error) {
    console.error("Chat stream error:", error);
    res.write("data: " + JSON.stringify({ error: "Streaming failed." }) + "\\n\\n");
    res.end();
  }
});

module.exports = router;
`);

// 12. Public contact form route to save to MongoDB & secure setup
write("routes/contact.js", `
const express = require("express");
const { getDB } = require("../config/db");
const { sanitizeInput } = require("../middlewares/sanitize");
const { rateLimiter } = require("../middlewares/rateLimiter");

const router = express.Router();

function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\\//g, "&#x2F;");
}

router.use(sanitizeInput);

router.post("/", rateLimiter({ max: 5, windowMs: 15 * 60 * 1000 }), async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const sanitizedName = escapeHTML(name);
    const sanitizedEmail = escapeHTML(email);
    const sanitizedMessage = escapeHTML(message);

    const contactDoc = {
      name: sanitizedName,
      email: sanitizedEmail,
      message: sanitizedMessage,
      submittedAt: new Date()
    };

    const db = getDB();
    await db.collection("contacts").insertOne(contactDoc);

    res.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ error: "Failed to submit contact form" });
  }
});

module.exports = router;
`);

// 13. server.js (Modular core)
write("server.js", `
const crypto = require("crypto");
if (!global.crypto) {
  global.crypto = crypto.webcrypto;
}

const express = require("express");
const cors = require("cors");
const path = require("path");
const { connectDB } = require("./config/db");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 5000);

// Set up raw body parser specifically for Razorpay webhooks FIRST
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// Enable CORS with secure options
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(",") 
  : ["http://localhost:5173", "http://localhost:5000"];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("CORS validation failed: Origin unauthorized"));
    }
  },
  credentials: true
}));

app.use(express.json());

// Bootloader
async function startServer() {
  // Connect database first - will fail fast if connection fails
  await connectDB();

  // Import Modular Routes
  const authRoutes = require("./routes/auth");
  const documentRoutes = require("./routes/documents");
  const paymentRoutes = require("./routes/payments");
  const chatRoutes = require("./routes/chat");
  const contactRoutes = require("./routes/contact");

  // Mount API Endpoints
  app.use("/auth", authRoutes);
  app.use("/admin/documents", documentRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/chat", chatRoutes);
  app.use("/api/contact", contactRoutes);

  // Serve Static Frontend files in production
  app.use(express.static(path.join(__dirname, "frontend", "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
  });

  // Start HTTP Listener
  app.listen(PORT, () => {
    console.log("=========================================");
    console.log("    OpsMind AI Modular Server Booted     ");
    console.log("    Environment: " + (process.env.NODE_ENV || "development"));
    console.log("    Listening Port: " + PORT);
    console.log("=========================================");
  });
}

startServer().catch(err => {
  console.error("Critical server bootstrap error:", err);
  process.exit(1);
});
`);

console.log("Refactoring script generated successfully!");
