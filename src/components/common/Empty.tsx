import React from 'react'

interface EmptyProps {
  title: string
  description?: string
  icon?: React.ReactNode
  action?: {
    label: string
    onClick: () => void
  }
}

const Empty: React.FC<EmptyProps> = ({ title, description, icon, action }) => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    {icon && <div className="text-4xl mb-4">{icon}</div>}
    <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    {description && <p className="text-gray-600 text-center max-w-md mb-6">{description}</p>}
    {action && (
      <button
        onClick={action.onClick}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
      >
        {action.label}
      </button>
    )}
  </div>
)

export default Empty
