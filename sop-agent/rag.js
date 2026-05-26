const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { getNeuralEmbedding } = require("./embedding");

const TOP_K_CHUNKS = Number(process.env.TOP_K_CHUNKS || 12);
const VECTOR_INDEX = process.env.MONGO_VECTOR_INDEX || "chunk_vector_index";

const STOPWORDS = new Set([
  "what", "how", "why", "who", "when", "where", "which", "whose", "whom",
  "this", "that", "these", "those", "their", "there", "here", "them",
  "they", "with", "from", "your", "mine", "ours", "have", "been", "were",
  "does", "doing", "done", "then", "than", "thence", "about", "above",
  "after", "again", "against", "all", "am", "an", "and", "any", "are",
  "aren't", "as", "at", "be", "because", "before", "being", "below",
  "between", "both", "but", "by", "can", "can't", "cannot", "could",
  "couldn't", "did", "didn't", "do", "don't", "down", "during", "each",
  "few", "for", "further", "had", "hadn't", "has", "hasn't", "haven't",
  "having", "he", "he'd", "he'll", "he's", "her", "here's", "hers",
  "herself", "him", "himself", "his", "i'd", "i'll", "i'm", "i've",
  "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself",
  "let's", "me", "more", "most", "mustn't", "my", "myself", "no", "nor",
  "not", "of", "off", "on", "once", "only", "or", "other", "ought",
  "our", "ourselves", "out", "over", "own", "same", "shan't", "she",
  "she'd", "she'll", "she's", "should", "shouldn't", "so", "some", "such",
  "than", "that's", "the", "their", "theirs", "them", "themselves", "then",
  "there's", "these", "they'd", "they'll", "they're", "they've", "this",
  "those", "through", "to", "too", "under", "until", "up", "very", "was",
  "wasn't", "we", "we'd", "we'll", "we're", "we've", "weren't", "what's",
  "when's", "where's", "who's", "whom", "why's", "with", "won't", "would",
  "wouldn't", "you", "you'd", "you'll", "you're", "you've", "your", "yours",
  "yourself", "yourselves"
]);

const SYNONYMS = {
  "leave": ["vacation", "annual leave", "pto", "holiday", "absence", "off-duty", "sick"],
  "refund": ["reimburse", "chargeback", "payment", "money back", "return fee", "billing"],
  "sla": ["service level agreement", "deadline", "response time", "agreement", "resolution time"],
  "incident": ["outage", "security breach", "hack", "failure", "crash", "bug", "issue"],
  "checklist": ["steps", "tasks", "process", "guide", "procedure", "walkthrough"],
  "security": ["mfa", "encryption", "auth", "access key", "credentials", "compliance"],
  "onboard": ["hiring", "training", "orientation", "induction", "welcome"]
};

/**
 * Splits document text into high-fidelity Parent (1000 chars) and Child (200 chars) chunks.
 * @param {string} text 
 * @returns {Promise<Array<{content: string, parentContent: string}>>}
 */
async function createParentChildChunks(text) {
  if (!text || typeof text !== "string") return [];

  const parentSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const childSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 200, chunkOverlap: 40 });

  const parentTexts = await parentSplitter.splitText(text);
  const chunkRows = [];

  for (let pIdx = 0; pIdx < parentTexts.length; pIdx++) {
    const parentText = parentTexts[pIdx];
    const childTexts = await childSplitter.splitText(parentText);

    for (let cIdx = 0; cIdx < childTexts.length; cIdx++) {
      chunkRows.push({
        content: childTexts[cIdx],
        parentContent: parentText
      });
    }
  }

  return chunkRows;
}

/**
 * Helper to compute tokenized arrays of lowercase terms
 */
function getTokens(text) {
  if (typeof text !== "string") return [];
  return text.toLowerCase()
    .split(/\W+/)
    .filter(t => (t.length > 2 || /\d+/.test(t)) && !STOPWORDS.has(t));
}

/**
 * Expands query tokens using a synonym dictionary
 */
function expandQueryTokens(tokens) {
  const expanded = new Set(tokens);
  for (const token of tokens) {
    if (SYNONYMS[token]) {
      for (const syn of SYNONYMS[token]) {
        expanded.add(syn);
      }
    }
  }
  return Array.from(expanded);
}

/**
 * Computes cosine similarity between two numeric vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB)) || 0;
}

/**
 * High-grade multi-tier hybrid search.
 * Tries MongoDB Atlas Vector Search first, falling back to database scan / in-memory search.
 * Reranks candidate matches using Okapi BM25 and exact phrase matching boosters.
 */
