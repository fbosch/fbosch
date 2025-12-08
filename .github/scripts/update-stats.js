const https = require("https");
const fs = require("fs");
const path = require("path");

const USERNAME =
  process.env.GITHUB_USERNAME || process.env.USERNAME || "fbosch";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required");
  console.error(
    "Usage: GITHUB_TOKEN=your_token_here node .github/scripts/update-stats.js",
  );
  process.exit(1);
}

// Fetch data from GitHub API
function fetchGitHubAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: endpoint,
      headers: {
        "User-Agent": "Node.js",
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
      },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            reject(
              new Error(
                `API request failed with status ${res.statusCode}: ${data}`,
              ),
            );
          }
        });
      })
      .on("error", reject);
  });
}

async function getLanguageStats() {
  const repos = await fetchGitHubAPI(
    `/users/${USERNAME}/repos?per_page=100&type=all`,
  );
  const languageStats = {};

  for (const repo of repos) {
    if (repo.fork) continue; // Skip forked repos

    try {
      const languages = await fetchGitHubAPI(
        `/repos/${USERNAME}/${repo.name}/languages`,
      );
      for (const [lang, bytes] of Object.entries(languages)) {
        languageStats[lang] = (languageStats[lang] || 0) + bytes;
      }
    } catch (err) {
      console.error(`Error fetching languages for ${repo.name}:`, err.message);
    }
  }

  // Sort by usage and get top languages
  const sorted = Object.entries(languageStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const total = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);

  // GitHub's language colors (official colors used in GitHub UI)
  const languageColors = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Ruby: "#701516",
    Go: "#00ADD8",
    Rust: "#dea584",
    PHP: "#4F5D95",
    Swift: "#ffac45",
    Kotlin: "#A97BFF",
    Dart: "#00B4AB",
    HTML: "#e34c26",
    CSS: "#563d7c",
    Shell: "#89e051",
    Vue: "#41b883",
    Svelte: "#ff3e00",
    Scala: "#c22d40",
    Lua: "#000080",
    R: "#198CE7",
    Perl: "#0298c3",
    Haskell: "#5e5086",
    Elixir: "#6e4a7e",
    Clojure: "#db5855",
    "Objective-C": "#438eff",
    "Vim Script": "#199f4b",
    "Jupyter Notebook": "#DA5B0B",
    Makefile: "#427819",
    Dockerfile: "#384d54",
    Nix: "#7e7eff",
  };

  return sorted.map(([lang, bytes]) => {
    const percentage = ((bytes / total) * 100).toFixed(1);
    const color = languageColors[lang] || "#858585";
    return { lang, percentage, color };
  });
}

async function getStreakStats() {
  try {
    // Fetch contribution calendar data using GraphQL
    const query = JSON.stringify({
      query: `
        query($username: String!) {
          user(login: $username) {
            contributionsCollection {
              contributionCalendar {
                totalContributions
                weeks {
                  contributionDays {
                    contributionCount
                    date
                  }
                }
              }
            }
          }
        }
      `,
      variables: { username: USERNAME },
    });

    const data = await new Promise((resolve, reject) => {
      const options = {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "Node.js",
        },
      };

      const req = https.request(options, (res) => {
        let responseData = "";
        res.on("data", (chunk) => (responseData += chunk));
        res.on("end", () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(responseData));
          } else {
            reject(
              new Error(
                `GraphQL request failed with status ${res.statusCode}: ${responseData}`,
              ),
            );
          }
        });
      });

      req.on("error", reject);
      req.write(query);
      req.end();
    });

    const days =
      data.data.user.contributionsCollection.contributionCalendar.weeks
        .flatMap((week) => week.contributionDays)
        .map((day) => ({
          date: day.date,
          count: day.contributionCount,
        }));

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = days.length - 1; i >= 0; i--) {
      const dayDate = new Date(days[i].date);
      const diffDays = Math.floor((today - dayDate) / (1000 * 60 * 60 * 24));

      if (diffDays > currentStreak) break;
      if (days[i].count > 0) {
        currentStreak++;
      } else if (currentStreak > 0) {
        break;
      }
    }

    // Calculate longest streak
    let longestStreak = 0;
    let tempStreak = 0;

    for (const day of days) {
      if (day.count > 0) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 0;
      }
    }

    // Calculate active days this year
    const activeDaysThisYear = days.filter((day) => day.count > 0).length;

    return {
      currentStreak,
      longestStreak,
      activeDaysThisYear,
    };
  } catch (err) {
    console.error("Error fetching streak stats:", err.message);
    return {
      currentStreak: 0,
      longestStreak: 0,
      activeDaysThisYear: 0,
    };
  }
}

async function getUserStats() {
  const user = await fetchGitHubAPI(`/users/${USERNAME}`);

  return {
    publicRepos: user.public_repos,
    followers: user.followers,
    following: user.following,
    createdAt: new Date(user.created_at).getFullYear(),
  };
}

