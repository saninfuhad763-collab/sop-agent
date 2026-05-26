const { MongoClient } = require("mongodb");
require("dotenv").config();

let db = null;
let client = null;

async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB_NAME || "sop_agent";

  if (!mongoUri) {
    console.error("CRITICAL CONFIGURATION ERROR: MONGO_URI is not defined in the environment!");
    process.exit(1);
  }

  try {
    client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    db = client.db(dbName);
    console.log(`Successfully connected to MongoDB Atlas: ${dbName}`);

    // Create database indexes on startup to ensure production performance and uniqueness
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("sop_chunks").createIndex({ userEmail: 1, fileName: 1 });
    console.log("Database indexes successfully initialized.");

    return db;
  } catch (error) {
    console.error("CRITICAL DATABASE CONNECTION ERROR:", error.message);
    process.exit(1); // Fail-fast: boot termination
  }
}

function getDB() {
  if (!db) {
    throw new Error("Database not initialized. Please call connectDB first.");
  }
  return db;
}

module.exports = { connectDB, getDB };
