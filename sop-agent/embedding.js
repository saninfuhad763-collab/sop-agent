const Module = require("module");
const path = require("path");

// 1. Intercept native onnxruntime module loading on Windows/Node.js to bypass dlopen failure
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (
    id.includes("onnxruntime-node") ||
    (id.endsWith(".node") && this.filename.includes("onnxruntime"))
  ) {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

// 2. Load ONNX Runtime Web and configure WASM/CPU settings to avoid worker thread path issues in Node
const ort = require("onnxruntime-web");
ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const { pipeline, env } = require("@xenova/transformers");

// Configure local cache directory within the workspace
env.cacheDir = path.join(__dirname, ".cache", "transformers");
env.backends.onnx.wasm.proxy = false;

let embedderPromise = null;

/**
 * Generates a dense 384-dimensional neural embedding for the given text.
 * Uses Xenova's lightweight sentence-transformers model (all-MiniLM-L6-v2) in WASM mode.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
async function getNeuralEmbedding(text) {
  if (!text || typeof text !== "string") {
    return new Array(384).fill(0);
  }
  
  if (!embedderPromise) {
    embedderPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");
  }
  
  try {
    const embedder = await embedderPromise;
    const output = await embedder(text, { pooling: "mean", normalize: true });
    return Array.from(output.data);
  } catch (error) {
    console.error("Neural embedding generation error:", error);
    // Safe mathematical fallback in case model execution fails
    return new Array(384).fill(0);
  }
}

module.exports = {
  getNeuralEmbedding
};
