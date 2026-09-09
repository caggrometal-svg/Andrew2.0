import React from 'react';
import ReactDOM from 'react-dom/client';
import EditorApp from '@editor/EditorApp';
import '@editor/editor.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode><EditorApp /></React.StrictMode>
);
