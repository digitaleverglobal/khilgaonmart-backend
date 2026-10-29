const { createUserLogHistory, shouldLogRequest } = require("../utils/userLogHistory");

const userLogHistory = (req, res, next) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    if (!req.user) return;
    if (!shouldLogRequest(req)) return;

    createUserLogHistory({
      req,
      user: req.user,
      statusCode: res.statusCode,
      responseMessage: res.locals?.responseMessage || null,
      metadata: {
        durationMs: Date.now() - startedAt,
      },
    });
  });

  next();
};

module.exports = userLogHistory;
