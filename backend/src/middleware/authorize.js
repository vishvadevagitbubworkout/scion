/**
 * Role-based authorization middleware factory.
 * @param  {...string} allowedRoles - The roles permitted to access the route (e.g. "ROOT", "AUTHOR", "VIEWER")
 * @returns {import("express").RequestHandler}
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    // If request has not been authenticated first
    if (!req.user) {
      return res.status(401).json({
        message: "Unauthorized: Authentication required",
      });
    }

    // If user's role is not in the allowed roles list
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: "Forbidden: You do not have permission to access this resource",
      });
    }

    next();
  };
}
