const fs = require("fs");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
  quiet: true,
});

const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { getAllowedDownloadRoots } = require("./modules/storage-paths");

const app = express();
const PORT = Number(process.env.PORT) || 4001;

function cleanText(value = "") {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function isPathInside(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return !relativePath || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

function resolveSavedPhotoPath(requestPath = "") {
  const decodedPath = decodeURIComponent(cleanText(requestPath));
  const relativeParts = decodedPath
    .split(/[\\/]+/)
    .map((segment) => cleanText(segment))
    .filter((segment) => segment && segment !== "." && segment !== "..");

  if (!relativeParts.length) {
    return "";
  }

  const relativePath = relativeParts.join(path.sep);

  for (const rootPath of getAllowedDownloadRoots()) {
    const resolvedRoot = path.resolve(rootPath);
    const candidatePath = path.resolve(resolvedRoot, relativePath);

    if (isPathInside(resolvedRoot, candidatePath) && fs.existsSync(candidatePath)) {
      return candidatePath;
    }
  }

  return "";
}

app.use(
  cors({
    origin: ["http://localhost:4173", "http://127.0.0.1:4173"],
  })
);
app.use(express.json());
app.get(/^\/api\/gmb-photo-files\/(.+)$/, (req, res) => {
  const filePath = resolveSavedPhotoPath(req.params?.[0] || "");

  if (!filePath) {
    res.status(404).json({
      ok: false,
      error: "Saved photo file was not found.",
    });
    return;
  }

  res.sendFile(filePath);
});
app.use(routes);

function startServer(port = PORT) {
  return app.listen(port, () => {
    console.log(`BizFinder Pro server running on port ${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer,
};
