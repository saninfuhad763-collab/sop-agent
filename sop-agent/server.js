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
const { ObjectId } = require("mongodb");
const Groq = require("groq-sdk");
const Razorpay = require("razorpay");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Import custom modules
const { getNeuralEmbedding } = require("./embedding");
const { authorizeRoles } = require("./rbac");
const { createRateLimiter } = require("./ratelimit");
const { connectDatabase } = require("./db");
const { createParentChildChunks, retrieveTopChunks } = require("./rag");

const app = express();

// Configure global database collections
let docsCollection = null;
let chunksCollection = null;
let usersCollection = null;
let queryLogsCollection = null;
let paymentsCollection = null;
let contactCollection = null;

const memoryStore = { documents: [], chunks: [] };
const memoryUsers = [];
const memoryQueryLogs = [];

// Expose collections and memory states for middleware access
app.set("memoryUsers", memoryUsers);

const PORT = Number(process.env.PORT || 5000);
const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Raw body needed for Razorpay webhook signature validation
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // Allow all origins in dev
    credentials: true,
  })
);
app.use(express.json());

// Set up rate limiters for security and resource control
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: "Too many authentication attempts from this IP. Please try again after 15 minutes."
});

const contactLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: "Too many contact submissions. Please try again in an hour."
});

const chatLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 60,
  message: "Daily or hourly query threshold exceeded. Please try again later."
});

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
  if (!docsCollection || !chunksCollection) {
    memoryStore.documents = memoryStore.documents.filter(
      (d) => !(d.fileName === fileName && d.userEmail === userEmail)
    );
    memoryStore.chunks = memoryStore.chunks.filter(
      (c) => !(c.fileName === fileName && c.userEmail === userEmail)
    );

    const id = `mem-${Date.now()}`;
    memoryStore.documents.push({
      id,
      fileName,
      pages,
      uploadedAt: new Date().toISOString(),
      userEmail,
    });
    const chunksWithMetadata = chunks.map((c) => ({
      ...c,
      documentId: id,
      userEmail,
    }));
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

  const doc = await docsCollection.insertOne({
    fileName,
    pages,
    uploadedAt: new Date(),
    userEmail,
  });
  const documentId = doc.insertedId;
  if (chunks.length) {
    await chunksCollection.insertMany(
      chunks.map((chunk) => ({ ...chunk, documentId, userEmail }))
    );
  }
  return documentId.toString();
}

function escapeHTML(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
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
      plan: user.plan || "free",
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user profile" });
  }
});

app.post("/auth/register", authLimiter, async (req, res) => {
  try {
    // String coercion protects against NoSQL injection
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    let existingUser;
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
    const sanitizedName = escapeHTML(name);

    const userData = {
      name: sanitizedName,
      email,
      password: hashedPassword,
      plan: "free",
    };

    if (usersCollection) {
      await usersCollection.insertOne(userData);
    } else {
      memoryUsers.push(userData);
    }

    const token = jwt.sign({ email: userData.email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({
      message: "Registered successfully",
      token,
      plan: "free",
    });
  } catch (error) {
    res.status(500).json({
      error: "Registration failed",
    });
  }
});

app.post("/auth/login", authLimiter, async (req, res) => {
  try {
    // String coercion protects against NoSQL injection
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password required",
      });
    }

    let user;
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

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({
        error: "Invalid credentials",
      });
    }

    const token = jwt.sign({ email: user.email }, JWT_SECRET, {
      expiresIn: "1d",
    });

    res.json({ token, plan: user.plan || "free" });
  } catch (error) {
    res.status(500).json({
      error: "Login failed",
    });
  }
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  try {
    // Coercion & escaping prevents NoSQL injection and Stored XSS
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const message = String(req.body.message || "").trim();

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
      submittedAt: new Date().toISOString(),
    };

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

app.get(
  "/admin/documents",
  authenticateJWT,
  authorizeRoles(["owner", "editor", "viewer"]),
  async (req, res) => {
    const userEmail = req.user.workspaceEmail.trim().toLowerCase();
    if (docsCollection) {
      const rows = await docsCollection
        .find({ userEmail })
        .sort({ uploadedAt: -1 })
        .toArray();
      return res.json(
        rows.map((r) => ({
          id: r._id.toString(),
          fileName: r.fileName,
          pages: r.pages,
          uploadedAt: r.uploadedAt,
        }))
      );
    }
    const filtered = memoryStore.documents.filter((d) => d.userEmail === userEmail);
    return res.json(filtered);
  }
);

