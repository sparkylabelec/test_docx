
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Global variable to keep track of the root to prevent double initialization
// which can lead to Shadow DOM host conflicts with some browser extensions.
const globalObject = window as any;

if (!globalObject.__VISION_CHAT_ROOT__) {
  const root = ReactDOM.createRoot(rootElement);
  globalObject.__VISION_CHAT_ROOT__ = root;
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
