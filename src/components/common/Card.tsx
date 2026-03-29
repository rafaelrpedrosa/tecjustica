// src/components/common/Card.tsx
import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={`overflow-hidden rounded-2xl border border-border bg-surface shadow-sm ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  )
)

Card.displayName = 'Card'

export default Card

export const CardHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`border-b border-border-subtle px-5 py-4 ${className || ''}`}>
    {children}
  </div>
)

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`px-5 py-5 ${className || ''}`}>{children}</div>

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={`border-t border-border-subtle bg-bg px-5 py-4 ${className || ''}`}>
    {children}
  </div>
)
