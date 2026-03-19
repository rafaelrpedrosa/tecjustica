import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Layout from '@/components/layout/Layout'
import Home from '@/pages/Home'
import ProcessDetail from '@/pages/ProcessDetail'
import DocumentViewer from '@/pages/DocumentViewer'
import PrecedentsPage from '@/pages/PrecedentsPage'
import SearchCPF from '@/pages/SearchCPF'
import NotFound from '@/pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="/process/:cnj" element={<ProcessDetail />} />
            <Route path="/document/:documentId" element={<DocumentViewer />} />
            <Route path="/precedents" element={<PrecedentsPage />} />
            <Route path="/search-cpf" element={<SearchCPF />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  )
}

export default App
