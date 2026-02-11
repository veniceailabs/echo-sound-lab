import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeSignatureProvider } from '../action-authority/src/action-authority/audit/SignatureProvider';
import App from './App';
import '../index.css';

initializeSignatureProvider();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
