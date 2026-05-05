import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const ThemeContext = createContext();

const THEME_STORAGE_KEY = 'chatbot-theme';

const lightTheme = {
  '--bg-color': '#ffffff',
  '--text-color': '#1a1a2e',
  '--primary-color': '#6c63ff',
  '--secondary-bg': '#f0f0f5',
  '--border-color': '#e0e0e0',
  '--card-bg': '#ffffff',
  '--input-bg': '#f8f8ff',
  '--shadow': '0 2px 8px rgba(0,0,0,0.1)',
};

const darkTheme = {
  '--bg-color': '#1a1a2e',
  '--text-color': '#e0e0e0',
  '--primary-color': '#9d95ff',
  '--secondary-bg': '#16213e',
  '--border-color': '#2a2a4a',
  '--card-bg': '#0f3460',
  '--input-bg': '#1a1a3e',
  '--shadow': '0 2px 8px rgba(0,0,0,0.3)',
};

const applyTheme = (theme) => {
  const themeVariables = theme === 'light' ? lightTheme : darkTheme;
  Object.entries(themeVariables).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'light';
    } catch {
      return 'light';
    }
  });

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, []);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const value = React.useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;