const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const fs = require("fs");
require("dotenv").config();


const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const app = express();

console.log("GEMINI API KEY:", process.env.GEMINI_API_KEY);
console.log("Starting server...");

app.use(express.json());

const upload = multer({ dest: "uploads/" });

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/upload", upload.single("file"), async (req, res) => {
  const filePath = req.file.path;

  const dataBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(dataBuffer);

  res.json({
    text: pdfData.text.substring(0, 500),
  });
});


app.post("/ask", async (req, res) => {
  const { question, context } = req.body;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `Answer ONLY using the below document:\n\n${context}\n\nQuestion: ${question}`,
    });

    const answer = response.text;

    res.json({ answer });
  } catch (error) {
    console.error("ERROR:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.listen(5000, () => {
  console.log("Server started on port 5000");
});