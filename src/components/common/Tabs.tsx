import React, { useEffect, useState } from 'react'

interface TabItem {
  label: React.ReactNode
  value: string
  content?: React.ReactNode
}

interface TabsProps {
  items: TabItem[]
  defaultValue?: string
  onChange?: (value: string) => void
}

const Tabs: React.FC<TabsProps> = ({ items, defaultValue, onChange }) => {
  const [activeTab, setActiveTab] = useState(defaultValue || items?.[0]?.value || '')

  useEffect(() => {
    if (defaultValue) {
      setActiveTab(defaultValue)
    }
  }, [defaultValue])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    onChange?.(value)
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto border-b border-gray-200">
        <div className="flex min-w-max gap-2 px-5 py-3">
          {items.map(item => (
            <button
              key={item.value}
              onClick={() => handleTabChange(item.value)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === item.value
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="pt-4">
        {items.find(item => item.value === activeTab)?.content}
      </div>
    </div>
  )
}

export default Tabs
