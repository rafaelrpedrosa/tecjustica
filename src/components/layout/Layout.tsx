import React from 'react'
import { Outlet } from 'react-router-dom'
import Navigation from './Navigation'

const Layout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-bg">
      <Navigation />
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
