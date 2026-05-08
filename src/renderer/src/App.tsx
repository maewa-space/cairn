import { Routes, Route, Navigate } from 'react-router-dom';
import { Shell } from './components/Shell';
import { HomeRoute } from './routes/home';
import { MeetingRoute } from './routes/meeting';
import { SettingsRoute } from './routes/settings';
import { TemplatesRoute } from './routes/templates';

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/home" element={<HomeRoute />} />
        <Route path="/meeting/:id" element={<MeetingRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/templates" element={<TemplatesRoute />} />
      </Routes>
    </Shell>
  );
}
