import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import { useStore } from '../context/StoreContext';

// Fetches one search from the API, with "load more" paging.
// `params` are the API filters (q, cat, prov, town, shop, sort, limit…); pass null to skip fetching.
export function useProductSearch(params) {
  const { remember, catalogVersion } = useStore();
  const key = params ? JSON.stringify(params) : null;
  const [state, setState] = useState({ items: [], total: 0, page: 1, loading: !!params, error: null });

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .searchProducts({ ...JSON.parse(key), page: 1 })
      .then((res) => {
        if (cancelled) return;
        remember(res.items);
        setState({ items: res.items, total: res.total, page: 1, loading: false, error: null });
      })
      .catch((err) => !cancelled && setState((s) => ({ ...s, loading: false, error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [key, catalogVersion, remember]);

  const loadMore = useCallback(async () => {
    const next = state.page + 1;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await api.searchProducts({ ...JSON.parse(key), page: next });
      remember(res.items);
      setState((s) => ({ ...s, items: [...s.items, ...res.items], total: res.total, page: next, loading: false }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [key, state.page, remember]);

  return { ...state, loadMore, hasMore: state.items.length < state.total };
}

// One product: from the cache when already seen, otherwise fetched. Pass a falsy id to skip.
export function useProduct(id) {
  const { getProduct, remember, catalogVersion } = useStore();
  const [status, setStatus] = useState(id && getProduct(id) ? 'ready' : 'loading');

  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    api
      .getProduct(id)
      .then((p) => {
        if (cancelled) return;
        remember([p]);
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('missing'));
    return () => {
      cancelled = true;
    };
  }, [id, catalogVersion, remember]);

  if (!id) return { product: null, status: 'missing' };
  return { product: getProduct(id), status: getProduct(id) ? 'ready' : status };
}
