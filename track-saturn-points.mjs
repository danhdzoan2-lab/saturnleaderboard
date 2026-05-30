const CHAIN_ID = 1;
const TOKEN = "0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85";
const TOKEN_LOWER = TOKEN.toLowerCase();
const EXCLUDED = "0x80c6a512b548229226c0676d6fdbaff81d325990";
const ITEMS = 1000;

const wallet = process.argv[2]?.trim();

function unitsToNumber(rawValue) {
  let value = typeof rawValue === "bigint" ? rawValue : BigInt(rawValue || 0);
  const negative = value < 0n;
  if (negative) value = -value;

  const scale = 10n ** 18n;
  const whole = value / scale;
  const fraction = String(value % scale).padStart(18, "0").slice(0, 6);
  const number = Number(`${whole}.${fraction}`);

  return negative ? -number : number;
}

function pointsFromRow(row) {
  return unitsToNumber(BigInt(row.amount || 0) + BigInt(row.pending || 0));
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function validWallet(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address || "");
}

async function fetchWalletPoints(address) {
  const userRewardsUrl = `https://api.merkl.xyz/v4/users/${address}/rewards?chainId=${CHAIN_ID}`;

  try {
    const userRewards = await fetchJson(userRewardsUrl);
    const rewards = userRewards?.[0]?.rewards ?? [];
    const tokenReward = rewards.find((reward) => reward.token?.address?.toLowerCase() === TOKEN_LOWER);
    if (tokenReward) return pointsFromRow(tokenReward);
  } catch {
    // Fall back to the token-recipient endpoint if the user endpoint is unavailable.
  }

  const recipientUrl = `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${TOKEN}&recipient=${address}`;
  const recipientRows = await fetchJson(recipientUrl);
  return recipientRows?.[0] ? pointsFromRow(recipientRows[0]) : 0;
}

async function main() {
  if (wallet && !validWallet(wallet)) {
    throw new Error("Wallet must be a valid 0x address.");
  }

  const leaderboardUrl = `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${TOKEN}&items=${ITEMS}`;
  const totalUrl = `https://api.merkl.xyz/v4/rewards/token/total?chainId=${CHAIN_ID}&address=${TOKEN}`;
  const excludedUrl = `https://api.merkl.xyz/v4/rewards/token/?chainId=${CHAIN_ID}&address=${TOKEN}&recipient=${EXCLUDED}`;

  const [leaderboardRaw, totalRaw, excludedRaw] = await Promise.all([
    fetchJson(leaderboardUrl),
    fetchJson(totalUrl),
    fetchJson(excludedUrl),
  ]);

  const leaderboard = leaderboardRaw
    .filter((row) => row.recipient?.toLowerCase() !== EXCLUDED)
    .map((row) => ({
      address: row.recipient,
      points: pointsFromRow(row),
      amount: unitsToNumber(row.amount),
      pending: unitsToNumber(row.pending),
    }))
    .sort((a, b) => b.points - a.points)
    .map((row, index) => ({ rank: index + 1, ...row }));

  const distributed = unitsToNumber(
    BigInt(totalRaw.amount || 0) - BigInt(excludedRaw?.[0]?.amount || 0),
  );

  const result = {
    updatedAt: new Date().toISOString(),
    token: TOKEN,
    pointsDistributed: distributed,
    leaderboardRows: leaderboard.length,
    top10: leaderboard.slice(0, 10),
  };

  if (wallet) {
    const rankRow = leaderboard.find((entry) => entry.address.toLowerCase() === wallet.toLowerCase());
    result.wallet = {
      address: wallet,
      points: await fetchWalletPoints(wallet),
      rank: rankRow?.rank ?? "1000+",
      leaderboardPoints: rankRow?.points ?? null,
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
