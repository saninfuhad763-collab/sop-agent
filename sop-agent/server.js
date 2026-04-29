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

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// ✅ ROOT ROUTE
app.get("/", (req, res) => {
  res.send("🚀 Server is running");
});


// 🔥 SIMPLE LOCAL EMBEDDING (NO DOWNLOAD)
function simpleEmbedding(text) {
  const words = text.toLowerCase().split(/\W+/);
  const vector = new Array(100).fill(0);

  words.forEach(word => {
    let hash = 0;
    for (let i = 0; i < word.length; i++) {
      hash += word.charCodeAt(i);
    }
    vector[hash % 100] += 1;
  });

  return vector;
}


// 🔥 COSINE SIMILARITY
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}


// ✅ UPLOAD
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    let text = (await pdfParse(fs.readFileSync(req.file.path))).text;

    // 🔥 CLEAN TEXT
    text = text
      .replace(/[^\x00-\x7F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 🔥 NEW SENTENCE-BASED CHUNKING
    const sentences = text.split(". ");

    let chunks = [];
    let chunk = "";

    for (let s of sentences) {
      if ((chunk + s).length > 1000) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += s + ". ";
    }

    if (chunk) chunks.push(chunk);

    console.log("📦 Total chunks:", chunks.length);

    // 🔥 LIMIT for performance
    chunks = chunks.slice(0, 40);

    console.log("📦 Using chunks:", chunks.length);
    console.log("⏳ Creating embeddings...");

    // 🔥 LOCAL EMBEDDINGS
    const embeddings = chunks.map(chunk => simpleEmbedding(chunk));

    documents = chunks.map((c, i) => ({
      content: c,
      embedding: embeddings[i],
      source: `Chunk ${i + 1}`,
    }));

    console.log("✅ Embeddings ready");

    res.json({
      message: "PDF processed successfully",
      totalChunks: documents.length,
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// ✅ ASK
app.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "No question provided" });
    }

    if (!documents.length) {
      return res.status(400).json({ error: "No document uploaded yet" });
    }

    console.log("📥 Question:", question);

    const qEmbed = simpleEmbedding(question);

    console.log("🔍 Finding best chunks...");

    const scored = documents.map(d => ({
      ...d,
      score: cosineSimilarity(qEmbed, d.embedding),
    }));

    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const context = top.map(c => c.content).join("\n\n");

    console.log("🧠 Context preview:\n", context.substring(0, 300));
    console.log("➡️ Calling Groq...");

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content:
            "Answer using the context. If partial info exists, explain clearly instead of saying I don't know.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content;

    res.json({
      answer,
      sources: top.map(t => t.source),
    });

  } catch (err) {
    console.error("ASK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


// 🚀 START SERVER
app.listen(5000, () => console.log("🚀 Running on 5000"));