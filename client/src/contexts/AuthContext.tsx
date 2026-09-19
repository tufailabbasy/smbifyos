import React, { createContext, useContext, useState, useEffect } from "react";
import { API_BASE_URL } from "../lib/api";

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  plan: "free" | "pro" | "enterprise";
  billingStatus: string;
}

export interface TenantUsage {
  leads: number;
  activeCampaigns: number;
  scraperJobs: number;
}

interface AuthContextType {
  user: UserProfile | null;
  tenant: TenantInfo | null;
  usage: TenantUsage | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, organizationName: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  upgradePlan: (plan: "free" | "pro" | "enterprise") => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [usage, setUsage] = useState<TenantUsage | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("smbify_lead_auth_token"));
  const [loading, setLoading] = useState<boolean>(true);

  const fetchProfile = async (currentToken: string) => {
    try {
      const res = await window.fetch(`${API_BASE_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setTenant(data.tenant);
        setUsage(data.usage);
      } else if (res.status === 401 || res.status === 404) {
        // Token invalid, expired, or user account no longer exists in database
        logout();
      }
    } catch (err) {
      console.error("Failed to load user profile", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchProfile(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string) => {
    const res = await window.fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to log in");
    }

    const data = await res.json();
    localStorage.setItem("smbify_lead_auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    // Reload profile to get proper usage stats
    await fetchProfile(data.token);
  };

  const signup = async (email: string, password: string, name: string, organizationName: string) => {
    const res = await window.fetch(`${API_BASE_URL}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, organizationName }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to sign up");
    }

    const data = await res.json();
    localStorage.setItem("smbify_lead_auth_token", data.token);
    setToken(data.token);
    setUser(data.user);
    setTenant(data.tenant);
    await fetchProfile(data.token);
  };

  const logout = () => {
    localStorage.removeItem("smbify_lead_auth_token");
    setToken(null);
    setUser(null);
    setTenant(null);
    setUsage(null);
  };

  const refreshProfile = async () => {
    if (token) {
      await fetchProfile(token);
    }
  };

  const upgradePlan = async (plan: "free" | "pro" | "enterprise") => {
    const activeToken = token || localStorage.getItem("smbify_lead_auth_token") || "";
    const res = await window.fetch(`${API_BASE_URL}/api/auth/upgrade`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${activeToken}`,
      },
      body: JSON.stringify({ plan }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || "Failed to upgrade plan");
    }

    await refreshProfile();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        usage,
        token,
        loading,
        login,
        signup,
        logout,
        refreshProfile,
        upgradePlan,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
