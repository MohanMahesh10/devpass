import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import Register from './pages/Register';
import Confirmed from './pages/Confirmed';
import Admin from './pages/Admin';
import Scan from './pages/Scan';

export default function App() {
  return (
    <ToastProvider>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/register" replace />} />
        <Route path="/register" element={<Register />} />
        <Route path="/confirmed" element={<Confirmed />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/scan" element={<Scan />} />
        <Route path="*" element={<Navigate to="/register" replace />} />
      </Routes>
    </ToastProvider>
  );
}
