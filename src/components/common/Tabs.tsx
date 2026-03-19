import React, { useState } from 'react'

interface TabItem {
  label: string
  value: string
  content: React.ReactNode
}

interface TabsProps {
  items: TabItem[]
  defaultValue?: string
  onChange?: (value: string) => void
}

const Tabs: React.FC<TabsProps> = ({ items, defaultValue, onChange }) => {
  const [activeTab, setActiveTab] = useState(defaultValue || items?.[0]?.value || '')

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    onChange?.(value)
  }

  return (
    <div className="w-full">
      <div className="border-b border-gray-200 flex gap-0">
        {items.map((item) => (
          <button
            key={item.value}
            onClick={() => handleTabChange(item.value)}
            className={`px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
              activeTab === item.value
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {items.find((item) => item.value === activeTab)?.content}
      </div>
    </div>
  )
}

export default Tabs
