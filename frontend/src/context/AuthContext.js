import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = checking
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.me();
      setUser(data);
    } catch {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (creds) => {
    const { data } = await api.login(creds);
    setUser(data.user);
    return data.user;
  };
  const register = async (creds) => {
    const { data } = await api.register(creds);
    setUser(data.user);
    return data.user;
  };
  const logout = async () => {
    try { await api.logout(); } catch {}
    setUser(false);
  };
  const patchUser = (partial) => setUser((u) => ({ ...u, ...partial }));

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh, patchUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
