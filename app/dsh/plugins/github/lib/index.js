/**
 * GitHub Integration Plugin for DeepSeek Harness
 * View repositories, submit PRs, handle issues, review code
 */
export class GitHubPlugin {
  name = 'github';
  description = 'GitHub integration - view repos, submit PRs, handle issues, review code';
  
  constructor(ctx) {
    this.ctx = ctx;
    this.octokit = null;
  }

  async activate() {
    console.log('[GitHub Plugin] Activated');
    await this.initializeClient();
  }

  async deactivate() {
    console.log('[GitHub Plugin] Deactivated');
  }

  async initializeClient() {
    try {
      const { Octokit } = await import('@octokit/rest');
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
      
      this.octokit = new Octokit({
        auth: token
      });
      
      console.log('[GitHub Plugin] Client initialized');
    } catch (error) {
      console.error('[GitHub Plugin] Failed to initialize client:', error);
    }
  }

  async getRepositories(owner) {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.repos.listForUser({ username: owner });
    return data.map(repo => ({
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      stars: repo.stargazers_count,
      forks: repo.forks_count
    }));
  }

  async getRepository(owner, repo) {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async createIssue(owner, repo, title, body, labels = []) {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.issues.create({
      owner,
      repo,
      title,
      body,
      labels
    });
    return data;
  }

  async createPullRequest(owner, repo, title, body, head, base = 'main') {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      body,
      head,
      base
    });
    return data;
  }

  async reviewPullRequest(owner, repo, pullNumber, body, event = 'COMMENT') {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      body,
      event
    });
    return data;
  }

  async getIssues(owner, repo, state = 'open') {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.issues.listForRepo({
      owner,
      repo,
      state
    });
    return data;
  }

  async getPullRequests(owner, repo, state = 'open') {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.pulls.list({
      owner,
      repo,
      state
    });
    return data;
  }

  async getFileContent(owner, repo, path, ref = 'main') {
    if (!this.octokit) throw new Error('GitHub client not initialized');
    const { data } = await this.octokit.repos.getContent({
      owner,
      repo,
      path,
      ref
    });
    return data;
  }
}

export default GitHubPlugin;
