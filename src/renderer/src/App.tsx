import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { HomeRoute } from './routes/home';
import { MeetingRoute } from './routes/meeting';
import { SettingsRoute } from './routes/settings';
import { TemplatesRoute } from './routes/templates';
import { OnboardingRoute } from './routes/onboarding';

export default function App() {
  return (
    <Routes>
      <Route path="/welcome" element={<OnboardingRoute />} />
      <Route
        path="*"
        element={
          <FirstRunGate>
            <Shell>
              <Routes>
                <Route path="/" element={<Navigate to="/home" replace />} />
                <Route path="/home" element={<HomeRoute />} />
                <Route path="/meeting/:id" element={<MeetingRoute />} />
                <Route path="/settings" element={<SettingsRoute />} />
                <Route path="/templates" element={<TemplatesRoute />} />
              </Routes>
            </Shell>
          </FirstRunGate>
        }
      />
    </Routes>
  );
}

function FirstRunGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const skipped =
        typeof sessionStorage !== 'undefined' &&
        sessionStorage.getItem('quill.onboarded') === '1';
      const has = await window.quill.keys.has('openai');
      if (alive && !has && !skipped && location.pathname !== '/welcome') {
        nav('/welcome', { replace: true });
      }
      if (alive) setChecked(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!checked) return null;
  return <>{children}</>;
}
