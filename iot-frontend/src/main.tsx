import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import 'antd/dist/reset.css';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { USE_MOCK } from './config';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 3000, refetchOnWindowFocus: false } },
});

// Dữ liệu giả: bật bộ giả lập telemetry 5 giây/lần
if (USE_MOCK) {
  import('./mock/server').then((m) => m.startMockSimulator());
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={viVN}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>,
);
