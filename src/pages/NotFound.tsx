import React from 'react'
import { Link } from 'react-router-dom'
import Button from '@/components/common/Button'

const NotFound: React.FC = () => {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-xl text-gray-600 mb-8">Página não encontrada</p>
        <Link to="/">
          <Button>← Voltar à Home</Button>
        </Link>
      </div>
    </div>
  )
}

export default NotFound
