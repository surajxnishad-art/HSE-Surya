import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [boot, setBoot] = useState(null);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState(null);
  const metaRequested = useRef(false);

  const loadMeta = useCallback(async () => {
    const [modules, options] = await Promise.all([api.get('/meta/modules'), api.get('/meta/options')]);
    setMeta({ ...modules, options });
    metaRequested.current = true;
    return modules;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const bootData = await api.get('/auth/bootstrap');
      setBoot(bootData);
      setBootError(null);
      let me = null;
      try {
        const meData = await api.get('/auth/me');
        me = meData?.user || null;
      } catch (error) {
        if (!(error instanceof ApiError) || (error.status !== 401 && error.status !== 403)) throw error;
      }
      setUser(me);
      if (me) {
        await loadMeta().catch(() => {});
      }
      return me;
    } catch (error) {
      setBootError(error.message || 'Unable to reach the server.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [loadMeta]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username, password, remember) => {
      const data = await api.post('/auth/login', { username, password, remember });
      setUser(data.user);
      if (!metaRequested.current) await loadMeta().catch(() => {});
      setBoot((prev) => (prev ? { ...prev, authenticated: true } : prev));
      return data;
    },
    [loadMeta],
  );

  const register = useCallback(async (payload) => api.post('/auth/register', payload), []);

  const setup = useCallback(
    async (payload) => {
      const data = await api.post('/auth/setup', payload);
      setUser(data.user);
      await loadMeta().catch(() => {});
      setBoot((prev) => ({ ...(prev || {}), needsSetup: false, authenticated: true }));
      return data;
    },
    [loadMeta],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
      setMeta(null);
      metaRequested.current = false;
      setBoot((prev) => (prev ? { ...prev, authenticated: false } : prev));
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      boot,
      meta,
      loading,
      bootError,
      permissions: user?.permissions || {},
      login,
      register,
      setup,
      logout,
      refresh,
      loadMeta,
      setUser,
      can: (key) => Boolean(user?.permissions?.[key]),
      isAdmin: Boolean(user && ['super_admin', 'admin'].includes(user.role)),
      canWrite: Boolean(user && !user.permissions?.readOnly),
    }),
    [user, boot, meta, loading, bootError, login, register, setup, logout, refresh, loadMeta],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
