import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import TeacherPanel from './pages/TeacherPanel';
import Preview from './pages/Preview';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/teacher" element={<TeacherPanel />} />
        <Route path="/preview" element={<Preview />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
