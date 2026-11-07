export interface InterruptedRecoveryPorts {
  hasActiveMarker(): Promise<boolean>;
  removePartialOutputs(): Promise<boolean>;
  clearActiveMarker(): Promise<void>;
}

export interface InterruptedRecoveryResult {
  readonly interrupted: boolean;
  readonly cleanedPartialFiles: boolean;
}

/** Cleans only a job directory identified by the app-owned marker. */
export async function recoverInterruptedJob(
  ports: InterruptedRecoveryPorts,
): Promise<InterruptedRecoveryResult> {
  if (!(await ports.hasActiveMarker())) {
    return { interrupted: false, cleanedPartialFiles: false };
  }
  const cleanedPartialFiles = await ports.removePartialOutputs();
  await ports.clearActiveMarker();
  return { interrupted: true, cleanedPartialFiles };
}
