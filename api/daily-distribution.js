const { getSnapshotHistory } = require("./_lib/saturn");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await getSnapshotHistory();
    const snapshots = result.snapshots?.map((snapshot) => ({
      date: snapshot.date,
      capturedAt: snapshot.capturedAt,
      cutoffUtc: snapshot.cutoffUtc,
      distributedPoints: snapshot.distributedPoints,
      rowCount: snapshot.rowCount,
    }));

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ ...result, snapshots });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ available: false, reason: error.message, snapshots: [] });
  }
};
