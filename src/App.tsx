import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/ProtectedRoute'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import ProcessDetail from '@/pages/ProcessDetail'
import DocumentViewer from '@/pages/DocumentViewer'
import PrecedentsPage from '@/pages/PrecedentsPage'
import SearchCPF from '@/pages/SearchCPF'
import MeusProcessos from '@/pages/MeusProcessos'
import FilaDiligencias from '@/pages/FilaDiligencias'
import DashboardOperacional from '@/pages/DashboardOperacional'
import DashboardTempos from '@/pages/DashboardTempos'
import NotFound from '@/pages/NotFound'
import Login from '@/pages/Login'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10_000),
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="/process/:cnj" element={<ProcessDetail />} />
                <Route path="/document/:documentId" element={<DocumentViewer />} />
                <Route path="/precedents" element={<PrecedentsPage />} />
                <Route path="/search-cpf" element={<SearchCPF />} />
                <Route path="/meus-processos" element={<MeusProcessos />} />
                <Route path="/diligencias" element={<FilaDiligencias />} />
                <Route path="/dashboard-operacional" element={<DashboardOperacional />} />
                <Route path="/dashboard-tempos" element={<DashboardTempos />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
