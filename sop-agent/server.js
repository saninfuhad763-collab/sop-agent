// 🔧 IMPORTS




const cors = require("cors");
const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
require("dotenv").config();

const Groq = require("groq-sdk");



// 🔥 NEW EMBEDDING FUNCTION 
function getEmbedding(text) {
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(100).fill(0);

  for (let i = 0; i < words.length; i++) {
    const index = words[i].charCodeAt(0) % 100;
    vector[index] += 1;
  }

  return vector;
}



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
const MIN_RELEVANCE_SCORE = 0.2;
const VECTOR_DIMENSIONS = 200;

const TOP_K_CHUNKS = 8;
const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "sop_agent";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "document_chunks";
const MONGO_VECTOR_INDEX = process.env.MONGO_VECTOR_INDEX || "chunk_vector_index";

let mongoClient;
let chunksCollection;
let MongoClientCtor = null;

// ✅ FIXED CORS
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



// 🔥 ADD THIS (UPLOAD ROUTE)
app.post("/upload", upload.single("file"), async (req, res) => {
  try {


   


    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    const text = pdfData.text;
    // 🔥 Split into pages
const pages = text.split("\f"); // \f = page break

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "PDF has no readable content" });
    }

    

documents = [];

for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
  const pageText = pages[pageIndex];

  if (!pageText.trim()) continue;

  // Split each page into chunks
  const chunks = pageText.match(/.{1,800}/g) || [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    const embedding = getEmbedding(chunk);

    

    documents.push({
      content: chunk,
      embedding,
      page: pageIndex + 1, // ✅ REAL PAGE NUMBER
      source: `Page ${pageIndex + 1}`
    });
  }
}


    await saveChunksToMongo(documents);

    fs.unlinkSync(filePath);

    res.json({
      message: "PDF uploaded successfully",
      chunks: documents.length,
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});


function sanitizeAndNormalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}


function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}


function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .split(/\s+/)
    .filter(word => word.length > 1);
}


function keywordScore(query, content) {
  const queryTokens = tokenize(query);
  const contentLower = content.toLowerCase();

  return queryTokens.reduce((score, token) => {
    if (token.length < 2) return score;
    return contentLower.includes(token) ? score + 1 : score;
  }, 0);
}

async function rankWithHybridScore(query, docs) {
  const queryEmbedding = getEmbedding(query);



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

function buildSources(topChunks) {
  return topChunks.map((chunk, index) => {
    const preview = chunk.content.slice(0, 120).trim();
    const confidence = Number(chunk.score || chunk.vectorScore || 0).toFixed(2);
    return `${index + 1}. ${chunk.source} | confidence: ${confidence} | "${preview}..."`;
  });
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
    console.warn("⚠️ MongoDB unavailable, using memory.", error.message);
    chunksCollection = null;
  }
}

async function saveChunksToMongo(chunks) {
  if (!chunksCollection) return;

  await chunksCollection.deleteMany({});

  if (!chunks.length) return;

  await chunksCollection.insertMany(chunks); // ✅ ADD THIS
}

app.post("/ask", async (req, res) => {
  try {


 

    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: "No question provided" });
    }

    if (!documents.length) {
  return res.status(400).json({
    error: "⚠️ Please upload a PDF document first."
  });
}

    const cleanQuestion = sanitizeAndNormalize(question).toLowerCase();

    chatHistory.push({ role: "user", content: question });

    if (chatHistory.length > MAX_CHAT_HISTORY * 2) {
      chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY * 2);
    }

    const topChunks = await rankWithHybridScore(cleanQuestion, documents);

    const context = topChunks
      .map((c, index) => `[${index + 1}] ${c.content}`)
      .join("\n\n");

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
  {
    role: "system",
    content: `
You are an AI assistant working on a PDF document.

You are given CONTEXT extracted from a PDF.

Rules:
- Answer ONLY using the context
- The context is from a PDF document
- If answer not found, say "I don't know"
- Do NOT say "no PDF provided"

Format:
Answer clearly and directly.
    `
  },
  {
    role: "user",
    content: `CONTEXT:\n${context}\n\nQUESTION:\n${question}`
  }
],
      stream: true,
    });

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Transfer-Encoding", "chunked");

    for await (const chunk of completion) {
      const content = chunk?.choices?.[0]?.delta?.content;
      if (content) res.write(content);
    }

      
    
const sources = [...new Set(topChunks.map(c => `Page ${c.page}`))];

res.write(`\n\n📄 Sources: ${sources.join(", ")}`);
res.end();



  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Ask failed" });
  }
});

app.post("/reset", async (req, res) => {
  documents = [];
  chatHistory = [];
  res.json({ message: "Session reset" });
});

connectMongo().finally(() => {
  app.listen(5000, () => console.log("🚀 Running on 5000"));
});