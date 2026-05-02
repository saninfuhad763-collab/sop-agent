const cors = require("cors");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
const path = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
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

let docsCollection;
let chunksCollection;
const memoryStore = { documents: [], chunks: [] };

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => cb(null, file.mimetype === "application/pdf" || file.originalname.endsWith(".pdf")),
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
  if (!MONGO_URI) return;
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  docsCollection = db.collection(DOC_COLLECTION);
  chunksCollection = db.collection(CHUNK_COLLECTION);
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

app.post("/admin/upload", upload.single("file"), async (req, res) => {
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

connectMongo().finally(() => {
  app.listen(PORT, () => console.log(`OpsMind API on :${PORT}`));
});