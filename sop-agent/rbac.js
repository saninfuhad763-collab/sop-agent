/**
 * Role-Based Access Control (RBAC) Middleware Module
 */

/**
 * Creates a middleware that checks if the logged-in user possesses one of the allowed roles.
 * Supports fallback to memoryUsers for standard operation if MongoDB is unavailable.
 * Roles:
 * - 'owner': Full access (billing, inviting team members, uploads, deletions).
 * - 'editor': Read/write access (uploads, deletions, chats, viewing docs).
 * - 'viewer': Read-only access (chats, viewing docs).
 * 
 * @param {string[]} allowedRoles - List of authorized roles (e.g. ['owner', 'editor'])
 * @returns {Function} Express middleware function
 */
function authorizeRoles(allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.email) {
        return res.status(401).json({ error: "Unauthorized. JWT session not found." });
      }

      const email = req.user.email.trim().toLowerCase();
      let user = null;

      // Access parent/server collections dynamically
      const usersCollection = req.app.get("usersCollection");
      const memoryUsers = req.app.get("memoryUsers") || [];

      if (usersCollection) {
        user = await usersCollection.findOne({ email });
      } else {
        user = memoryUsers.find(u => u.email === email);
      }

      if (!user) {
        return res.status(404).json({ error: "Authorized user profile not found." });
      }

      // Default role assignments: owner of space, or invited role
      const role = user.role || (user.teamOwnerEmail ? "editor" : "owner");

      if (!allowedRoles.includes(role)) {
        return res.status(403).json({
          error: `Access Denied: Required permissions missing. Your role is '${role}', but this action requires one of: [${allowedRoles.join(", ")}].`
        });
      }

      // Attach resolved role to request object
      req.user.role = role;
      next();
    } catch (error) {
      console.error("RBAC middleware check failed:", error);
      res.status(500).json({ error: "Internal authorization processing error." });
    }
  };
}

module.exports = {
  authorizeRoles
};
