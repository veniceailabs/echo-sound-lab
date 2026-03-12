import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StudioEngineProvider } from './context/StudioEngineProvider';
import { ViewportProvider } from './context/ViewportContext';
import './i18n';
import '../index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioEngineProvider>
      <ViewportProvider>
        <App />
      </ViewportProvider>
    </StudioEngineProvider>
  </React.StrictMode>
);
