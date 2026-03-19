import React from 'react'
import { Link } from 'react-router-dom'

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">
            ⚖
          </div>
          <h1 className="text-2xl font-bold text-gray-900">RPAtec</h1>
          <span className="text-sm text-gray-600 ml-2">Sistema de Processos Judiciais</span>
        </Link>
      </div>
    </header>
  )
}

export default Header
