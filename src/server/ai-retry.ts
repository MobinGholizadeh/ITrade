// Only explicit upstream unavailability is retried. A reservation callback must
// succeed before a second billable request can begin.
export async function retryUnavailable<T>(
  request: () => Promise<T>,
  reserveRetry: () => Promise<void>,
  pause = () => new Promise<void>((r) => setTimeout(r, 1000)),
): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if ((error as { status?: unknown })?.status !== 503) throw error;
    await reserveRetry();
    await pause();
    return request();
  }
}
