/**
 * Job directory adapter.
 *
 * Owns everything Phase 1 touches on disk: one directory per job under the app
 * cache, plus the existence and listing checks the pipeline needs. The engine
 * receives `file://` URIs and normalises them itself, so paths stay URIs here.
 */

import { Directory, File, Paths } from 'expo-file-system';

import type { ConversionPorts } from '../application/runConversion';
import type { InterruptedRecoveryPorts } from '../application/recoverInterrupted';

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

const cacheJobs = new Directory(Paths.cache, 'transmute');
const recoveryDirectory = new Directory(Paths.document, 'transmute');
const recoveryMarker = new File(recoveryDirectory, 'active-job');

/** Stores no media metadata: it only marks that the cache may contain partial work. */
export async function markConversionRunning(): Promise<void> {
  recoveryDirectory.create({ intermediates: true, idempotent: true });
  recoveryMarker.write('active');
}

export async function clearConversionMarker(): Promise<void> {
  if (recoveryMarker.exists) recoveryMarker.delete();
}

/** Deletes only a picker-created file inside the app cache, never a user URI. */
export async function removePickedSource(path: string): Promise<void> {
  const file = new File(path);
  const cachePrefix = `${Paths.cache.uri.replace(/\/+$/, '')}/`;
  if (!file.uri.startsWith(cachePrefix) || !file.exists) return;
  file.delete();
}

/** Removes one job output directory after its row is explicitly cleared. */
export async function removeJobOutput(path: string): Promise<void> {
  const file = new File(path);
  const jobsPrefix = `${cacheJobs.uri.replace(/\/+$/, '')}/`;
  if (!file.uri.startsWith(jobsPrefix)) return;
  const parentUri = file.uri.slice(0, file.uri.lastIndexOf('/'));
  const directory = new Directory(parentUri);
  if (directory.exists) directory.delete();
}

export const interruptedRecoveryPorts: InterruptedRecoveryPorts = {
  async hasActiveMarker(): Promise<boolean> {
    return recoveryMarker.exists;
  },
  async removePartialOutputs(): Promise<void> {
    if (!cacheJobs.exists) return;
    for (const entry of cacheJobs.list()) {
      if (entry instanceof Directory) entry.delete();
    }
  },
  clearActiveMarker: clearConversionMarker,
};
