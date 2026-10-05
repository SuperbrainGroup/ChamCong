import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Company } from '../types';
import { api } from '../api/client';

interface AuthContextType {
  user: User | null;
  companies: Company[];
  selectedCompany: Company | null;
  setSelectedCompany: (company: Company | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshCompanies: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(() => {
    const saved = localStorage.getItem('selectedCompany');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(true);

  const fetchCompanies = async () => {
    try {
      const res = await api.get<Company[]>('/companies');
      setCompanies(res.data);

      if (res.data.length > 0) {
        // Nếu chưa chọn hoặc công ty hiện tại không nằm trong danh sách mới
        if (!selectedCompany || !res.data.some(c => c.id === selectedCompany.id)) {
          setSelectedCompany(res.data[0]);
          localStorage.setItem('selectedCompany', JSON.stringify(res.data[0]));
        }
      } else {
        setSelectedCompany(null);
        localStorage.removeItem('selectedCompany');
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách hội sở:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
          localStorage.setItem('user', JSON.stringify(res.data));
          await fetchCompanies();
        } catch {
          logout();
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = (token: string, newUser: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(newUser));
    setUser(newUser);
    fetchCompanies();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('selectedCompany');
    setUser(null);
    setCompanies([]);
    setSelectedCompany(null);
  };

  const handleSetSelectedCompany = (c: Company | null) => {
    setSelectedCompany(c);
    if (c) {
      localStorage.setItem('selectedCompany', JSON.stringify(c));
    } else {
      localStorage.removeItem('selectedCompany');
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        companies,
        selectedCompany,
        setSelectedCompany: handleSetSelectedCompany,
        login,
        logout,
        refreshCompanies: fetchCompanies,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
