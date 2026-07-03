const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const rootDir = path.resolve(__dirname, "..");
const outputPath = path.join(rootDir, "build-info.json");

function readGitValue(command, fallback) {
    try {
        return execSync(command, {
            cwd: rootDir,
            stdio: ["ignore", "pipe", "ignore"]
        }).toString().trim() || fallback;
    } catch {
        return fallback;
    }
}

const fullSha = readGitValue("git rev-parse HEAD", "local-dev");
const shortSha = readGitValue("git rev-parse --short HEAD", fullSha.slice(0, 7) || "local-dev");

const buildInfo = {
    shortSha,
    fullSha,
    generatedAt: new Date().toISOString(),
    source: process.env.GITHUB_ACTIONS ? "github-actions" : "local-git"
};

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2) + "\n");
console.log(`Wrote ${path.basename(outputPath)} for ${shortSha}`);
