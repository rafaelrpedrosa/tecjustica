import React from 'react'

interface LoadingProps {
  text?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
}

export const Spinner: React.FC<LoadingProps> = ({ text, size = 'md' }) => (
  <div className="flex flex-col items-center justify-center gap-4">
    <div className={`${sizeClasses[size]} border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin`} />
    {text && <p className="text-gray-600 font-medium">{text}</p>}
  </div>
)

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`bg-gray-200 animate-pulse rounded ${className || 'h-4 w-full'}`} />
)

export const PageLoading: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Spinner text="Carregando..." size="lg" />
  </div>
)

export default Spinner
