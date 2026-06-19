import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';

interface State<T> {
  data: T | null;
  loading: boolean;
  error: string;
}

interface Options {
  /** Poll interval in ms. When set, the request re-runs on a timer (realtime). */
  intervalMs?: number;
}

/**
 * GET hook with manual refetch and optional polling. Background polls keep the
 * previous data on screen (no spinner flash) so the UI updates smoothly.
 */
export function useFetch<T>(url: string, deps: unknown[] = [], options: Options = {}) {
  const [state, setState] = useState<State<T>>({ data: null, loading: true, error: '' });
  const hasData = useRef(false);

  const refetch = useCallback(async () => {
    // Only show the full-page loading state on the very first load.
    setState((s) => ({ ...s, loading: !hasData.current, error: '' }));
    try {
      const res = await api.get<T>(url);
      hasData.current = true;
      setState({ data: res.data, loading: false, error: '' });
    } catch (err) {
      setState((s) => ({ data: s.data, loading: false, error: errorMessage(err) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    refetch();
    if (!options.intervalMs) return;
    const id = setInterval(refetch, options.intervalMs);
    return () => clearInterval(id);
  }, [refetch, options.intervalMs]);

  return { ...state, refetch };
}
