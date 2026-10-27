/**
 * Engine adapter: the only file that imports `munim-ffmpeg`.
 *
 * Everything above this file works with the `ConversionPorts` interface, so the
 * pipeline is testable without a native module. This adapter holds the session
 * id, throttles statistics to the UI, and translates the engine's result shape
 * into the domain's `EngineOutcome` (TR-24).
 */

import {
  cancel,
  execute,
  getFFmpegVersion,
  getMediaInformation,
  listEncoders as engineListEncoders,
} from 'munim-ffmpeg';

import type { ConversionPorts, ConvertRequest, ProbeOutcome } from '../application/runConversion';
import type { EngineOutcome } from '../domain/errors';
import { createJobFilePorts } from './jobFiles';

/** Two statistics per second at most, so the bridge never floods the UI thread. */
export const STATISTICS_INTERVAL_MS = 500;

let activeSessionId: number | null = null;

function toOutcome(result: {
  success: boolean;
  cancelled: boolean;
  returnCode: number;
  output: string;
}): EngineOutcome {
  return {
    success: result.success,
    cancelled: result.cancelled,
    returnCode: result.returnCode,
    output: result.output,
  };
}

async function probe(path: string): Promise<ProbeOutcome> {
  try {
    const information = await getMediaInformation(path);
    return {
      ok: true,
      information,
      outcome: { success: true, cancelled: false, returnCode: 0, output: '' },
    };
  } catch (error) {
    return {
      ok: false,
      outcome: {
        success: false,
        cancelled: false,
        returnCode: -1,
        output: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function convert(request: ConvertRequest): Promise<EngineOutcome> {
  let lastEmit = 0;

  const result = await execute(
    [...request.argv],
    undefined,
    (timeMs: number) => {
      const now = Date.now();
      if (now - lastEmit < STATISTICS_INTERVAL_MS) {
        return;
      }
      lastEmit = now;
      request.onProgress(timeMs);
    },
    (sessionId: number) => {
      activeSessionId = sessionId;
      request.onSession(sessionId);
    },
  );

  activeSessionId = null;
  return toOutcome(result);
}

/** Asks the engine to stop the session this adapter last started. */
export function cancelActiveConversion(): void {
  if (activeSessionId !== null) {
    cancel(activeSessionId);
  }
}

/** Bundled FFmpeg version, for the smoke call in the phase report. */
export function ffmpegVersion(): string {
  return getFFmpegVersion();
}

/** The ports object the application layer receives in the running app. */
export const enginePorts: ConversionPorts = {
  probe,
  listEncoders: () => engineListEncoders(),
  convert,
  ...createJobFilePorts(),
};
