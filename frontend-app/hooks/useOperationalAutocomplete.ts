import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type AutocompleteStatus = 'idle' | 'debouncing' | 'loading' | 'success' | 'error';

type AutocompleteSearch<T> = (query: string, signal: AbortSignal) => Promise<T[]>;

type AutocompleteState<T> = {
  status: AutocompleteStatus;
  query: string;
  results: T[];
  error: Error | null;
  requestId: number;
};

type AutocompleteOptions<T> = {
  query: string;
  enabled?: boolean;
  minQueryLength?: number;
  debounceMs?: number;
  timeoutMs?: number;
  search: AutocompleteSearch<T>;
};

const DEFAULT_DEBOUNCE_MS = 220;
const DEFAULT_TIMEOUT_MS = 12_000;

export function useOperationalAutocomplete<T>({
  query,
  enabled = true,
  minQueryLength = 2,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  search,
}: AutocompleteOptions<T>) {
  const normalizedQuery = useMemo(() => query.trim(), [query]);
  const [retryNonce, setRetryNonce] = useState(0);
  const sequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const [state, setState] = useState<AutocompleteState<T>>({
    status: 'idle',
    query: normalizedQuery,
    results: [],
    error: null,
    requestId: 0,
  });

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      sequenceRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const ready = enabled && normalizedQuery.length >= minQueryLength;
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;

    if (!ready) {
      setState({
        status: 'idle',
        query: normalizedQuery,
        results: [],
        error: null,
        requestId: sequence,
      });
      return undefined;
    }

    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let didTimeout = false;

    setState({
      status: 'debouncing',
      query: normalizedQuery,
      results: [],
      error: null,
      requestId: sequence,
    });

    const debounceId = setTimeout(() => {
      if (!mountedRef.current || sequenceRef.current !== sequence || controller.signal.aborted) {
        return;
      }

      setState({
        status: 'loading',
        query: normalizedQuery,
        results: [],
        error: null,
        requestId: sequence,
      });

      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, timeoutMs);

      search(normalizedQuery, controller.signal)
        .then((results) => {
          if (!mountedRef.current || sequenceRef.current !== sequence || controller.signal.aborted) {
            return;
          }

          setState({
            status: 'success',
            query: normalizedQuery,
            results,
            error: null,
            requestId: sequence,
          });
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || sequenceRef.current !== sequence) {
            return;
          }

          if (controller.signal.aborted && !didTimeout) {
            return;
          }

          setState({
            status: 'error',
            query: normalizedQuery,
            results: [],
            error: normalizeSearchError(error, didTimeout),
            requestId: sequence,
          });
        })
        .finally(() => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        });
    }, debounceMs);

    return () => {
      clearTimeout(debounceId);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      controller.abort();
    };
  }, [debounceMs, enabled, minQueryLength, normalizedQuery, retryNonce, search, timeoutMs]);

  const retry = useCallback(() => {
    setRetryNonce((value) => value + 1);
  }, []);

  return {
    ...state,
    ready: enabled && normalizedQuery.length >= minQueryLength,
    isSettling: state.status === 'debouncing',
    isLoading: state.status === 'debouncing' || state.status === 'loading',
    isError: state.status === 'error',
    retry,
  };
}

function normalizeSearchError(error: unknown, timedOut: boolean) {
  if (timedOut) {
    return new Error('Search timed out. Retry shortly.');
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unable to load results.');
}
