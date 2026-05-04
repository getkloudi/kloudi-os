import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ReadFileResult {
  content: string;
  path: string;
}

export interface WriteFileResult {
  written: boolean;
  path: string;
}

export interface BashResult {
  output: string;
  exitCode: number;
}

export interface SearchResult {
  matches: Array<{ file: string; line: number; text: string }>;
  count: number;
}

export const builtin = {
  readFile: (path: string): ReadFileResult => ({
    content: readFileSync(path, 'utf-8'),
    path,
  }),

  writeFile: (path: string, content: string): WriteFileResult => {
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, content, 'utf-8');
    return { written: true, path };
  },

  bash: async (command: string): Promise<BashResult> => {
    try {
      const { stdout } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 10,
      });
      return { output: stdout, exitCode: 0 };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message: string; code?: number };
      return { output: e.stderr ?? e.message, exitCode: e.code ?? 1 };
    }
  },

  search: (pattern: string, directory: string = '.'): SearchResult => {
    const matches: Array<{ file: string; line: number; text: string }> = [];

    function searchDir(dir: string): void {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules')
          continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          searchDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const content = readFileSync(fullPath, 'utf-8');
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes(pattern)) {
                matches.push({
                  file: fullPath,
                  line: index + 1,
                  text: line.trim(),
                });
              }
            });
          } catch {
            // skip binary or unreadable files
          }
        }
      }
    }

    searchDir(directory);
    return { matches, count: matches.length };
  },
};
