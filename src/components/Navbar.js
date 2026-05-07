import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const Navbar = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <nav className="navbar">
      <div className="navbar-brand">Chatbot</div>
      <button 
        onClick={toggleTheme} 
        className="theme-toggle"
        aria-label="Toggle theme"
      >
        {theme === 'light' ? '🌙' : '☀️'}
      </button>
    </nav>
  );
};

export default Navbar;