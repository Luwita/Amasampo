import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import { useStore } from '../context/StoreContext';

// Recent searches with every page loaded so far. Going back to a list shows it at once, as long as it was,
// so the scroll position can be restored; after two minutes it is fetched again.
const FRESH_MS = 2 * 60 * 1000;
const recent = new Map();
const recall = (cacheKey) => {
  if (process.env.NODE_ENV === 'test') return null; // each test starts from its own data
  const hit = recent.get(cacheKey);
  return hit && Date.now() - hit.at < FRESH_MS ? hit.state : null;
};
const keep = (cacheKey, state) => {
  recent.delete(cacheKey);
  recent.set(cacheKey, { at: Date.now(), state });
  if (recent.size > 30) recent.delete(recent.keys().next().value);
};

// Fetches one search from the API, with "load more" paging.
// `params` are the API filters (q, cat, prov, town, shop, sort, limit…); pass null to skip fetching.
export function useProductSearch(params) {
  const { remember, catalogVersion } = useStore();
  const key = params ? JSON.stringify(params) : null;
  const cacheKey = `${catalogVersion}|${key}`;
  const [state, setState] = useState(
    () => recall(cacheKey) ?? { items: [], total: 0, page: 1, loading: !!params, error: null },
  );

  useEffect(() => {
    if (!key) return undefined;
    const cached = recall(cacheKey);
    if (cached) {
      setState(cached);
      return undefined;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .searchProducts({ ...JSON.parse(key), page: 1 })
      .then((res) => {
        if (cancelled) return;
        remember(res.items);
        const next = { items: res.items, total: res.total, page: 1, loading: false, error: null };
        keep(cacheKey, next);
        setState(next);
      })
      .catch((err) => !cancelled && setState((s) => ({ ...s, loading: false, error: err.message })));
    return () => {
      cancelled = true;
    };
  }, [key, cacheKey, remember]);

  const loadMore = useCallback(async () => {
    const next = state.page + 1;
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await api.searchProducts({ ...JSON.parse(key), page: next });
      remember(res.items);
      setState((s) => {
        const grown = { ...s, items: [...s.items, ...res.items], total: res.total, page: next, loading: false };
        keep(cacheKey, grown);
        return grown;
      });
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, [key, cacheKey, state.page, remember]);

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
