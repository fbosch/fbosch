const https = require('https');
const fs = require('fs');
const path = require('path');

const USERNAME = process.env.USERNAME || 'fbosch';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Fetch data from GitHub API
function fetchGitHubAPI(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: endpoint,
      headers: {
        'User-Agent': 'Node.js',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`API request failed with status ${res.statusCode}: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function getLanguageStats() {
  const repos = await fetchGitHubAPI(`/users/${USERNAME}/repos?per_page=100&type=owner`);
  const languageStats = {};

  for (const repo of repos) {
    if (repo.fork) continue; // Skip forked repos
    
    try {
      const languages = await fetchGitHubAPI(`/repos/${USERNAME}/${repo.name}/languages`);
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
  
  // Language icon name mappings for Devicon
  const languageIconNames = {
    'JavaScript': 'javascript',
    'TypeScript': 'typescript',
    'Python': 'python',
    'Java': 'java',
    'C++': 'cplusplus',
    'C': 'c',
    'C#': 'csharp',
    'Ruby': 'ruby',
    'Go': 'go',
    'Rust': 'rust',
    'PHP': 'php',
    'Swift': 'swift',
    'Kotlin': 'kotlin',
    'Dart': 'dart',
    'HTML': 'html5',
    'CSS': 'css3',
    'Shell': 'bash',
    'Vue': 'vuejs',
    'Svelte': 'svelte',
    'Scala': 'scala',
    'Lua': 'lua',
    'R': 'r',
    'Perl': 'perl',
    'Haskell': 'haskell',
    'Elixir': 'elixir',
    'Clojure': 'clojure',
    'Objective-C': 'objectivec',
    'Vim Script': 'vim',
    'Jupyter Notebook': 'jupyter',
    'Makefile': 'bash',
    'Dockerfile': 'docker'
  };
  
  return sorted.map(([lang, bytes]) => {
    const percentage = ((bytes / total) * 100).toFixed(1);
    const iconName = languageIconNames[lang] || 'default';
    const iconUrl = `https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${iconName}/${iconName}-original.svg`;
    return { lang, percentage, iconUrl };
  });
}

async function getUserStats() {
  const user = await fetchGitHubAPI(`/users/${USERNAME}`);
  
  return {
    publicRepos: user.public_repos,
    followers: user.followers,
    following: user.following,
    createdAt: new Date(user.created_at).getFullYear()
  };
}

async function getContributionStats() {
  const repos = await fetchGitHubAPI(`/users/${USERNAME}/repos?per_page=100&type=all`);
  
  // Get total stars
  const totalStars = repos
    .filter(repo => !repo.fork)
    .reduce((sum, repo) => sum + repo.stargazers_count, 0);
  
  // Count contributed repos (repos where user is not the owner or forks they contributed to)
  const contributedTo = repos.filter(repo => repo.fork).length;
  
  // Get commits, PRs, and issues
  let totalCommits = 0;
  let totalPRs = 0;
  let totalIssues = 0;
  
  // Get search results for user's contributions
  try {
    // Search for commits
    const currentYear = new Date().getFullYear();
    const commits = await fetchGitHubAPI(`/search/commits?q=author:${USERNAME}+committer-date:${currentYear}-01-01..${currentYear}-12-31&per_page=1`);
    // Note: This only gets current year, for total we'd need to iterate through all years
    
    // Get user's PRs
    const prs = await fetchGitHubAPI(`/search/issues?q=author:${USERNAME}+type:pr&per_page=1`);
    totalPRs = prs.total_count;
    
    // Get user's issues
    const issues = await fetchGitHubAPI(`/search/issues?q=author:${USERNAME}+type:issue&per_page=1`);
    totalIssues = issues.total_count;
  } catch (err) {
    console.error('Error fetching contribution stats:', err.message);
  }
  
  return { 
    totalStars, 
    totalCommits,
    totalPRs,
    totalIssues,
    contributedTo 
  };
}

async function updateReadme() {
  try {
    console.log('Fetching GitHub stats...');
    
    const [userStats, languageStats, contributionStats] = await Promise.all([
      getUserStats(),
      getLanguageStats(),
      getContributionStats()
    ]);

    const statsSection = `<div align="center">

## 📊 GitHub Statistics

### Profile Overview
\`\`\`text
⭐ Total Stars Earned        ${contributionStats.totalStars}
🔀 Total Pull Requests       ${contributionStats.totalPRs}
📝 Total Issues              ${contributionStats.totalIssues}
🤝 Contributed to (repos)    ${contributionStats.contributedTo}
\`\`\`

### 💻 Most Used Languages

${languageStats.map((stat, index) => {
  const barLength = Math.round(parseFloat(stat.percentage) / 2);
  const bar = '█'.repeat(barLength) + '░'.repeat(50 - barLength);
  return `<img src="${stat.iconUrl}" width="20" height="20" /> **${stat.lang}** ${stat.percentage}%\n\`${bar}\``;
}).join('\n\n')}

</div>
`;

    const readmePath = path.join(__dirname, '../../README.md');
    const readmeContent = fs.readFileSync(readmePath, 'utf8');

    // Replace the content between markers, or replace the entire file if no markers
    const startMarker = '<!-- STATS:START -->';
    const endMarker = '<!-- STATS:END -->';
    
    let newContent;
    if (readmeContent.includes(startMarker) && readmeContent.includes(endMarker)) {
      const start = readmeContent.indexOf(startMarker);
      const end = readmeContent.indexOf(endMarker) + endMarker.length;
      newContent = readmeContent.slice(0, start) + 
                   `${startMarker}\n${statsSection}\n${endMarker}` + 
                   readmeContent.slice(end);
    } else {
      // Replace entire content
      newContent = statsSection.trim();
    }

    fs.writeFileSync(readmePath, newContent);
    console.log('README.md updated successfully!');
  } catch (error) {
    console.error('Error updating README:', error);
    process.exit(1);
  }
}

updateReadme();
