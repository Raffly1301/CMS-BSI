
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log("BSI CMS: Initialize App...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("BSI CMS Error: Could not find root element to mount to");
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("BSI CMS: Render successful");
} catch (err) {
  console.error("BSI CMS Render Error:", err);
}
