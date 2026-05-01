const crypto = require("crypto");
global.crypto = crypto;
const cors = require("cors");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");
const Groq = require("groq-sdk");
require("dotenv").config();

const app = express();
app.use(cors());
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

let mongoClient;
let docsCollection;
let chunksCollection;

const memoryStore = { documents: [], chunks: [] };

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const isPdf = file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, isPdf);
  },
});

function normalizeText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function chunkText(text, chunkSize = 900, overlap = 120) {
  const cleaned = normalizeText(text);
  const chunks = [];
  let start = 0;

  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = end - overlap;
  }

  return chunks;
}

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
  let score = 0;
  for (let i = 0; i < a.length; i += 1) score += a[i] * b[i];
  return score;
}

async function connectMongo() {
  if (!MONGO_URI) {
    console.warn("⚠️ MONGO_URI not configured: using in-memory storage only.");
    return;
  }

  mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db(MONGO_DB_NAME);
  docsCollection = db.collection(DOC_COLLECTION);
  chunksCollection = db.collection(CHUNK_COLLECTION);
  console.log("✅ MongoDB Atlas connected.");
}

async function saveDocumentWithChunks(fileName, pages, chunks) {
  if (!chunksCollection || !docsCollection) {
    memoryStore.documents.push({ id: `mem-${Date.now()}`, fileName, pages, uploadedAt: new Date().toISOString() });
    memoryStore.chunks = chunks;
    return { id: memoryStore.documents[memoryStore.documents.length - 1].id };
  }

  const docResult = await docsCollection.insertOne({ fileName, pages, uploadedAt: new Date() });
  const documentId = docResult.insertedId;

  if (chunks.length) {
    const rows = chunks.map(chunk => ({ ...chunk, documentId }));
    await chunksCollection.insertMany(rows);
  }

  return { id: documentId.toString() };
}

async function retrieveTopChunks(question) {
  const queryVector = getEmbedding(question);

  if (chunksCollection) {
    try {
      const result = await chunksCollection.aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector,
            numCandidates: 60,
            limit: TOP_K_CHUNKS,
          },
        },
        {
          $project: {
            _id: 1,
            page: 1,
            chunkIndex: 1,
            content: 1,
            fileName: 1,
            score: { $meta: "vectorSearchScore" },
          },
        },
      ]).toArray();

      if (result.length) return result;
    } catch (error) {
      console.warn("⚠️ Mongo vector search unavailable, falling back to memory scoring.", error.message);
    }
  }

  return memoryStore.chunks
    .map((chunk) => ({ ...chunk, score: cosineSimilarity(queryVector, chunk.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_CHUNKS);
}

app.get("/", (req, res) => res.send("OpsMind AI backend online"));

app.get("/admin/documents", async (req, res) => {
  if (docsCollection) {
    const rows = await docsCollection.find({}, { projection: { fileName: 1, pages: 1, uploadedAt: 1 } }).sort({ uploadedAt: -1 }).toArray();
    return res.json(rows.map(r => ({ id: r._id, fileName: r.fileName, pages: r.pages, uploadedAt: r.uploadedAt })));
  }

  return res.json(memoryStore.documents);
});

app.delete("/admin/documents/:id", async (req, res) => {
  const { id } = req.params;

  if (docsCollection && chunksCollection) {
    const docId = new ObjectId(id);
    await docsCollection.deleteOne({ _id: docId });
    await chunksCollection.deleteMany({ documentId: docId });
    return res.json({ message: "Document deleted and index updated." });
  }

  memoryStore.documents = memoryStore.documents.filter(d => d.id !== id);
  memoryStore.chunks = [];
  return res.json({ message: "Memory document deleted." });
});

app.post("/admin/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded." });

    const dataBuffer = fs.readFileSync(req.file.path);
    const pdfData = await pdfParse(dataBuffer);
    fs.unlinkSync(req.file.path);

    if (!pdfData.text || !pdfData.text.trim()) return res.status(400).json({ error: "PDF has no extractable text." });

    const pages = pdfData.numpages || 1;
    const rawChunks = chunkText(pdfData.text, 900, 120);
    const chunks = rawChunks.map((content, index) => ({
      fileName: req.file.originalname,
      content,
      embedding: getEmbedding(content),
      page: Math.max(1, Math.ceil(((index + 1) / rawChunks.length) * pages)),
      chunkIndex: index + 1,
      source: `${req.file.originalname} | Page ~${Math.max(1, Math.ceil(((index + 1) / rawChunks.length) * pages))}`,
    }));

    const doc = await saveDocumentWithChunks(req.file.originalname, pages, chunks);

    return res.json({ message: "Document indexed successfully.", documentId: doc.id, chunks: chunks.length, pages });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Upload and indexing failed." });
  }
});

app.get("/chat/stream", async (req, res) => {
  const question = String(req.query.question || "").trim();
  if (!question) return res.status(400).json({ error: "question query param required" });

  const topChunks = await retrieveTopChunks(question);
  if (!topChunks.length) return res.status(400).json({ error: "No SOP chunks available. Upload a document first." });

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
        {
          role: "system",
          content: "You are OpsMind AI. Answer strictly using provided SOP context. If missing, say 'I don't know based on the provided SOPs.' Always keep answers concise and operational.",
        },
        {
          role: "user",
          content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}`,
        },
      ],
    });

    for await (const chunk of completion) {
      const token = chunk?.choices?.[0]?.delta?.content;
      if (token) res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }

    const citations = topChunks.map((c, i) => `${i + 1}) ${c.fileName || "SOP"}, Page ${c.page}, Chunk ${c.chunkIndex}`).join("; ");
    res.write(`data: ${JSON.stringify({ done: true, citations })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ error: "LLM streaming failed." })}\n\n`);
    res.end();
  }
});

connectMongo()
  .catch(err => console.error("Mongo init failed:", err.message))
  .finally(() => app.listen(PORT, () => console.log(`🚀 OpsMind AI API running on :${PORT}`)));