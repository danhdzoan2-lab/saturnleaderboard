const { getLatestSnapshot } = require("./_lib/saturn");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await getLatestSnapshot();
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(200).json({ available: false, reason: error.message });
  }
};
