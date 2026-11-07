import * as SQLite from 'expo-sqlite';
import { Directory, File, FileMode, Paths } from 'expo-file-system';

import type {
  DurableOutput,
  DurableOutputStore,
  HistoryRecord,
  HistoryRepository,
  HistoryStatus,
  NewHistoryRecord,
} from '../application/resultHistory';
import { mimeTypeFor } from '../domain/mimeTypes';
import { PRESETS, type PresetId } from '../domain/presets';

const DATABASE_NAME = 'transmute-results.db';
const CURRENT_SCHEMA_VERSION = 1;
const outputRoot = new Directory(Paths.document, 'Transmute', 'outputs');

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Initial schema is additive and leaves every existing cache file untouched. */
export const RESULTS_MIGRATIONS: Readonly<Record<number, string>> = {
  1: `
    CREATE TABLE conversion_history (
      id TEXT PRIMARY KEY NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('conversion', 'subtitle-extraction')),
      source_name TEXT NOT NULL,
      source_mime_type TEXT,
      source_size_bytes INTEGER,
      preset_id TEXT,
      status TEXT NOT NULL CHECK (status IN ('converting', 'completed', 'interrupted', 'failed', 'cancelled', 'missing')),
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      failure_message TEXT,
      output_name TEXT,
      output_relative_path TEXT,
      output_mime_type TEXT,
      output_size_bytes INTEGER,
      duration_ms INTEGER
    );
    CREATE INDEX conversion_history_started_at ON conversion_history(started_at DESC);
    PRAGMA user_version = 1;
  `,
};

async function openResultsDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (databasePromise !== null) return databasePromise;
  databasePromise = (async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const version = await database.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    let current = version?.user_version ?? 0;
    if (current > CURRENT_SCHEMA_VERSION) {
      throw new Error(`History database version ${current} is newer than this app supports.`);
    }
    while (current < CURRENT_SCHEMA_VERSION) {
      const next = current + 1;
      const migration = RESULTS_MIGRATIONS[next];
      if (migration === undefined) throw new Error(`Missing history database migration ${next}.`);
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.execAsync(migration);
      });
      current = next;
    }
    return database;
  })().catch((error) => {
    databasePromise = null;
    throw error;
  });
  return databasePromise;
}

type DatabaseRow = {
  id: string;
  operation: 'conversion' | 'subtitle-extraction';
  source_name: string;
  source_mime_type: string | null;
  source_size_bytes: number | null;
  preset_id: string | null;
  status: HistoryStatus;
  started_at: number;
  completed_at: number | null;
  failure_message: string | null;
  output_name: string | null;
  output_relative_path: string | null;
  output_mime_type: string | null;
  output_size_bytes: number | null;
  duration_ms: number | null;
};

function fromDatabase(row: DatabaseRow): HistoryRecord {
  return {
    id: row.id,
    operation: row.operation,
    sourceName: row.source_name,
    sourceMimeType: row.source_mime_type,
    sourceSizeBytes: row.source_size_bytes,
    presetId: row.preset_id as PresetId | null,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failureMessage: row.failure_message,
    outputName: row.output_name,
    outputRelativePath: row.output_relative_path,
    outputMimeType: row.output_mime_type,
    outputSizeBytes: row.output_size_bytes,
    durationMs: row.duration_ms,
  };
}

function isPresetId(value: string): value is PresetId {
  return PRESETS.some((preset) => preset.id === value);
}

export const historyRepository: HistoryRepository = {
  async begin(record: NewHistoryRecord): Promise<void> {
    if ((record.operation === 'conversion' && (record.presetId === null || !isPresetId(record.presetId))) ||
      (record.operation === 'subtitle-extraction' && record.presetId !== null)) {
      throw new Error('History operation and output preset do not match.');
    }
    const database = await openResultsDatabase();
    await database.runAsync(
      `INSERT INTO conversion_history
       (id, operation, source_name, source_mime_type, source_size_bytes, preset_id, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, 'converting', ?)`,
      record.id,
      record.operation,
      record.sourceName,
      record.sourceMimeType,
      record.sourceSizeBytes,
      record.presetId,
      record.startedAt,
    );
  },

  async complete(id: string, output: DurableOutput, completedAt: number): Promise<void> {
    const database = await openResultsDatabase();
    const result = await database.runAsync(
      `UPDATE conversion_history SET status = 'completed', completed_at = ?, output_name = ?,
       output_relative_path = ?, output_mime_type = ?, output_size_bytes = ?, duration_ms = ?
       WHERE id = ? AND status = 'converting'`,
      completedAt,
      output.name,
      output.relativePath,
      output.mimeType,
      output.sizeBytes,
      output.durationMs,
      id,
    );
    if (result.changes !== 1) throw new Error('The conversion record was no longer active.');
  },

  async finish(id: string, status: 'failed' | 'cancelled', message: string | null, completedAt: number): Promise<void> {
    const database = await openResultsDatabase();
    await database.runAsync(
      `UPDATE conversion_history SET status = ?, failure_message = ?, completed_at = ?
       WHERE id = ? AND status = 'converting'`,
      status,
      message,
      completedAt,
      id,
    );
  },

  async listConvertingIds(): Promise<readonly string[]> {
    const database = await openResultsDatabase();
    const active = await database.getAllAsync<{ id: string }>(
      `SELECT id FROM conversion_history WHERE status = 'converting'`,
    );
    return active.map((row) => row.id);
  },

  async markInterrupted(ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const database = await openResultsDatabase();
    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const id of ids) {
        await transaction.runAsync(
          `UPDATE conversion_history SET status = 'interrupted', completed_at = ?
           WHERE id = ? AND status = 'converting'`,
          Date.now(),
          id,
        );
      }
    });
  },

  async markMissing(id: string): Promise<void> {
    const database = await openResultsDatabase();
    await database.runAsync(
      `UPDATE conversion_history SET status = 'missing' WHERE id = ? AND status = 'completed'`,
      id,
    );
  },

  async list(): Promise<readonly HistoryRecord[]> {
    const database = await openResultsDatabase();
    const rows = await database.getAllAsync<DatabaseRow>(
      'SELECT * FROM conversion_history ORDER BY started_at DESC, id DESC',
    );
    return rows.map(fromDatabase);
  },

  async get(id: string): Promise<HistoryRecord | null> {
    const database = await openResultsDatabase();
    const row = await database.getFirstAsync<DatabaseRow>(
      'SELECT * FROM conversion_history WHERE id = ?',
      id,
    );
    return row === null ? null : fromDatabase(row);
  },

  async remove(id: string): Promise<void> {
    const database = await openResultsDatabase();
    await database.runAsync('DELETE FROM conversion_history WHERE id = ?', id);
  },
};

