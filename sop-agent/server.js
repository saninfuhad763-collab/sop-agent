// 🔧 IMPORTS
const cors = require("cors");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
require("dotenv").config();

const Groq = require("groq-sdk");

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const app = express();
let documents = [];

// 🧠 CHAT MEMORY
let chatHistory = [];

const MAX_DOCUMENT_CHUNKS = 40;
const MAX_CHUNK_LENGTH = 1000;
const MAX_CHAT_HISTORY = 12;
const VECTOR_DIMENSIONS = 200;
const TOP_K_CHUNKS = 3;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "sop_agent";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "document_chunks";
const MONGO_VECTOR_INDEX = process.env.MONGO_VECTOR_INDEX || "chunk_vector_index";

let mongoClient;
let chunksCollection;
let MongoClientCtor = null;

// ✅ FIXED CORS (ALLOW ALL FOR DEV)
app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/",
  fileFilter: (req, file, cb) => {
    const isPdf =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, isPdf);
  },
});

// ✅ ROOT
app.get("/", (req, res) => {
  res.send("🚀 Server is running");
});

function sanitizeAndNormalize(text) {
  return (text || "")
    .replace(/[^\n\x00-\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return sanitizeAndNormalize(text)
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean);
}

function splitIntoChunks(text, maxLength = MAX_CHUNK_LENGTH) {
  const normalized = sanitizeAndNormalize(text);
  if (!normalized) return [];

  const sentenceLikeParts =
    normalized.match(/[^.!?\n]+[.!?]?/g)?.map((s) => s.trim()).filter(Boolean) || [];

  const chunks = [];
  let currentChunk = "";

  for (const part of sentenceLikeParts) {
    const candidate = currentChunk ? `${currentChunk} ${part}` : part;

    if (candidate.length <= maxLength) {
      currentChunk = candidate;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }

    if (part.length <= maxLength) {
      currentChunk = part;
      continue;
    }

    let start = 0;
    while (start < part.length) {
      const end = Math.min(start + maxLength, part.length);
      chunks.push(part.slice(start, end).trim());
      start = end;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  return chunks.filter(Boolean).slice(0, MAX_DOCUMENT_CHUNKS);
}

// 🔥 SIMPLE EMBEDDING
function simpleEmbedding(text) {
  const words = tokenize(text);
  const vector = new Array(VECTOR_DIMENSIONS).fill(0);

  words.forEach((word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash += word.charCodeAt(i);
    }
    vector[hash % VECTOR_DIMENSIONS] += 1;
  });

  return vector;
}

// 🔥 COSINE
function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

function keywordScore(query, content) {
  const queryTokens = tokenize(query);
  const contentLower = content.toLowerCase();

  return queryTokens.reduce((score, token) => {
    if (token.length < 2) return score;
    return contentLower.includes(token) ? score + 1 : score;
  }, 0);
}

function rankWithHybridScore(query, docs) {
  const queryEmbedding = simpleEmbedding(query);

  return docs
    .map((doc) => {
      const semanticScore = cosineSimilarity(queryEmbedding, doc.embedding);
      const lexicalScore = keywordScore(query, doc.content);
      return {
        ...doc,
        score: semanticScore + lexicalScore * 0.2,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_K_CHUNKS);
}

async function connectMongo() {
  if (!MONGO_URI || chunksCollection) return;

  try {
    if (!MongoClientCtor) {
      ({ MongoClient: MongoClientCtor } = require("mongodb"));
    }

    mongoClient = new MongoClientCtor(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db(MONGO_DB_NAME);
    chunksCollection = db.collection(MONGO_COLLECTION);
    console.log("✅ MongoDB connected");
  } catch (error) {
    console.warn("⚠️ MongoDB unavailable, using in-memory retrieval only.", error.message);
    chunksCollection = null;
  }
}

async function saveChunksToMongo(chunks) {
  if (!chunksCollection) return;

  await chunksCollection.deleteMany({});
  if (!chunks.length) return;

  await chunksCollection.insertMany(chunks);
}

async function vectorSearchInMongo(question) {
  if (!chunksCollection) return null;

  const queryVector = simpleEmbedding(question);
  const pipeline = [
    {
      $vectorSearch: {
        index: MONGO_VECTOR_INDEX,
        path: "embedding",
        queryVector,
        numCandidates: 50,
        limit: TOP_K_CHUNKS,
      },
    },
    {
      $project: {
        _id: 0,
        content: 1,
        source: 1,
        embedding: 1,
        vectorScore: { $meta: "vectorSearchScore" },
      },
    },
  ];

  try {
    const vectorMatches = await chunksCollection.aggregate(pipeline).toArray();
    if (!vectorMatches.length) return [];

    return rankWithHybridScore(question, vectorMatches);
  } catch (error) {
    console.warn("⚠️ Vector search failed, falling back to local ranking.", error.message);
    return null;
  }
}

// ✅ UPLOAD
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a PDF file." });
    }

    const raw = fs.readFileSync(req.file.path);
    const parsed = await pdfParse(raw);
    const filePath = req.file.path;

    const chunks = splitIntoChunks(parsed.text || "");

    documents = chunks.map((content, index) => ({
      content,
      embedding: simpleEmbedding(content),
      source: `Chunk ${index + 1}`,
    }));

    await saveChunksToMongo(documents);
    chatHistory = [];

    fs.unlink(filePath, () => {});

    res.json({
      message: "PDF processed successfully",
      totalChunks: documents.length,
      vectorStore: chunksCollection ? "mongodb" : "memory",
    });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Failed to process PDF." });
  }
});

// ✅ ASK (IMPROVED SEARCH + ANSWERS)
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "No question provided" });
    }

    if (!documents.length) {
      return res.status(400).json({ error: "No document uploaded yet" });
    }

    const cleanQuestion = sanitizeAndNormalize(question).toLowerCase();

    chatHistory.push({ role: "user", content: question });

    if (chatHistory.length > MAX_CHAT_HISTORY * 2) {
      chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY * 2);
    }

    const vectorTopChunks = await vectorSearchInMongo(cleanQuestion);
    const topChunks =
      vectorTopChunks && vectorTopChunks.length
        ? vectorTopChunks
        : rankWithHybridScore(cleanQuestion, documents);

    const context = topChunks.map((c) => c.content).join("\n\n");

    const messages = [
      {
        role: "system",
        content: `
You are a document assistant.

STRICT RULES:
- Answer ONLY from context
- Do NOT guess
- If not found, say:
"I don't know based on the document."
- Keep answers short and accurate
        `,
      },
      {
        role: "system",
        content: `Context:\n${context}`,
      },
      ...chatHistory.slice(-6),
    ];

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages,
      stream: true,
    });

    let fullAnswer = "";

    for await (const chunk of completion) {
      const content = chunk.choices[0]?.delta?.content;

      if (content) {
        fullAnswer += content;
        res.write(content);
      }
    }

    chatHistory.push({
      role: "assistant",
      content: fullAnswer,
    });

    res.write("\n\n📄 Sources:\n" + topChunks.map((c) => c.source).join("\n"));

    res.end();
  } catch (err) {
    console.error("Ask failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🔁 RESET
app.post("/reset", async (req, res) => {
  documents = [];
  chatHistory = [];
  if (chunksCollection) {
    await chunksCollection.deleteMany({});
  }
  res.json({ message: "Session reset" });
});

// 🚀 START
connectMongo().finally(() => {
  app.listen(5000, () => console.log("🚀 Running on 5000"));
});
