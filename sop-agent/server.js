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

// 🔥 SIMPLE EMBEDDING (IMPROVED)
function simpleEmbedding(text) {
  const words = text.toLowerCase().split(/\W+/);
  const vector = new Array(200).fill(0); // increased size

  words.forEach((word) => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash += word.charCodeAt(i);
    }
    vector[hash % 200] += 1;
  });

  return vector;
}

// 🔥 COSINE
function cosineSimilarity(a, b) {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
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

    let text = (parsed.text || "")
      .replace(/[^\n\x00-\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];

    const chunks = [];
    let chunk = "";

    for (let sentence of sentences) {
      sentence = sentence.trim();
      if (!sentence) continue;

      if ((chunk + " " + sentence).length > MAX_CHUNK_LENGTH) {
        if (chunk) chunks.push(chunk.trim());
        chunk = sentence;
      } else {
        chunk += " " + sentence;
      }
    }

    if (chunk) chunks.push(chunk.trim());

    const limitedChunks = chunks.slice(0, MAX_DOCUMENT_CHUNKS);

    documents = limitedChunks.map((content, index) => ({
      content,
      embedding: simpleEmbedding(content),
      source: `Chunk ${index + 1}`,
    }));

    chatHistory = [];

    fs.unlink(filePath, () => {});

    res.json({
      message: "PDF processed successfully",
      totalChunks: documents.length,
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

    const cleanQuestion = question.toLowerCase();

    chatHistory.push({ role: "user", content: question });

    if (chatHistory.length > MAX_CHAT_HISTORY * 2) {
      chatHistory = chatHistory.slice(-MAX_CHAT_HISTORY * 2);
    }

    // 🔥 HYBRID SEARCH (BETTER)
    const queryEmbedding = simpleEmbedding(cleanQuestion);

    const scored = documents.map((doc) => {
      const semanticScore = cosineSimilarity(
        queryEmbedding,
        doc.embedding
      );

      const keywordScore = cleanQuestion
        .split(" ")
        .filter((word) => doc.content.toLowerCase().includes(word)).length;

      return {
        ...doc,
        score: semanticScore + keywordScore * 0.2,
      };
    });

    const topChunks = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

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

    res.write(
      "\n\n📄 Sources:\n" +
        topChunks.map((c) => c.source).join("\n")
    );

    res.end();
  } catch (err) {
    console.error("Ask failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// 🔁 RESET
app.post("/reset", (req, res) => {
  documents = [];
  chatHistory = [];
  res.json({ message: "Session reset" });
});

// 🚀 START
app.listen(5000, () => console.log("🚀 Running on 5000"));