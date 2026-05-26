const { MongoClient } = require("mongodb");

function sanitizeMongoUri(uri) {
  if (!uri || !uri.startsWith("mongodb")) return uri;
  try {
    const isSrv = uri.startsWith("mongodb+srv://");
    const prefix = isSrv ? "mongodb+srv://" : "mongodb://";
    
    const body = uri.substring(prefix.length);
    const atIndex = body.lastIndexOf("@");
    if (atIndex === -1) return uri;
    
    const credentials = body.substring(0, atIndex);
    const hostPart = body.substring(atIndex + 1);
    
    const colonIndex = credentials.indexOf(":");
    if (colonIndex === -1) {
      const user = decodeURIComponent(credentials);
      return `${prefix}${encodeURIComponent(user)}@${hostPart}`;
    } else {
      const user = decodeURIComponent(credentials.substring(0, colonIndex));
      const pass = decodeURIComponent(credentials.substring(colonIndex + 1));
      return `${prefix}${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hostPart}`;
    }
  } catch (err) {
    // Fall back to original URI
  }
  return uri;
}

const MONGO_URI = sanitizeMongoUri(process.env.MONGO_URI);
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "sop_agent";

const DOC_COLLECTION = process.env.MONGO_DOCS_COLLECTION || "sop_documents";
const CHUNK_COLLECTION = process.env.MONGO_CHUNKS_COLLECTION || "sop_chunks";

let client = null;
let dbInstance = null;

let docsCollection = null;
let chunksCollection = null;
let usersCollection = null;
let queryLogsCollection = null;
let paymentsCollection = null;
let contactCollection = null;

/**
 * Connects to MongoDB, sets up collections, and registers index configurations.
 * Incorporates elegant fallback logs if MONGO_URI is not present.
 */
async function connectDatabase() {
  if (!MONGO_URI) {
    console.warn("⚠️ MONGO_URI is not defined. Initializing server in Mock/In-Memory Mode.");
    return {
      docsCollection: null,
      chunksCollection: null,
      usersCollection: null,
      queryLogsCollection: null,
      paymentsCollection: null,
      contactCollection: null
    };
  }

  try {
    client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    
    dbInstance = client.db(MONGO_DB_NAME);
    docsCollection = dbInstance.collection(DOC_COLLECTION);
    chunksCollection = dbInstance.collection(CHUNK_COLLECTION);
    usersCollection = dbInstance.collection("users");
    queryLogsCollection = dbInstance.collection("query_logs");
    paymentsCollection = dbInstance.collection("payments");
    contactCollection = dbInstance.collection("contacts");

    console.log(`✅ MongoDB connected successfully to database: "${MONGO_DB_NAME}"`);

    // Enforce production-grade index structures:
    // 1. Compound index on chunks for fast multi-tenant queries: { userEmail: 1, fileName: 1 }
    try {
      await chunksCollection.createIndex(
        { userEmail: 1, fileName: 1 },
        { name: "tenant_filename_idx" }
      );
      console.log("🚀 Multi-tenant compound index registered on 'sop_chunks'");
    } catch (indexError) {
      console.warn("⚠️ Failed to register chunks compound index:", indexError.message);
    }

    // 2. Index on users email for fast authentication lookups
    try {
      await usersCollection.createIndex(
        { email: 1 },
        { unique: true, name: "user_email_unique_idx" }
      );
      console.log("🚀 Unique index registered on 'users' collection");
    } catch (indexError) {
      console.warn("⚠️ Failed to register users unique index:", indexError.message);
    }

    return {
      docsCollection,
      chunksCollection,
      usersCollection,
      queryLogsCollection,
      paymentsCollection,
      contactCollection
    };
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    console.warn("⚠️ Falling back to Mock/In-Memory storage modes.");
    return {
      docsCollection: null,
      chunksCollection: null,
      usersCollection: null,
      queryLogsCollection: null,
      paymentsCollection: null,
      contactCollection: null
    };
  }
}

module.exports = {
  connectDatabase,
  getDb: () => dbInstance,
  getClient: () => client
};
