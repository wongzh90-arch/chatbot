import React from 'react';

/**
 * ToggleSwitch - a reusable component that displays the current theme state
 * and toggles it via the provided callback.
 *
 * @param {Object} props
 * @param {boolean} props.isDarkMode - current theme state
 * @param {Function} props.toggleTheme - callback to toggle theme
 */
const ToggleSwitch = ({ isDarkMode, toggleTheme }) => {
  const containerStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontFamily: 'Arial, sans-serif',
    fontSize: '14px',
  };

  const labelStyle = {
    cursor: 'pointer',
    userSelect: 'none',
  };

  const switchStyle = {
    position: 'relative',
    display: 'inline-block',
    width: '50px',
    height: '26px',
    cursor: 'pointer',
  };

  const inputStyle = {
    opacity: 0,
    width: 0,
    height: 0,
  };

  const sliderBackgroundStyle = (isDark) => ({
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: isDark ? '#4caf50' : '#ccc',
    borderRadius: '26px',
    transition: 'background-color 0.4s',
  });

  const sliderKnobStyle = (isDark) => ({
    position: 'absolute',
    content: '""',
    height: '20px',
    width: '20px',
    left: isDark ? '26px' : '4px',
    bottom: '3px',
    backgroundColor: 'white',
    borderRadius: '50%',
    transition: 'left 0.4s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  });

  return (
    <div style={containerStyle}>
      <span style={labelStyle}>
        {isDarkMode ? '🌙 Dark Mode' : '☀️ Light Mode'}
      </span>
      <label style={switchStyle}>
        <input
          type="checkbox"
          checked={isDarkMode}
          onChange={toggleTheme}
          style={inputStyle}
        />
        <span style={sliderBackgroundStyle(isDarkMode)} />
        <span style={sliderKnobStyle(isDarkMode)} />
      </label>
    </div>
  );
};

export default ToggleSwitch;