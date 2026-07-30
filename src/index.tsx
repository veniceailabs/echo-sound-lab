import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { StudioEngineProvider } from './context/StudioEngineProvider';
import { ViewportProvider } from './context/ViewportContext';
import { UserTierProvider } from './context/UserTierContext';
import LandingPage from './components/LandingPage';
import PricingPage from './components/PricingPage';
import './i18n';
import '../index.css';

export type AppRoute = 'app' | 'pricing' | 'landing';

const Root: React.FC = () => {
  // Check if user has visited before to decide initial route
  const [route, setRoute] = useState<AppRoute>(() => {
    // If hash share link, go straight to app
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#share=')) {
      return 'app';
    }
    return 'app'; // default to app for returning users
  });

  const handleNavigate = (newRoute: AppRoute) => {
    setRoute(newRoute);
  };

  if (route === 'pricing') {
    return (
      <PricingPage onBack={() => handleNavigate('app')} />
    );
  }

  if (route === 'landing') {
    return (
      <LandingPage
        onEnterApp={() => handleNavigate('app')}
        onWatchDemo={() => handleNavigate('app')}
      />
    );
  }

  return (
    <App
      onNavigate={handleNavigate}
    />
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StudioEngineProvider>
      <ViewportProvider>
        <UserTierProvider>
          <Root />
        </UserTierProvider>
      </ViewportProvider>
    </StudioEngineProvider>
  </React.StrictMode>
);
