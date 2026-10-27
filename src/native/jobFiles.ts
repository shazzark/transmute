/**
 * Job directory adapter.
 *
 * Owns everything Phase 1 touches on disk: one directory per job under the app
 * cache, plus the existence and listing checks the pipeline needs. The engine
 * receives `file://` URIs and normalises them itself, so paths stay URIs here.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { ConversionPorts } from '../application/runConversion';

export type JobFilePorts = Pick<
  ConversionPorts,
  'createJobDirectory' | 'removeDirectory' | 'fileExists' | 'listDirectory' | 'joinPath'
>;

let jobCounter = 0;

export function createJobFilePorts(): JobFilePorts {
  return {
    async createJobDirectory(): Promise<string> {
      jobCounter += 1;
      const directory = new Directory(Paths.cache, 'transmute', `job-${Date.now()}-${jobCounter}`);
      directory.create({ intermediates: true, idempotent: true });
      return directory.uri;
    },

    async removeDirectory(path: string): Promise<void> {
      const directory = new Directory(path);
      // Missing is fine: cleanup runs on paths that may never have been created.
      if (directory.exists) {
        directory.delete();
      }
    },

    async fileExists(path: string): Promise<boolean> {
      return new File(path).exists;
    },

    async listDirectory(path: string): Promise<readonly string[]> {
      const directory = new Directory(path);
      if (!directory.exists) {
        return [];
      }
      return directory.list().map((entry) => entry.name);
    },

    joinPath(directory: string, name: string): string {
      // Built through a Directory so the platform's separator and escaping apply.
      return new File(new Directory(directory), name).uri;
    },
  };
}
