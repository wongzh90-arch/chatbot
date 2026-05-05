import React from 'react';
import { ThemeProvider } from './context/ThemeContext';
import ToggleSwitch from './components/ToggleSwitch';

function App() {
  return (
    <ThemeProvider>
      <div className="App">
        <header className="App-header">
          <h1>Chatbot</h1>
          <ToggleSwitch />
        </header>
        {/* Other app content goes here */}
      </div>
    </ThemeProvider>
  );
}

export default App;