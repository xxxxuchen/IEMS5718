import { createContext, useState, useEffect, useContext } from "react";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState("");

  const fetchCsrfToken = async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      setCsrfToken(data.csrfToken);
    } catch (err) {
      console.error("Failed to fetch CSRF token:", err);
    }
  };

  const checkUserStatus = async () => {
    try {
      const res = await fetch("/api/user", { credentials: "include" });
      const data = await res.json();
      if (data.loggedIn) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Failed to check user status:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCsrfToken();
    checkUserStatus();
  }, []);

  const login = async (email, password) => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (res.ok) {
      setUser(data.user);
      return { success: true };
    }
    return { success: false, error: data.error };
  };

  const register = async (email, password, confirmPassword) => {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
      body: JSON.stringify({ email, password, confirmPassword }),
    });
    const data = await res.json();
    if (res.ok) {
      return { success: true };
    }
    return { success: false, error: data.error };
  };

  const logout = async () => {
    const res = await fetch("/api/logout", {
      method: "POST",
      headers: {
        "x-csrf-token": csrfToken,
      },
      credentials: "include",
    });
    if (res.ok) {
      setUser(null);
      return { success: true };
    }
    return { success: false };
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, csrfToken, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
