window.ThemeContext = React.createContext();

window.ThemeProvider = function ThemeProvider({ children }) {
  const [theme, setTheme] = React.useState(() =>
    localStorage.getItem('app_theme') || 'dark'
  );
  const toggleTheme = React.useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('app_theme', next);
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
  return React.useContext(window.ThemeContext);
};
