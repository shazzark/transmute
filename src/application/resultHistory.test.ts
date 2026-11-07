import { describe, expect, it, vi } from 'vitest';

import {
  clearHistoryAndOutputs,
  completeHistoryRecord,
  deleteHistoryOutput,
  recoverResultHistory,
  removeHistoryRecord,
  type DurableOutput,
  type HistoryRecord,
  type HistoryRepository,
  type NewHistoryRecord,
  type ResultHistoryPorts,
} from './resultHistory';

function createHarness(initial: readonly HistoryRecord[] = []) {
  const records = new Map(initial.map((record) => [record.id, record]));
  const files = new Set(initial.flatMap((record) => record.outputRelativePath ? [record.outputRelativePath] : []));
  const order: string[] = [];
  const repository: HistoryRepository = {
    async begin(record: NewHistoryRecord) {
      records.set(record.id, {
        ...record,
        status: 'converting',
        completedAt: null,
        failureMessage: null,
        outputName: null,
        outputRelativePath: null,
        outputMimeType: null,
        outputSizeBytes: null,
        durationMs: null,
      });
    },
    async complete(id: string, output: DurableOutput, completedAt: number) {
      order.push('database-complete');
      const current = records.get(id);
      if (current) records.set(id, { ...current, status: 'completed', completedAt, ...{
        outputName: output.name,
        outputRelativePath: output.relativePath,
        outputMimeType: output.mimeType,
        outputSizeBytes: output.sizeBytes,
        durationMs: output.durationMs,
      } });
    },
    async finish() {},
    async listConvertingIds() {
      return [...records.values()].filter((item) => item.status === 'converting').map((item) => item.id);
    },
    async markInterrupted(ids) {
      for (const id of ids) {
        const current = records.get(id);
        if (current?.status === 'converting') records.set(id, { ...current, status: 'interrupted' });
      }
    },
    async markMissing(id: string) {
      const current = records.get(id);
      if (current) records.set(id, { ...current, status: 'missing' });
    },
    async list() { return [...records.values()]; },
    async get(id: string) { return records.get(id) ?? null; },
    async remove(id: string) { records.delete(id); },
  };
  const ports: ResultHistoryPorts = {
    repository,
    files: {
      async copyFrom(_source, id, name, durationMs) {
        order.push('durable-copy');
        const output = { name, relativePath: `${id}/${name}`, mimeType: 'video/mp4', sizeBytes: 123, durationMs };
        files.add(output.relativePath);
        return output;
      },
      uri: (path) => `file:///app/${path}`,
      async exists(path) { return files.has(path); },
      async delete(path) { files.delete(path); },
      async removeRecordFiles(id) {
        order.push(`remove-files:${id}`);
        for (const path of files) if (path.startsWith(`${id}/`)) files.delete(path);
      },
    },
    now: () => 1234,
  };
  return { ports, records, files, order };
}

function record(id: string, status: HistoryRecord['status'], path: string | null): HistoryRecord {
  return {
    id,
    operation: 'conversion',
    sourceName: 'source.mp4',
    sourceMimeType: 'video/mp4',
    sourceSizeBytes: 500,
    presetId: 'mp4',
    status,
    startedAt: 1000,
    completedAt: status === 'completed' ? 1100 : null,
    failureMessage: null,
    outputName: path === null ? null : 'output.mp4',
    outputRelativePath: path,
    outputMimeType: path === null ? null : 'video/mp4',
    outputSizeBytes: path === null ? null : 123,
    durationMs: path === null ? null : 3000,
  };
}

