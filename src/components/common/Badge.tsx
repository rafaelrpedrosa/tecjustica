// src/components/common/Badge.tsx
import React from 'react'

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  children: React.ReactNode
}

const badgeVariants: Record<string, string> = {
  default: 'border border-border bg-bg text-text-base',
  success: 'border border-green-200 bg-green-50 text-success',
  warning: 'border border-amber-200 bg-amber-50 text-warning',
  danger: 'border border-red-200 bg-danger-bg text-danger',
  info: 'border border-blue-200 bg-primary-light text-primary',
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = 'default', className, children, ...props }, ref) => (
    <span
      ref={ref}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${badgeVariants[variant]} ${className || ''}`}
      {...props}
    >
      {children}
    </span>
  )
)

Badge.displayName = 'Badge'

export default Badge
