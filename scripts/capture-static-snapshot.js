const fs = require("fs");
const path = require("path");
const { buildCurrentSnapshot } = require("../api/_lib/saturn");

async function main() {
  const snapshot = await buildCurrentSnapshot(new Date());
  const snapshotDir = path.join(__dirname, "..", "snapshots");
  const indexPath = path.join(snapshotDir, "index.json");
  const snapshotPath = path.join(snapshotDir, `${snapshot.date}.json`);

  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot)}\n`, "utf8");

  let dates = [];
  if (fs.existsSync(indexPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      dates = Array.isArray(existing.dates) ? existing.dates : [];
    } catch {
      dates = [];
    }
  }

  const nextIndex = {
    updatedAt: snapshot.capturedAt,
    dates: [...new Set([...dates, snapshot.date])].sort(),
  };

  fs.writeFileSync(indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`, "utf8");
  console.log(
    `Captured ${snapshot.date}: ${snapshot.rowCount} rows, ${Math.round(snapshot.distributedPoints)} distributed points`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
