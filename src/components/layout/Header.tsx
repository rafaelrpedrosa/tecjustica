import React from 'react'
import { Link } from 'react-router-dom'
import JusFlowLogo from '@/components/common/JusFlowLogo'

const Header: React.FC = () => {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <Link to="/" className="inline-flex">
          <JusFlowLogo size="md" variant="full" />
        </Link>
      </div>
    </header>
  )
}

export default Header
