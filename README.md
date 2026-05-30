# Saturn Point Dashboard

A self-contained Saturn-inspired dashboard that tracks public Saturn point data.

## Pages

- `index.html` - public Saturn point dashboard and leaderboard
- `analysis.html` - farm analysis for user-saved wallet lists

## What It Uses

- Public Merkl token leaderboard:
  `https://api.merkl.xyz/v4/rewards/token/?chainId=1&address=0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85&items=1000`
- Public Merkl token total:
  `https://api.merkl.xyz/v4/rewards/token/total?chainId=1&address=0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85`
- Optional wallet lookup:
  `https://api.merkl.xyz/v4/users/{wallet}/rewards?chainId=1`

The calculation mirrors the public Saturn client bundle:

- Saturn point token: `0xD223bbdd0421E394C0df9dFfe568f1dADfFd6f85`
- Wallet points: `amount + pending`, formatted with 18 decimals
- Leaderboard: top 1000 token recipients, sorted by points
- Excluded address: `0x80c6a512b548229226c0676d6fdbaff81d325990`
- Distributed points: token total minus the excluded address amount

## Farm Analysis

The farm analysis page does not ship fixed wallet addresses. Users paste one or more public wallet addresses, save them locally in their browser, and can copy/export the saved list or CSV point table.

## Referral Code

`SAT-50BD800F`

## CLI Usage

```bash
node track-saturn-points.mjs
node track-saturn-points.mjs 0xYourWalletAddress
```
