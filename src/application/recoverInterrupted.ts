export interface InterruptedRecoveryPorts {
  hasActiveMarker(): Promise<boolean>;
  removePartialOutputs(): Promise<void>;
  clearActiveMarker(): Promise<void>;
}

/** Removes cache outputs left by a process death before the next job can start. */
export async function recoverInterruptedJob(
  ports: InterruptedRecoveryPorts,
): Promise<boolean> {
  if (!(await ports.hasActiveMarker())) return false;
  await ports.removePartialOutputs();
  await ports.clearActiveMarker();
  return true;
}
