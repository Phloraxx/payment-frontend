import { BrowserRouter, Navigate, Route, Routes } from 'react-router';

import { HomePage } from './pages/HomePage';
import { PaymentPage } from './pages/PaymentPage';
import { RazorpayTestPage } from './pages/RazorpayTestPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/pay/:id" element={<PaymentPage />} />
        <Route path="/razorpay-test/:id" element={<RazorpayTestPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
