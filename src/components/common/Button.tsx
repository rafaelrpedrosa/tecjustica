// src/components/common/Button.tsx
import React from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variantClasses: Record<Variant, string> = {
  primary: 'bg-primary text-white shadow-sm hover:bg-primary-dark hover:shadow',
  secondary: 'border border-border bg-primary-light text-primary hover:bg-[#e4ecf5] hover:border-[#c9d8ea]',
  ghost: 'border border-border bg-surface text-text-base hover:bg-bg',
  danger: 'bg-danger text-white shadow-sm hover:bg-red-700 hover:shadow',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={`${sizeClasses[size]} ${variantClasses[variant]} inline-flex items-center justify-center rounded-lg font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${className || ''}`}
      {...props}
    />
  )
)

Button.displayName = 'Button'

export default Button