async function getContributionStats() {
  const repos = await fetchGitHubAPI(
    `/users/${USERNAME}/repos?per_page=100&type=all`,
  );

  // Get total stars (only count repos you own - exclude forks and repos where you're not the owner)
  const ownedRepos = repos.filter(
    (repo) => !repo.fork && repo.owner.login === USERNAME,
  );
  const totalStars = ownedRepos.reduce(
    (sum, repo) => sum + repo.stargazers_count,
    0,
  );

  // Count contributed repos (forks)
  const contributedTo = repos.filter((repo) => repo.fork).length;

  // Get commits, PRs, and issues
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;

  // Get search results for user's contributions
  try {
    // Search for commits
    const currentYear = new Date().getFullYear();
    const commits = await fetchGitHubAPI(
      `/search/commits?q=author:${USERNAME}+committer-date:${currentYear}-01-01..${currentYear}-12-31&per_page=1`,
    );
    // Note: This only gets current year, for total we'd need to iterate through all years

    // Get user's PRs
    const prs = await fetchGitHubAPI(
      `/search/issues?q=author:${USERNAME}+type:pr&per_page=1`,
    );
    totalPRs = prs.total_count;

    // Get user's issues
    const issues = await fetchGitHubAPI(
      `/search/issues?q=author:${USERNAME}+type:issue&per_page=1`,
    );
    totalIssues = issues.total_count;
  } catch (err) {
    console.error("Error fetching contribution stats:", err.message);
  }

  return {
    totalStars,
    totalCommits,
    totalPRs,
    totalIssues,
    contributedTo,
  };
}

async function updateReadme() {
  try {
    console.log("Fetching GitHub stats...");

    const [userStats, languageStats, contributionStats, streakStats] =
      await Promise.all([
        getUserStats(),
        getLanguageStats(),
        getContributionStats(),
        getStreakStats(),
      ]);

    const statsSection = `<div align="center">

<table width="100%">
<tr>
<td valign="top" width="50%" align="left">

**Profile**

| Metric | Count |
|--------|-------|
| Total Stars | ${contributionStats.totalStars} |
| Pull Requests | ${contributionStats.totalPRs} |
| Issues | ${contributionStats.totalIssues} |
| Contributed Repos | ${contributionStats.contributedTo} |
| Current Streak | ${streakStats.currentStreak} days |
| Longest Streak | ${streakStats.longestStreak} days |
| Active Days (2025) | ${streakStats.activeDaysThisYear} days |

</td>
<td valign="top" width="50%" align="left">

<table>
${languageStats
  .map((stat) => {
    const encodedLang = encodeURIComponent(stat.lang);
    const searchUrl = `https://github.com/${USERNAME}?tab=repositories&q&type=source&language=${encodedLang.toLowerCase()}&sort`;
    // Remove # from color for shields.io
    const colorCode = stat.color.replace("#", "");

    // Simple logo mappings for shields.io
    const logoNames = {
      TypeScript: "typescript",
      JavaScript: "javascript",
      Python: "python",
      Java: "openjdk",
      "C++": "cplusplus",
      C: "c",
      "C#": "csharp",
      Ruby: "ruby",
      Go: "go",
      Rust: "rust",
      PHP: "php",
      Swift: "swift",
      Kotlin: "kotlin",
      Dart: "dart",
      HTML: "html5",
      CSS: "css3",
      SCSS: "sass",
      Shell: "gnubash",
      Vue: "vuedotjs",
      Svelte: "svelte",
      Scala: "scala",
      Lua: "lua",
      R: "r",
      Perl: "perl",
      Haskell: "haskell",
      Elixir: "elixir",
      Clojure: "clojure",
      "Objective-C": "apple",
      "Vim Script": "vim",
      "Jupyter Notebook": "jupyter",
      Makefile: "cmake",
      Dockerfile: "docker",
      Nix: "nixos",
    };

    const logo = logoNames[stat.lang] || "";
    const badgeUrl = logo
      ? `https://img.shields.io/badge/${encodedLang}-${stat.percentage}%25-${colorCode}?style=flat&logo=${logo}&logoColor=white`
      : `https://img.shields.io/badge/${encodedLang}-${stat.percentage}%25-${colorCode}?style=flat`;

    const barLength = Math.round(parseFloat(stat.percentage) / 2.5);
    const bar = "█".repeat(barLength) + "░".repeat(40 - barLength);

    return `<tr><td><a href="${searchUrl}"><img src="${badgeUrl}" alt="${stat.lang}"></a></td><td><code>${bar}</code></td></tr>`;
  })
  .join("\n")}
</table>

</td>
</tr>
</table>

</div>
`;

    const readmePath = path.join(__dirname, "../../README.md");
    const readmeContent = fs.readFileSync(readmePath, "utf8");

    // Replace the content between markers, or replace the entire file if no markers
    const startMarker = "<!-- STATS:START -->";
    const endMarker = "<!-- STATS:END -->";

    let newContent;
    if (
      readmeContent.includes(startMarker) &&
      readmeContent.includes(endMarker)
    ) {
      const start = readmeContent.indexOf(startMarker);
      const end = readmeContent.indexOf(endMarker) + endMarker.length;
      newContent =
        readmeContent.slice(0, start) +
        `${startMarker}\n${statsSection}\n${endMarker}` +
        readmeContent.slice(end);
    } else {
      // Replace entire content
      newContent = statsSection.trim();
    }

    fs.writeFileSync(readmePath, newContent);
    console.log("README.md updated successfully!");
  } catch (error) {
    console.error("Error updating README:", error);
    process.exit(1);
  }
}

updateReadme();
