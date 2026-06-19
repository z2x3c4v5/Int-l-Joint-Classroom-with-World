import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Preview from './pages/Preview';
import './styles.css';

// App and TeacherPanel pull in Firebase at module load, which throws if the
// Firebase env vars are missing. Lazy-load them so the static /preview route
// (no Firebase) renders even before the backend is configured.
const App = lazy(() => import('./App'));
const TeacherPanel = lazy(() => import('./pages/TeacherPanel'));

function Loading() {
  return (
    <div className="h-screen flex items-center justify-center bg-slate-900 text-slate-400 text-sm">
      Loading…
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/teacher" element={<TeacherPanel />} />
          <Route path="/preview" element={<Preview />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </React.StrictMode>,
);