async function retrieveTopChunks(question, userEmail, chunksCollection, memoryStore = { chunks: [] }) {
  const queryVector = await getNeuralEmbedding(question);
  let candidateChunks = [];
  let atlasVectorSearchWorked = false;

  // 1. Try production-grade MongoDB Atlas Vector Search
  if (chunksCollection) {
    try {
      const results = await chunksCollection.aggregate([
        {
          $vectorSearch: {
            index: VECTOR_INDEX,
            path: "embedding",
            queryVector: queryVector,
            numCandidates: 150, // High candidate pool to enhance keyword reranking accuracy
            limit: TOP_K_CHUNKS * 2,
            filter: { userEmail }
          }
        }
      ]).toArray();

      if (results && results.length > 0) {
        candidateChunks = results;
        atlasVectorSearchWorked = true;
      }
    } catch (vectorSearchError) {
      console.warn(
        "⚠️ MongoDB Atlas Vector Search failed or index not ready. Falling back to DB-level filter scan:",
        vectorSearchError.message
      );
    }
  }

  // 2. Fallback to full tenant database query if vector search returned nothing or failed
  if (!atlasVectorSearchWorked && chunksCollection) {
    try {
      candidateChunks = await chunksCollection.find({ userEmail }).toArray();
    } catch (dbError) {
      console.warn("⚠️ Failed to scan DB candidate chunks:", dbError.message);
    }
  }

  // 3. Fallback to local memoryStore if database is completely inactive/mocked
  if (!candidateChunks.length) {
    candidateChunks = memoryStore.chunks.filter(chunk => chunk.userEmail === userEmail);
  }

  if (!candidateChunks.length) {
    return [];
  }

  const N = candidateChunks.length;

  // Compute BM25 components: average document length
  let totalLength = 0;
  const chunkTokensMap = new Map();

  for (const chunk of candidateChunks) {
    const tokens = getTokens(chunk.content);
    chunkTokensMap.set(chunk, tokens);
    totalLength += tokens.length;
  }
  const avgdl = totalLength / N || 1;

  // Expand query terms
  const rawQueryTokens = getTokens(question);
  const expandedQueryTokens = expandQueryTokens(rawQueryTokens);

  // Compute document frequencies n(q) and IDF maps
  const idfMap = new Map();
  for (const q of expandedQueryTokens) {
    let nq = 0;
    for (const tokens of chunkTokensMap.values()) {
      if (tokens.includes(q)) {
        nq++;
      }
    }
    const idf = Math.max(0.0001, Math.log(1 + (N - nq + 0.5) / (nq + 0.5)));
    idfMap.set(q, idf);
  }

  // Score candidate chunks
  const k1 = 1.2;
  const b = 0.75;
  const questionLower = question.toLowerCase();

  const scored = candidateChunks.map(chunk => {
    const tokens = chunkTokensMap.get(chunk) || [];
    const docLength = tokens.length;

    // A. BM25 Keyword Matching Score
    let bm25Score = 0;
    for (const q of expandedQueryTokens) {
      let tf = 0;
      for (const token of tokens) {
        if (token === q) tf++;
      }

      if (tf > 0) {
        const idf = idfMap.get(q) || 0;
        const termScore = idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgdl)));
        bm25Score += termScore;
      }
    }

    // B. Dense Vector Cosine Similarity
    const cosScore = cosineSimilarity(queryVector, chunk.embedding);

    // C. Hybrid Linear Weighting Combination (BM25: 60%, Vector Semantic: 40%)
    let hybridScore = (cosScore * 0.4) + (bm25Score * 0.6);

    // D. Semantic Bigram Matching Booster
    const chunkLower = chunk.content.toLowerCase();
    const words = questionLower.split(/\W+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + ' ' + words[i + 1];
      if (chunkLower.includes(bigram)) {
        hybridScore += 1.5;
      }
    }

    // E. Named Entity booster for high-priority operational terms
    const boostPairs = [
      ["project 1", "project 1"], ["project 2", "project 2"],
      ["refund", "refund"], ["checklist", "checklist"],
      ["ethics", "ethics"], ["sla", "sla"],
      ["security", "security"], ["mfa", "mfa"],
      ["benefit", "benefit"], ["leave", "leave policy"],
      ["onboard", "onboard"], ["privacy", "privacy"],
      ["incident", "incident"], ["vendor", "vendor"],
      ["remote", "remote work"], ["escalat", "escalat"],
    ];
    for (const [qTerm, cTerm] of boostPairs) {
      if (questionLower.includes(qTerm) && chunkLower.includes(cTerm)) {
        hybridScore += 2.0;
      }
    }

    return { ...chunk, score: hybridScore };
  });

  // Sort candidates by final composite score
  const ranked = scored.sort((a, b) => b.score - a.score);

  // F. Diversity Guarantee (Ensure at least one chunk for each distinct queried entity)
  if (questionLower.includes("project 1") && questionLower.includes("project 2")) {
    const p1Chunks = ranked.filter(c => c.content.toLowerCase().includes("project 1")).slice(0, 3);
    const p2Chunks = ranked.filter(c => c.content.toLowerCase().includes("project 2")).slice(0, 3);
    const otherChunks = ranked.filter(c => !c.content.toLowerCase().includes("project 1") && !c.content.toLowerCase().includes("project 2"));
    const combined = [
      ...p1Chunks,
      ...p2Chunks,
      ...otherChunks.slice(0, Math.max(0, TOP_K_CHUNKS - p1Chunks.length - p2Chunks.length))
    ];
    return combined.slice(0, TOP_K_CHUNKS);
  }

  return ranked.slice(0, TOP_K_CHUNKS);
}

module.exports = {
  createParentChildChunks,
  retrieveTopChunks
};
