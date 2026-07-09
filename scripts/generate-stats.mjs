// Generates self-hosted GitHub stats/top-languages SVG cards for the profile
// README, using only the GitHub REST API and Node's built-in fetch — no
// third-party rendering service or npm dependency, so nothing outside this
// repo's own commit history can break or compromise the cards.

const USERNAME = "PhilopaterSh";
const TOKEN = process.env.GITHUB_TOKEN;
const API = "https://api.github.com";

const THEME = {
  bg: "#02060a",
  border: "#1e293b",
  title: "#00f2ff",
  text: "#ffffff",
  muted: "#94a3b8",
  bar: "#0077ff",
};

// Linguist colors for languages likely to appear in this account's repos;
// anything else falls back to THEME.bar.
const LANG_COLORS = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Go: "#00ADD8",
  Python: "#3572A5",
  Shell: "#89e051",
  PowerShell: "#012456",
  CSS: "#563d7c",
  HTML: "#e34c26",
  Dockerfile: "#384d54",
};

/**
 * Calls a GitHub REST API endpoint with the workflow's token.
 * @param {string} path - API path, e.g. "/users/foo".
 * @returns {Promise<any>} Parsed JSON response.
 */
async function ghGet(path) {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": `${USERNAME}-profile-stats`,
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Fetches every owned, non-fork public repo for the account.
 * @returns {Promise<any[]>} Repo objects from the GitHub REST API.
 */
async function fetchOwnedRepos() {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await ghGet(
      `/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`,
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork);
}

/**
 * Aggregates per-language byte counts across the given repos.
 * @param {any[]} repos - Repo objects to sum languages for.
 * @returns {Promise<[string, number][]>} [language, bytes] pairs, sorted descending.
 */
async function fetchTopLanguages(repos) {
  const totals = {};
  for (const repo of repos) {
    const langs = await ghGet(`/repos/${USERNAME}/${repo.name}/languages`);
    for (const [lang, bytes] of Object.entries(langs)) {
      totals[lang] = (totals[lang] || 0) + bytes;
    }
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

/**
 * Escapes text for safe interposition into SVG/XML content.
 * @param {string} s - Raw text.
 * @returns {string} XML-escaped text.
 */
function esc(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
}

/**
 * Renders the "GitHub Stats" summary card as an SVG string.
 * @param {{repos: number, stars: number, followers: number}} stats - Values to display.
 * @returns {string} Complete SVG markup.
 */
function renderStatsCard(stats) {
  const rows = [
    [`⭐ Total Stars`, stats.stars],
    [`📦 Public Repos`, stats.repos],
    [`👥 Followers`, stats.followers],
  ];
  const rowsSvg = rows
    .map(
      ([label, value], i) => `
    <text x="25" y="${60 + i * 28}" fill="${THEME.muted}" font-size="14">${esc(label)}</text>
    <text x="420" y="${60 + i * 28}" fill="${THEME.text}" font-size="14" font-weight="600" text-anchor="end">${esc(value)}</text>`,
    )
    .join("");
  return `<svg width="450" height="150" viewBox="0 0 450 150" xmlns="http://www.w3.org/2000/svg">
  <rect x="0.5" y="0.5" width="449" height="149" rx="10" fill="${THEME.bg}" stroke="${THEME.border}" />
  <text x="25" y="30" fill="${THEME.title}" font-size="16" font-weight="700">${esc(USERNAME)}'s GitHub Stats</text>
  ${rowsSvg}
</svg>`;
}

/**
 * Renders the "Top Languages" bar-chart card as an SVG string.
 * @param {[string, number][]} langs - [language, bytes] pairs, most-used first.
 * @returns {string} Complete SVG markup.
 */
function renderTopLangsCard(langs) {
  const top = langs.slice(0, 6);
  const total = top.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
  const barsSvg = top
    .map(([lang, bytes], i) => {
      const pct = ((bytes / total) * 100).toFixed(1);
      const color = LANG_COLORS[lang] || THEME.bar;
      const y = 55 + i * 26;
      const barWidth = (pct / 100) * 260;
      return `
    <text x="25" y="${y}" fill="${THEME.text}" font-size="13">${esc(lang)}</text>
    <rect x="150" y="${y - 11}" width="260" height="10" rx="5" fill="${THEME.border}" />
    <rect x="150" y="${y - 11}" width="${barWidth.toFixed(1)}" height="10" rx="5" fill="${color}" />
    <text x="420" y="${y}" fill="${THEME.muted}" font-size="12" text-anchor="end">${pct}%</text>`;
    })
    .join("");
  const height = 45 + top.length * 26 + 15;
  return `<svg width="450" height="${height}" viewBox="0 0 450 ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0.5" y="0.5" width="449" height="${height - 1}" rx="10" fill="${THEME.bg}" stroke="${THEME.border}" />
  <text x="25" y="30" fill="${THEME.title}" font-size="16" font-weight="700">Most Used Languages</text>
  ${barsSvg}
</svg>`;
}

async function main() {
  const { fs } = await import("node:fs/promises").then((m) => ({ fs: m }));
  const user = await ghGet(`/users/${USERNAME}`);
  const repos = await fetchOwnedRepos();
  const stars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
  const langs = await fetchTopLanguages(repos);

  await fs.mkdir("assets", { recursive: true });
  await fs.writeFile(
    "assets/github-stats.svg",
    renderStatsCard({ repos: user.public_repos, stars, followers: user.followers }),
  );
  await fs.writeFile("assets/top-langs.svg", renderTopLangsCard(langs));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
