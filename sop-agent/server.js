const cors = require("cors");

let documents = [];

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

console.log("GROQ API KEY:", process.env.GROQ_API_KEY);
console.log("Starting server...");

app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Server is running");
});


// ✅ UPLOAD ROUTE
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;

    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);

    const text = pdfData.text;

    const chunkSize = 1000;
    const overlap = 100;

    documents = [];

    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunk = text.substring(i, i + chunkSize);

      documents.push({
        content: chunk,
        source: `Chunk ${documents.length + 1}`,
      });
    }

    res.json({
      message: "PDF uploaded and processed",
      totalChunks: documents.length,
    });

  } catch (error) {
    console.error("UPLOAD ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// ✅ ASK ROUTE (🔥 IMPROVED SEARCH)
app.post("/ask", async (req, res) => {
  const { question } = req.body;

  try {
    if (!question) {
      return res.status(400).json({
        error: "Question is required",
      });
    }

    if (documents.length === 0) {
      return res.status(400).json({
        error: "No document uploaded yet",
      });
    }

    // 🔥 NEW IMPROVED MATCHING
    const cleanQuestion = question.toLowerCase();

    const scoredChunks = documents.map(doc => {
      const content = doc.content.toLowerCase();

      let score = 0;

      // ✅ Full sentence match (very strong)
      if (content.includes(cleanQuestion)) {
        score += 5;
      }

      // ✅ Word matching
      cleanQuestion.split(" ").forEach(word => {
        if (content.includes(word)) {
          score += 1;
        }
      });

      return { ...doc, score };
    });

    // 🔥 Sort by score
    scoredChunks.sort((a, b) => b.score - a.score);

    // 🔥 IMPORTANT FILTER (removes useless chunks)
    const selectedChunks = scoredChunks
      .filter(doc => doc.score > 0)
      .slice(0, 5);

    const context = selectedChunks
      .map(doc => doc.content)
      .join("\n");

    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      messages: [
        {
          role: "system",
          content: `
You are an assistant that answers ONLY from the given context.

If answer is not present, say:
"I don't know based on the document."

Also mention source.
`,
        },
        {
          role: "user",
          content: `Document:\n${context}\n\nQuestion: ${question}`,
        },
      ],
    });

    const answer = completion.choices[0].message.content;

    res.json({
      answer,
      sources: selectedChunks.map(doc => doc.source),
    });

  } catch (error) {
    console.error("ASK ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});


app.listen(5000, () => {
  console.log("Server started on port 5000");
});