describe('persistent result history', () => {
  it('copies to durable storage before committing a completed database row', async () => {
    const harness = createHarness([record('r1', 'converting', null)]);
    await expect(completeHistoryRecord(harness.ports, 'r1', '/cache/output.mp4', 'output.mp4', 3000))
      .resolves.toMatchObject({ status: 'completed', outputRelativePath: 'r1/output.mp4' });
    expect(harness.order).toEqual(['durable-copy', 'database-complete']);
  });

  it('does not claim success when the durable copy fails', async () => {
    const harness = createHarness([record('r1', 'converting', null)]);
    vi.spyOn(harness.ports.files, 'copyFrom').mockRejectedValue(new Error('disk full'));
    await expect(completeHistoryRecord(harness.ports, 'r1', '/cache/output.mp4', 'output.mp4', null))
      .rejects.toThrow('disk full');
    expect(harness.records.get('r1')?.status).toBe('converting');
    expect(harness.order).toEqual([]);
  });

  it('passes the active cancellation signal to the durable copy boundary', async () => {
    const harness = createHarness([record('r1', 'converting', null)]);
    const signal = { cancelled: true };
    const copy = vi.spyOn(harness.ports.files, 'copyFrom');
    await expect(completeHistoryRecord(harness.ports, 'r1', '/cache/output.mp4', 'output.mp4', null, signal))
      .resolves.toMatchObject({ status: 'completed' });
    expect(copy).toHaveBeenCalledWith('/cache/output.mp4', 'r1', 'output.mp4', null, signal);
  });

  it('removes a newly copied file if its history commit fails', async () => {
    const harness = createHarness([record('r1', 'converting', null)]);
    vi.spyOn(harness.ports.repository, 'complete').mockRejectedValue(new Error('database locked'));
    await expect(completeHistoryRecord(harness.ports, 'r1', '/cache/output.mp4', 'output.mp4', null))
      .rejects.toThrow('database locked');
    expect(harness.files.size).toBe(0);
    expect(harness.order).toContain('remove-files:r1');
  });

  it('marks interrupted work and missing completed outputs without touching other files', async () => {
    const missing = record('missing', 'completed', 'missing/output.mp4');
    const interrupted = record('interrupted', 'converting', null);
    const intact = record('intact', 'completed', 'intact/output.mp4');
    const harness = createHarness([missing, interrupted, intact]);
    harness.files.delete('missing/output.mp4');
    const recovered = await recoverResultHistory(harness.ports);
    expect(recovered.find((item) => item.id === 'interrupted')?.status).toBe('interrupted');
    expect(recovered.find((item) => item.id === 'missing')?.status).toBe('missing');
    expect(harness.files.has('intact/output.mp4')).toBe(true);
  });

  it('leaves a conversion marked active if its partial-file cleanup fails so recovery can retry', async () => {
    const harness = createHarness([record('interrupted', 'converting', null)]);
    vi.spyOn(harness.ports.files, 'removeRecordFiles').mockRejectedValue(new Error('storage busy'));
    await expect(recoverResultHistory(harness.ports)).rejects.toThrow('storage busy');
    expect(harness.records.get('interrupted')?.status).toBe('converting');
  });

  it('keeps a missing history row after deleting only its output', async () => {
    const harness = createHarness([record('r1', 'completed', 'r1/output.mp4')]);
    await deleteHistoryOutput(harness.ports, 'r1');
    expect(harness.records.get('r1')?.status).toBe('missing');
    expect(harness.files.size).toBe(0);
  });

  it('removes one entry and its output together', async () => {
    const harness = createHarness([record('r1', 'completed', 'r1/output.mp4')]);
    await removeHistoryRecord(harness.ports, 'r1');
    expect(harness.records.has('r1')).toBe(false);
    expect(harness.files.size).toBe(0);
  });

  it('clears independent records but retains entries whose file cleanup fails', async () => {
    const harness = createHarness([
      record('good', 'completed', 'good/output.mp4'),
      record('bad', 'completed', 'bad/output.mp4'),
    ]);
    vi.spyOn(harness.ports.files, 'removeRecordFiles').mockImplementation(async (id) => {
      if (id === 'bad') throw new Error('permission denied');
    });
    await expect(clearHistoryAndOutputs(harness.ports)).resolves.toEqual(['bad']);
    expect(harness.records.has('good')).toBe(false);
    expect(harness.records.has('bad')).toBe(true);
  });
});
