/**
 * The two file facts that cross a layer boundary.
 *
 * They live in the domain because both the single-job state machine and the
 * queue describe files, and the domain must not import from the application
 * layer to borrow a shape. `src/application/convertJob.ts` re-exports them, so
 * existing call sites are unchanged.
 */

/** A file the picker copied into the app cache. */
export interface SourceFile {
  /** Plain filesystem path in the app cache; the picker already copied the file. */
  readonly path: string;
  /** Display name as the provider reported it. */
  readonly name: string;
  readonly sizeBytes: number | null;
  readonly mimeType: string | null;
}

/** A file the engine wrote into a job directory. */
export interface OutputFile {
  readonly name: string;
  readonly path: string;
}
