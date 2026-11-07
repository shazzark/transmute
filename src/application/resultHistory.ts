import type { PresetId } from '../domain/presets';

export type HistoryStatus = 'converting' | 'completed' | 'interrupted' | 'failed' | 'cancelled' | 'missing';
export type HistoryOperation = 'conversion' | 'subtitle-extraction';

export interface HistoryRecord {
  readonly id: string;
  readonly operation: HistoryOperation;
  readonly sourceName: string;
  readonly sourceMimeType: string | null;
  readonly sourceSizeBytes: number | null;
  readonly presetId: PresetId | null;
  readonly status: HistoryStatus;
  readonly startedAt: number;
  readonly completedAt: number | null;
  readonly failureMessage: string | null;
  readonly outputName: string | null;
  readonly outputRelativePath: string | null;
  readonly outputMimeType: string | null;
  readonly outputSizeBytes: number | null;
  readonly durationMs: number | null;
}

export interface NewHistoryRecord {
  readonly id: string;
  readonly operation: HistoryOperation;
  readonly sourceName: string;
  readonly sourceMimeType: string | null;
  readonly sourceSizeBytes: number | null;
  readonly presetId: PresetId | null;
  readonly startedAt: number;
}

export interface DurableOutput {
  readonly name: string;
  readonly relativePath: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationMs: number | null;
}

export interface HistoryRepository {
  begin(record: NewHistoryRecord): Promise<void>;
  complete(id: string, output: DurableOutput, completedAt: number): Promise<void>;
  finish(id: string, status: 'failed' | 'cancelled', message: string | null, completedAt: number): Promise<void>;
  listConvertingIds(): Promise<readonly string[]>;
  markInterrupted(ids: readonly string[]): Promise<void>;
  markMissing(id: string): Promise<void>;
  list(): Promise<readonly HistoryRecord[]>;
  get(id: string): Promise<HistoryRecord | null>;
  remove(id: string): Promise<void>;
}

export interface DurableOutputStore {
  copyFrom(sourcePath: string, recordId: string, outputName: string, durationMs: number | null, cancelSignal?: { readonly cancelled: boolean }): Promise<DurableOutput>;
  uri(relativePath: string): string;
  exists(relativePath: string): Promise<boolean>;
  delete(relativePath: string): Promise<void>;
  removeRecordFiles(recordId: string): Promise<void>;
}

export interface ResultHistoryPorts {
  readonly repository: HistoryRepository;
  readonly files: DurableOutputStore;
  readonly now: () => number;
}

let idCounter = 0;

export function createHistoryId(now = Date.now(), random = Math.random()): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `result-${now}-${idCounter}-${random.toString(36).slice(2, 10)}`;
}

export async function beginHistoryRecord(
  ports: ResultHistoryPorts,
  input: Omit<NewHistoryRecord, 'id' | 'startedAt'>,
): Promise<string> {
  const id = createHistoryId(ports.now());
  await ports.repository.begin({ ...input, id, startedAt: ports.now() });
  return id;
}

/** Copies to durable storage before the database may call a conversion complete. */
export async function completeHistoryRecord(
  ports: ResultHistoryPorts,
  id: string,
  sourcePath: string,
  outputName: string,
  durationMs: number | null,
  cancelSignal?: { readonly cancelled: boolean },
): Promise<HistoryRecord> {
  const output = await ports.files.copyFrom(sourcePath, id, outputName, durationMs, cancelSignal);
  try {
    await ports.repository.complete(id, output, ports.now());
  } catch (error) {
    await ports.files.removeRecordFiles(id).catch(() => undefined);
    throw error;
  }
  const record = await ports.repository.get(id);
  if (record === null) throw new Error('The completed history record could not be read back.');
  return record;
}

/** Converts process-death rows to Interrupted and reconciles completed rows with disk. */
export async function recoverResultHistory(ports: ResultHistoryPorts): Promise<readonly HistoryRecord[]> {
  const interruptedIds = await ports.repository.listConvertingIds();
  for (const id of interruptedIds) await ports.files.removeRecordFiles(id);
  await ports.repository.markInterrupted(interruptedIds);

  const records = await ports.repository.list();
  for (const record of records) {
    if (record.status === 'completed' && record.outputRelativePath !== null &&
      !(await ports.files.exists(record.outputRelativePath))) {
      await ports.repository.markMissing(record.id);
    }
  }
  return ports.repository.list();
}

/** Deletes both the selected history entry and its app-owned output, if present. */
export async function removeHistoryRecord(ports: ResultHistoryPorts, id: string): Promise<void> {
  const record = await ports.repository.get(id);
  if (record === null) return;
  if (record.status === 'converting') throw new Error('A conversion in progress cannot be removed.');
  await ports.files.removeRecordFiles(id);
  await ports.repository.remove(id);
}

/** Keeps the history row while removing its output and recording the missing state. */
export async function deleteHistoryOutput(ports: ResultHistoryPorts, id: string): Promise<void> {
  const record = await ports.repository.get(id);
  if (record === null || record.outputRelativePath === null) return;
  if (record.status === 'converting') throw new Error('A conversion in progress has no completed output to delete.');
  await ports.files.delete(record.outputRelativePath);
  await ports.repository.markMissing(id);
}

/** Clears each row only after its owned bytes have been deleted successfully. */
export async function clearHistoryAndOutputs(ports: ResultHistoryPorts): Promise<readonly string[]> {
  const records = await ports.repository.list();
  const failed: string[] = [];
  for (const record of records) {
    if (record.status === 'converting') {
      failed.push(record.id);
      continue;
    }
    try {
      await ports.files.removeRecordFiles(record.id);
      await ports.repository.remove(record.id);
    } catch {
      failed.push(record.id);
    }
  }
  return failed;
}
