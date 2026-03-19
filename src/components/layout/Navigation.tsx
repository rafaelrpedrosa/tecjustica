import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const Navigation: React.FC = () => {
  const location = useLocation()

  const isActive = (path: string) => location.pathname === path

  return (
    <nav className="bg-gray-50 border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-8">
          <Link
            to="/"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              isActive('/')
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            Buscar Processo
          </Link>
          <Link
            to="/precedents"
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              isActive('/precedents')
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            Precedentes
          </Link>
        </div>
      </div>
    </nav>
  )
}

export default Navigation
