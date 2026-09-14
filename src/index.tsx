import React from 'react';
import ReactDOM from 'react-dom/client';
import '@network/connection-supervisor';
import App from '@ui/App';
import RuntimeErrorBoundary from '@ui/RuntimeErrorBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RuntimeErrorBoundary>
      <App />
    </RuntimeErrorBoundary>
  </React.StrictMode>
);
