// js/utils/themeContext.js
// Provides React ThemeContext, ThemeProvider, and useTheme globally.

window.ThemeContext = React.createContext();

window.ThemeProvider = function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(() => {
    try {
      return localStorage.getItem('app_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = React.useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('app_theme', next); } catch {}
      return next;
    });
  }, []);

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, toggleTheme } },
    children
  );
};

window.useTheme = function() {
  const context = React.useContext(window.ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
