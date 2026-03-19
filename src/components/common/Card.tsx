import React from 'react'

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className || ''}`}
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
  <div className={`px-6 py-4 border-b border-gray-200 ${className || ''}`}>{children}</div>
)

export const CardContent: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`px-6 py-4 ${className || ''}`}>{children}</div>

export const CardFooter: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => <div className={`px-6 py-4 border-t border-gray-200 bg-gray-50 ${className || ''}`}>{children}</div>
