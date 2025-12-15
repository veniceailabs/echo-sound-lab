export type AsyncStatusSetter = (value: boolean) => void;
export type AsyncErrorSetter = (value: string | null) => void;

const DEFAULT_TIMEOUT_MS = 120000; 

interface SafeAsyncOptions {
  label?: string;
  timeoutMs?: number;
}

export async function runSafeAsync<T>(
  fn: () => Promise<T>,
  setLoading?: AsyncStatusSetter,
  setError?: AsyncErrorSetter,
  options: SafeAsyncOptions = {}
): Promise<T | null> {
  const { label = "Operation", timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  try {
    if (setLoading) setLoading(true);
    if (setError) setError(null);

    const timeoutPromise = new Promise<null>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`[Timeout] ${label} took longer than ${Math.ceil(timeoutMs / 1000)}s`));
      }, timeoutMs)
    );

    const result = await Promise.race([fn(), timeoutPromise]) as T;
    return result;
  } catch (err: any) {
    console.error(`${label} failed:`, err);
    if (setError) {
      setError(
        err?.message ||
        `${label} failed. Please try again or run System Check.`
      );
    }
    return null;
  } finally {
    if (setLoading) setLoading(false);
  }
}