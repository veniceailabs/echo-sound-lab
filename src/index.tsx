import React from 'react';
import ReactDOM from 'react-dom/client';
import { initializeSignatureProvider } from '../action-authority/src/action-authority/audit/SignatureProvider';
import App from './App';
import { ViewportProvider } from './context/ViewportContext';
import { I18nProvider } from './context/I18nContext';
import '../index.css';

initializeSignatureProvider();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ViewportProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ViewportProvider>
  </React.StrictMode>
);
