const { parentPort, workerData } = require("worker_threads");
const { getNeuralEmbedding } = require("./embedding");

/**
 * Worker execution entrypoint
 */
async function processBatch() {
  const { texts } = workerData;
  if (!Array.isArray(texts)) {
    throw new Error("Invalid texts batch data provided to worker thread");
  }

  const results = [];
  for (let i = 0; i < texts.length; i++) {
    const text = texts[i];
    const embedding = await getNeuralEmbedding(text);
    results.push({ text, embedding });
    
    // Post progress message to main thread
    if (parentPort) {
      parentPort.postMessage({ type: "progress", count: 1 });
    }
  }

  parentPort.postMessage({ type: "done", results });
}

processBatch().catch((err) => {
  console.error("Worker thread failed to execute embedding batch:", err);
  parentPort.postMessage({ error: err.message || "Unknown worker embedding failure" });
});