app.delete(
  "/admin/documents/:id",
  authenticateJWT,
  authorizeRoles(["owner", "editor"]),
  async (req, res) => {
    const userEmail = req.user.workspaceEmail.trim().toLowerCase();
    if (docsCollection && chunksCollection) {
      const oid = new ObjectId(req.params.id);
      await docsCollection.deleteOne({ _id: oid, userEmail });
      await chunksCollection.deleteMany({ documentId: oid, userEmail });
    } else {
      memoryStore.documents = memoryStore.documents.filter(
        (d) => !(d.id === req.params.id && d.userEmail === userEmail)
      );
      memoryStore.chunks = memoryStore.chunks.filter(
        (c) => !(c.documentId === req.params.id && c.userEmail === userEmail)
      );
    }
    res.json({ message: "Document deleted." });
  }
);

app.post(
  "/admin/upload",
  authenticateJWT,
  authorizeRoles(["owner", "editor"]),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      return next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No PDF uploaded." });
      const userEmail = req.user.workspaceEmail.trim().toLowerCase();

      // Check user plan limits
      let user;
      if (usersCollection) {
        user = await usersCollection.findOne({ email: userEmail });
      } else {
        user = memoryUsers.find((u) => u.email === userEmail);
      }
      const plan = user?.plan || "free";

      if (plan === "free") {
        let currentCount = 0;
        if (docsCollection) {
          currentCount = await docsCollection.countDocuments({ userEmail });
        } else {
          currentCount = memoryStore.documents.filter(
            (d) => d.userEmail === userEmail
          ).length;
        }

        if (currentCount >= 5) {
          return res.status(403).json({
            error:
              "SOP Upload limit reached (5 documents max on Free tier). Upgrade to Pro for unlimited uploads!",
          });
        }
      }

      const buffer = fs.readFileSync(req.file.path);
      const pdfData = await pdfParse(buffer);
      fs.unlinkSync(req.file.path);

      const pages = pdfData.numpages || 1;

      // Adopting high-fidelity Parent-Child retrieval partitioning (NO MOCKS)
      const rawChunks = await createParentChildChunks(pdfData.text || "");
      if (!rawChunks.length) {
        return res.status(422).json({ error: "Could not parse readable text from the uploaded PDF." });
      }

      const rows = [];
      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i];
        const embedding = await getNeuralEmbedding(chunk.content);
        rows.push({
          fileName: req.file.originalname,
          content: chunk.content,
          parentContent: chunk.parentContent,
          embedding: embedding,
          page: Math.max(1, Math.ceil(((i + 1) / rawChunks.length) * pages)),
          chunkIndex: i + 1,
        });
      }

      const documentId = await saveDocumentWithChunks(
        req.file.originalname,
        pages,
        rows,
        userEmail
      );
      res.json({ message: "Document indexed", documentId, chunks: rows.length, pages });
    } catch (error) {
      res.status(500).json({ error: "Upload failed", details: error.message });
    }
  }
);

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
      const user = memoryUsers.find((u) => u.email === email);
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

