const fs = require("fs");
const path = require("path");

function scan(dir, results = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scan(fullPath, results);
    } else {
      results.push(fullPath);
    }
  });

  return results;
}

const repoFiles = scan("./src");

fs.writeFileSync(
  "./audit-output.json",
  JSON.stringify(repoFiles, null, 2)
);

console.log("Audit complete");const fs = require("fs");
const path = require("path");

function scan(dir, results = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scan(fullPath, results);
    } else {
      results.push(fullPath);
    }
  });

  return results;
}

const repoFiles = scan("./src");

fs.writeFileSync(
  "./audit-output.json",
  JSON.stringify(repoFiles, null, 2)
);

console.log("Audit complete");
