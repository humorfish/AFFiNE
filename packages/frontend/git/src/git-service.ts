import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export class GitService {
  constructor(private readonly cwd: string) {}

  private async run(...args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Story App',
        GIT_AUTHOR_EMAIL: 'story@app.local',
        GIT_COMMITTER_NAME: 'Story App',
        GIT_COMMITTER_EMAIL: 'story@app.local',
      },
    });
    return stdout.trim();
  }

  async init(): Promise<void> {
    await this.run('init');
  }

  async clone(url: string, target?: string): Promise<void> {
    if (target) {
      await this.run('clone', url, target);
    } else {
      await this.run('clone', url);
    }
  }

  async add(pathspec: string): Promise<void> {
    await this.run('add', pathspec);
  }

  async commit(message: string): Promise<void> {
    await this.run('commit', '-m', message);
  }

  async pull(): Promise<string> {
    return this.run('pull');
  }

  async push(): Promise<string> {
    return this.run('push');
  }

  async log(): Promise<string> {
    return this.run('log', '--oneline');
  }

  async status(): Promise<string> {
    return this.run('status', '--porcelain');
  }
}
