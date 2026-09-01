import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { HomePage } from './pages/HomePage';
import { PaymentPage } from './pages/PaymentPage';
import { RazorpayLivePage } from './pages/RazorpayLivePage';
import { RazorpayLivePilotPage } from './pages/RazorpayLivePilotPage';
import { RazorpayTestPage } from './pages/RazorpayTestPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pay/:id" element={<PaymentPage />} />
        <Route path="/razorpay-test/:id" element={<RazorpayTestPage />} />
        <Route path="/razorpay-live" element={<RazorpayLivePilotPage />} />
        <Route path="/razorpay-live/:id" element={<RazorpayLivePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