function isRecordId(value: string): boolean {
  return /^result-\d+-\d+-[a-z0-9]+$/.test(value);
}

function parseRelativePath(relativePath: string): { recordId: string; fileName: string } | null {
  const parts = relativePath.split('/');
  if (parts.length !== 2 || !isRecordId(parts[0] ?? '') || !parts[1] || parts[1].includes('..')) return null;
  return { recordId: parts[0]!, fileName: parts[1]! };
}

export const durableOutputStore: DurableOutputStore = {
  async copyFrom(sourcePath, recordId, outputName, durationMs, cancelSignal): Promise<DurableOutput> {
    if (!isRecordId(recordId)) throw new Error('Invalid output record ID.');
    if (outputName.includes('/') || outputName.includes('\\') || outputName.includes('..')) {
      throw new Error('Invalid output file name.');
    }
    const source = new File(sourcePath);
    if (!source.exists) throw new Error('The converted cache output is missing.');
    const sourceSize = source.size ?? 0;
    if (sourceSize <= 0) throw new Error('The converted output is empty or unreadable.');

    outputRoot.create({ intermediates: true, idempotent: true });
    const recordDirectory = new Directory(outputRoot, recordId);
    recordDirectory.create({ intermediates: true, idempotent: true });
    const partial = new File(recordDirectory, `${outputName}.partial`);
    const finalFile = new File(recordDirectory, outputName);
    let sourceHandle: ReturnType<File['open']> | null = null;
    let destinationHandle: ReturnType<File['open']> | null = null;
    try {
      sourceHandle = source.open(FileMode.ReadOnly);
      destinationHandle = partial.open(FileMode.Truncate);
      let copied = 0;
      while (copied < sourceSize) {
        if (cancelSignal?.cancelled === true) throw new Error('Saving the output was cancelled.');
        const bytes = await sourceHandle.readBytes(Math.min(1024 * 1024, sourceSize - copied));
        if (bytes.length === 0) throw new Error(`Durable copy stopped at ${copied} of ${sourceSize} bytes.`);
        await destinationHandle.writeBytes(bytes);
        copied += bytes.length;
      }
      sourceHandle.close();
      sourceHandle = null;
      destinationHandle.close();
      destinationHandle = null;
      if (cancelSignal?.cancelled === true) throw new Error('Saving the output was cancelled.');
      const copiedSize = partial.size ?? 0;
      if (!partial.exists || copiedSize !== sourceSize) {
        throw new Error(`Durable copy size mismatch (${copiedSize} of ${sourceSize} bytes).`);
      }
      await partial.move(finalFile);
      return {
        name: outputName,
        relativePath: `${recordId}/${outputName}`,
        mimeType: mimeTypeFor(outputName),
        sizeBytes: copiedSize,
        durationMs,
      };
    } catch (error) {
      sourceHandle?.close();
      destinationHandle?.close();
      if (partial.exists) partial.delete();
      if (finalFile.exists) finalFile.delete();
      throw error;
    }
  },

  uri(relativePath: string): string {
    const parsed = parseRelativePath(relativePath);
    if (parsed === null) throw new Error('Invalid output path in history.');
    return new File(outputRoot, parsed.recordId, parsed.fileName).uri;
  },

  async exists(relativePath: string): Promise<boolean> {
    const parsed = parseRelativePath(relativePath);
    return parsed !== null && new File(outputRoot, parsed.recordId, parsed.fileName).exists;
  },

  async delete(relativePath: string): Promise<void> {
    const parsed = parseRelativePath(relativePath);
    if (parsed === null) throw new Error('Refusing to delete an output outside Transmute storage.');
    const file = new File(outputRoot, parsed.recordId, parsed.fileName);
    if (file.exists) file.delete();
  },

  async removeRecordFiles(recordId: string): Promise<void> {
    if (!isRecordId(recordId)) throw new Error('Refusing to delete an unknown output directory.');
    const recordDirectory = new Directory(outputRoot, recordId);
    if (recordDirectory.exists) recordDirectory.delete();
  },
};
