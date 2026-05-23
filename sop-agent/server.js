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
const TOP_K_CHUNKS = Number(process.env.TOP_K_CHUNKS || 5);
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
const memoryStore = { documents: [], chunks: [] };
const memoryUsers = [];

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
    paymentsCollection = db.collection("payments");
    contactCollection = db.collection("contacts");
    console.log(`Mongo connected: ${MONGO_DB_NAME}`);
  } catch (error) {
    docsCollection = null;
    chunksCollection = null;
    contactCollection = null;
    console.warn(`Mongo connection failed (${error.code || error.name}). Using in-memory store.`);
  }
}

async function createLangChainChunks(text) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 900, chunkOverlap: 120 });
  return splitter.splitText(text);
}

async function saveDocumentWithChunks(fileName, pages, chunks) {
  if (!docsCollection || !chunksCollection) {
    const id = `mem-${Date.now()}`;
    memoryStore.documents.push({ id, fileName, pages, uploadedAt: new Date().toISOString() });
    memoryStore.chunks = chunks;
    return id;
  }

  const doc = await docsCollection.insertOne({ fileName, pages, uploadedAt: new Date() });
  const documentId = doc.insertedId;
  if (chunks.length) await chunksCollection.insertMany(chunks.map(chunk => ({ ...chunk, documentId })));
  return documentId.toString();
}

async function retrieveTopChunks(question) {
  const queryVector = getEmbedding(question);
  if (chunksCollection) {
    try {
      const dbRows = await chunksCollection.aggregate([
        { $vectorSearch: { index: VECTOR_INDEX, path: "embedding", queryVector, numCandidates: 60, limit: TOP_K_CHUNKS } },
        { $project: { _id: 1, fileName: 1, page: 1, chunkIndex: 1, content: 1, score: { $meta: "vectorSearchScore" } } },
      ]).toArray();
      if (dbRows.length) return dbRows;
    } catch (error) {
      console.warn("Vector search fallback:", error.message);
    }
  }

  return memoryStore.chunks
    .map(chunk => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_CHUNKS);
}

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
      token
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

    res.json({ token });

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

app.get("/admin/documents", async (req, res) => {
  if (docsCollection) {
    const rows = await docsCollection.find({}).sort({ uploadedAt: -1 }).toArray();
    return res.json(rows.map(r => ({ id: r._id.toString(), fileName: r.fileName, pages: r.pages, uploadedAt: r.uploadedAt })));
  }
  return res.json(memoryStore.documents);
});

app.delete("/admin/documents/:id", async (req, res) => {
  if (docsCollection && chunksCollection) {
    const oid = new ObjectId(req.params.id);
    await docsCollection.deleteOne({ _id: oid });
    await chunksCollection.deleteMany({ documentId: oid });
  } else {
    memoryStore.documents = memoryStore.documents.filter(d => d.id !== req.params.id);
    memoryStore.chunks = [];
  }
  res.json({ message: "Document deleted." });
});

app.post("/admin/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || "Upload failed" });
    return next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded." });
    const buffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(buffer);
    fs.unlinkSync(req.file.path);

    const pages = pdfData.numpages || 1;
    const chunks = await createLangChainChunks(pdfData.text || "");

    const rows = chunks.map((content, index) => ({
      fileName: req.file.originalname,
      content,
      embedding: getEmbedding(content),
      page: Math.max(1, Math.ceil(((index + 1) / chunks.length) * pages)),
      chunkIndex: index + 1,
    }));

    const documentId = await saveDocumentWithChunks(req.file.originalname, pages, rows);
    res.json({ message: "Document indexed", documentId, chunks: rows.length, pages });
  } catch (error) {
    res.status(500).json({ error: "Upload failed", details: error.message });
  }
});

app.get("/chat/stream", async (req, res) => {
  const question = String(req.query.question || "").trim();
  if (!question) return res.status(400).json({ error: "question query param required" });

  const topChunks = await retrieveTopChunks(question);
  if (!topChunks.length) return res.status(400).json({ error: "No SOP chunks. Upload documents first." });

  const context = topChunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
      temperature: 0.1,
      stream: true,
      messages: [
        { role: "system", content: "Answer only from context. If not found say: I don't know based on the SOPs." },
        { role: "user", content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}` },
      ],
    });

    for await (const part of completion) {
      const token = part?.choices?.[0]?.delta?.content;
      if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    const citations = topChunks.map((c, i) => `${i + 1}) ${c.fileName}, Page ${c.page}, Chunk ${c.chunkIndex}`).join("; ");
    res.write(`data: ${JSON.stringify({ done: true, citations })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: "Streaming failed." })}\n\n`);
    res.end();
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

// Debug: confirm which keys are loaded
console.log("Razorpay Key ID loaded:", process.env.RAZORPAY_KEY_ID);
console.log("Razorpay Secret length:", (process.env.RAZORPAY_KEY_SECRET || "").length);

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
  console.log(process.env.GROQ_API_KEY);
  console.log(process.env.GROQ_MODEL);
  app.listen(PORT, () => console.log(`OpsMind API on :${PORT}`));
});