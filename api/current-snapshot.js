const { buildCurrentSnapshot } = require("./_lib/saturn");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const snapshot = await buildCurrentSnapshot(new Date());
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return res.status(200).json({ available: true, snapshot });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ available: false, reason: error.message });
  }
};
