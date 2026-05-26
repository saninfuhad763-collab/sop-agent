/**
 * Pure JavaScript, memory-safe Rate Limiter Middleware
 * Requires zero native dependencies and runs efficiently in all Node.js environments.
 */

const rateLimitStore = new Map();

/**
 * Creates an Express rate-limiting middleware instance.
 * Automatically handles window reset intervals and cleanups of outdated IPs.
 * 
 * @param {Object} options Configuration options
 * @param {number} options.windowMs Window duration in milliseconds (e.g. 60 * 1000 for 1 minute)
 * @param {number} options.max Maximum requests permitted within the windowMs period
 * @param {string} [options.message] Customizable HTTP 429 response message
 * @returns {Function} Express middleware function
 */
function createRateLimiter(options) {
  const { windowMs, max, message } = options;
  const errMsg = message || "Too many requests from this IP, please try again later.";

  // Set up periodic sweep of expired entries to prevent memory growth
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(ip);
      }
    }
  }, windowMs * 2).unref(); // unref prevents timer from keeping process alive

  return (req, res, next) => {
    const ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      (req.socket ? req.socket.remoteAddress : null) ||
      "unknown-ip";

    const now = Date.now();
    let clientRecord = rateLimitStore.get(ip);

    if (!clientRecord || now > clientRecord.resetTime) {
      rateLimitStore.set(ip, {
        hits: 1,
        resetTime: now + windowMs
      });
      return next();
    }

    clientRecord.hits++;
    if (clientRecord.hits > max) {
      return res.status(429).json({ error: errMsg });
    }

    next();
  };
}

module.exports = {
  createRateLimiter
};