app.get("/chat/stream", authenticateJWT, chatLimiter, async (req, res) => {
  const userEmail = req.user.email.trim().toLowerCase();
  const workspaceEmail = req.user.workspaceEmail.trim().toLowerCase();
  const question = String(req.query.question || "").trim();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!question) {
    res.write(
      `data: ${JSON.stringify({ error: "question query param required" })}\n\n`
    );
    res.end();
    return;
  }

  // Check user plan for daily query limits (Free: 10 queries per day)
  let user;
  if (usersCollection) {
    user = await usersCollection.findOne({ email: userEmail });
  } else {
    user = memoryUsers.find((u) => u.email === userEmail);
  }
  const plan = user?.plan || "free";

  if (plan === "free") {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    let dailyCount = 0;
    if (queryLogsCollection) {
      dailyCount = await queryLogsCollection.countDocuments({
        userEmail: workspaceEmail,
        timestamp: { $gte: todayStart },
      });
    } else {
      dailyCount = memoryQueryLogs.filter(
        (log) =>
          log.userEmail === workspaceEmail && new Date(log.timestamp) >= todayStart
      ).length;
    }

    if (dailyCount >= 10) {
      res.write(`data: ${JSON.stringify({ error: "LIMIT_REACHED" })}\n\n`);
      res.end();
      return;
    }
  }

  const topChunks = await retrieveTopChunks(
    question,
    workspaceEmail,
    chunksCollection,
    memoryStore
  );

  if (!topChunks.length) {
    res.write(`data: ${JSON.stringify({ error: "NO_DOCS" })}\n\n`);
    res.end();
    return;
  }

  // Supply semantic parentContent context for complete RAG retrieval scope
  const context = topChunks
    .map(
      (c, i) =>
        `[${i + 1}] [Source: ${c.fileName}, Page ${c.page}] ${
          c.parentContent || c.content
        }`
    )
    .join("\n\n");

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
8. Never fabricate information not present in the context.`,
        },
        {
          role: "user",
          content: `CONTEXT CHUNKS:\n${context}\n\nQUESTION: ${question}\n\nProvide a complete, detailed answer based on the context above.`,
        },
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
    const isSatisfied = !/don't know/i.test(responseText);
    const logRecord = {
      userEmail: workspaceEmail,
      question,
      isSatisfied,
      queriedBy: userEmail,
      timestamp: new Date(),
    };
    if (queryLogsCollection) {
      await queryLogsCollection.insertOne(logRecord);
    } else {
      memoryQueryLogs.push(logRecord);
    }

    const citations = topChunks
      .map(
        (c, i) => `${i + 1}) ${c.fileName}, Page ${c.page}, Chunk ${c.chunkIndex}`
      )
      .join("; ");
    res.write(`data: ${JSON.stringify({ done: true, citations })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: "Streaming failed." })}\n\n`);
    res.end();
  }
});

// ── Team Members / Collaboration API ──
app.post(
  "/api/team/invite",
  authenticateJWT,
  authorizeRoles(["owner"]),
  async (req, res) => {
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
        owner = memoryUsers.find((u) => u.email === ownerEmail);
      }

      const plan = owner?.plan || "free";
      if (plan === "free") {
        return res
          .status(403)
          .json({
            error: "Team invites are a Pro/Enterprise feature. Please upgrade first.",
          });
      }

      let teamCount = 0;
      if (usersCollection) {
        teamCount = await usersCollection.countDocuments({
          teamOwnerEmail: ownerEmail,
        });
      } else {
        teamCount = memoryUsers.filter((u) => u.teamOwnerEmail === ownerEmail).length;
      }

      if (plan === "pro" && teamCount >= 10) {
        return res
          .status(403)
          .json({
            error:
              "Pro plan allows up to 10 team members. Upgrade to Enterprise for unlimited seats!",
          });
      }

      const hashedPassword = await bcrypt.hash("123456", 10); // default starting password
      const invitedUser = {
        name,
        email: inviteEmail,
        password: hashedPassword,
        plan: plan,
        teamOwnerEmail: ownerEmail,
        role: role || "editor",
        status: "active",
      };

      if (usersCollection) {
        await usersCollection.updateOne(
          { email: inviteEmail },
          { $set: invitedUser },
          { upsert: true }
        );
      } else {
        const idx = memoryUsers.findIndex((u) => u.email === inviteEmail);
        if (idx !== -1) {
          memoryUsers[idx] = invitedUser;
        } else {
          memoryUsers.push(invitedUser);
        }
      }

      res.json({
        success: true,
        user: { name, email: inviteEmail, role: invitedUser.role },
      });
    } catch (err) {
      console.error("Team invite error:", err);
      res.status(500).json({ error: "Failed to invite team member" });
    }
  }
);

app.get(
  "/api/team/list",
  authenticateJWT,
  authorizeRoles(["owner", "editor", "viewer"]),
  async (req, res) => {
    try {
      const ownerEmail = req.user.workspaceEmail.trim().toLowerCase();
      let list = [];

      // Get owner details
      let owner;
      if (usersCollection) {
        owner = await usersCollection.findOne({ email: ownerEmail });
      } else {
        owner = memoryUsers.find((u) => u.email === ownerEmail);
      }

      list.push({
        name: owner?.name || "Workspace Owner",
        email: ownerEmail,
        role: "owner",
        status: "active",
      });

      if (usersCollection) {
        const dbMembers = await usersCollection
          .find({ teamOwnerEmail: ownerEmail })
          .toArray();
        list = list.concat(
          dbMembers.map((m) => ({
            name: m.name,
            email: m.email,
            role: m.role || "editor",
            status: m.status || "active",
          }))
        );
      } else {
        const memMembers = memoryUsers.filter(
          (u) => u.teamOwnerEmail === ownerEmail
        );
        list = list.concat(
          memMembers.map((m) => ({
            name: m.name,
            email: m.email,
            role: m.role || "editor",
            status: m.status || "active",
          }))
        );
      }

      res.json({ success: true, list });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch team list" });
    }
  }
);

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
      docCount = memoryStore.documents.filter((d) => d.userEmail === userEmail).length;
      chunkCount = memoryStore.chunks.filter((c) => c.userEmail === userEmail).length;
    }

    // 2. Query Logs count & knowledge gaps
    let queryLogs = [];
    if (queryLogsCollection) {
      queryLogs = await queryLogsCollection.find({ userEmail }).toArray();
    } else {
      queryLogs = memoryQueryLogs.filter((q) => q.userEmail === userEmail);
    }

    const totalQueries = queryLogs.length;
    const unansweredLogs = queryLogs.filter((q) => q.isSatisfied === false);
    const unansweredCount = unansweredLogs.length;

    const knowledgeCoverage =
      totalQueries > 0
        ? Math.round(((totalQueries - unansweredCount) / totalQueries) * 100)
        : 100;

    // 3. Trends: last 7 days query counts
    const trends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextDay = new Date(d);
      nextDay.setDate(nextDay.getDate() + 1);

      const count = queryLogs.filter((q) => {
        const ts = new Date(q.timestamp);
        return ts >= d && ts < nextDay;
      }).length;

      trends.push({
        day: d.toLocaleDateString("en-US", { weekday: "short" }),
        count,
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
      gaps: unansweredLogs.map((g) => ({
        question: g.question,
        timestamp: g.timestamp,
        userEmail: g.queriedBy || g.userEmail,
      })),
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
    const gdMatch =
      folderLink.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      folderLink.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
      folderLink.match(/folders\/([a-zA-Z0-9_-]+)/);

    if (!gdMatch) {
      return res
        .status(400)
        .json({ error: "Could not extract Google Drive ID from the provided link." });
    }

    const driveId = gdMatch[1];
    const isFolder = folderLink.includes("/folders/");
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    // Collect all PDF file IDs to process
    let filesToProcess = [];

    if (isFolder && GOOGLE_API_KEY) {
      try {
        const listUrl = `https://www.googleapis.com/drive/v3/files?q='${driveId}'+in+parents+and+mimeType='application/pdf'&fields=files(id,name)&key=${GOOGLE_API_KEY}`;
        const listResp = await axios.get(listUrl, { timeout: 15000 });
        filesToProcess = listResp.data.files || [];
        console.log(`Google Drive API: found ${filesToProcess.length} PDF(s) in folder.`);
      } catch (apiErr) {
        console.warn("Google Drive API listing failed:", apiErr.message);
      }
    }

    if (!filesToProcess.length) {
      filesToProcess = [
        { id: driveId, name: `Google_Drive_SOP_${driveId.slice(0, 8)}.pdf` },
      ];
    }

    let totalIndexed = 0;
    const processedFiles = [];

    for (const file of filesToProcess) {
      const fileId = file.id;
      const fileName = file.name || `Google_Drive_SOP_${fileId.slice(0, 8)}.pdf`;
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

      let pdfBuffer = null;

      // Attempt 1: Direct download
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
        if (
          contentType.includes("application/pdf") ||
          contentType.includes("octet-stream")
        ) {
          pdfBuffer = Buffer.from(resp.data);
          console.log(`Downloaded PDF directly: ${fileName} (${pdfBuffer.length} bytes)`);
        }
      } catch (dlErr) {
        console.warn(`Direct download failed for ${fileName}:`, dlErr.message);
      }

      // Attempt 2: Confirmed download
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
          if (
            contentType.includes("application/pdf") ||
            contentType.includes("octet-stream")
          ) {
            pdfBuffer = Buffer.from(resp2.data);
            console.log(`Downloaded PDF (confirmed): ${fileName} (${pdfBuffer.length} bytes)`);
          }
        } catch (dlErr2) {
          console.warn(`Confirmed download also failed for ${fileName}:`, dlErr2.message);
        }
      }

      // Attempt 3: API download
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
        console.warn(`PDF text is empty for ${fileName} — skipping.`);
        continue;
      }

      // Sync and Chunk exactly like the high-fidelity manual upload route
      const rawChunks = await createParentChildChunks(rawText);
      if (!rawChunks.length) continue;

      const rows = [];
      for (let i = 0; i < rawChunks.length; i++) {
        const chunk = rawChunks[i];
        const embedding = await getNeuralEmbedding(chunk.content);
        rows.push({
          fileName,
          content: chunk.content,
          parentContent: chunk.parentContent,
          embedding: embedding,
          page: Math.max(1, Math.ceil(((i + 1) / rawChunks.length) * pages)),
          chunkIndex: i + 1,
        });
      }

      await saveDocumentWithChunks(fileName, pages, rows, userEmail);
      processedFiles.push({ fileName, pages, chunks: rows.length });
      totalIndexed++;
      console.log(`Indexed ${fileName}: ${pages} pages, ${rows.length} chunks.`);
    }

    if (totalIndexed === 0) {
      return res.status(422).json({
        error:
          "Could not download any PDF from the provided link. Please make sure the file/folder is set to 'Anyone with the link can view' in Google Drive sharing settings.",
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
  key_id: process.env.RAZORPAY_KEY_ID || "placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "placeholder",
});

// ── POST /api/payments/create-order ───────────────────────────────────────
app.post("/api/payments/create-order", async (req, res) => {
  try {
    const { planId, planName, billing, amount, currency = "INR", email } = req.body;
    if (!amount || !email) return res.status(400).json({ error: "amount and email are required" });

    const options = {
      amount: Math.round(Number(amount) * 100), // paise
      currency,
      receipt: `rcpt_${Date.now()}`,
      notes: { planId, planName, billing, email },
    };

    const order = await razorpay.orders.create(options);
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    const razorErr = err?.error || err;
    const message =
      razorErr?.description || razorErr?.message || "Failed to create payment order";
    console.error("Razorpay create-order error:", JSON.stringify(razorErr, null, 2));
    res.status(500).json({ error: message, code: razorErr?.code });
  }
});

// ── POST /api/payments/verify ─────────────────────────────────────────────
app.post("/api/payments/verify", async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, email } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment verification fields" });
    }

    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
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

    if (paymentsCollection) {
      await paymentsCollection.insertOne(record);
    }

    if (usersCollection && email) {
      await usersCollection.updateOne(
        { email: email.trim().toLowerCase() },
        { $set: { plan: planId || "pro", planUpdatedAt: new Date() } }
      );
    } else if (email) {
      const user = memoryUsers.find((u) => u.email === email.trim().toLowerCase());
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
app.post("/api/payments/webhook", (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body; // raw buffer

    // Tightening Webhooks: Strict "Fail-Closed" Signature Verification
    if (!webhookSecret) {
      console.error("FATAL: RAZORPAY_WEBHOOK_SECRET environment variable is not defined!");
      return res.status(500).json({ error: "Webhook secret configuration missing on server" });
    }

    if (!signature) {
      return res.status(400).json({ error: "Missing x-razorpay-signature header validation" });
    }

    const expected = crypto
      .createHmac("sha256", webhookSecret)
      .update(body)
      .digest("hex");

    if (expected !== signature) {
      console.warn("Unauthorized/tampered webhook payload attempt blocked.");
      return res.status(400).json({ error: "Invalid webhook signature" });
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
        usersCollection
          .updateOne(
            { email: notes.email.trim().toLowerCase() },
            { $set: { plan: notes.planId || "pro", planUpdatedAt: new Date() } }
          )
          .catch(console.error);
      } else if (notes.email) {
        const user = memoryUsers.find((u) => u.email === notes.email.trim().toLowerCase());
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

// Serve frontend static files
app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

// Initialize database connection and start application server listener
connectDatabase()
  .then((collections) => {
    docsCollection = collections.docsCollection;
    chunksCollection = collections.chunksCollection;
    usersCollection = collections.usersCollection;
    queryLogsCollection = collections.queryLogsCollection;
    paymentsCollection = collections.paymentsCollection;
    contactCollection = collections.contactCollection;

    // Register active references in express instance for dynamic middleware accesses
    app.set("usersCollection", usersCollection);

    app.listen(PORT, () => console.log(`✅ OpsMind API Listening on Port :${PORT}`));
  })
  .catch((err) => {
    console.error("Failed to bootstrap server components:", err);
    process.exit(1);
  });