import React from 'react'

interface JusFlowLogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'full' | 'mark'
}

const SIZES = {
  sm: { mark: 28, wordmarkText: 'text-lg', tagText: 'text-xs' },
  md: { mark: 36, wordmarkText: 'text-2xl', tagText: 'text-sm' },
  lg: { mark: 52, wordmarkText: 'text-4xl', tagText: 'text-base' },
}

const LogoMark: React.FC<{ size: number }> = ({ size }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    {/* Badge background */}
    <rect width="48" height="48" rx="12" fill="#0C1B33" />

    {/* Fulcrum top pin */}
    <circle cx="24" cy="11" r="2" fill="#F59E0B" />

    {/* Central vertical stem */}
    <line x1="24" y1="11" x2="24" y2="30" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />

    {/* Scale beam — slightly tilted for dynamism */}
    <line x1="9" y1="19" x2="39" y2="17" stroke="#F59E0B" strokeWidth="1.8" strokeLinecap="round" />

    {/* Left pan chain */}
    <line x1="11" y1="19" x2="11" y2="24" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    {/* Left pan arc */}
    <path d="M7.5 24 Q11 26.5 14.5 24" stroke="#F59E0B" strokeWidth="1.8" fill="none" strokeLinecap="round" />

    {/* Right pan chain */}
    <line x1="37" y1="17" x2="37" y2="21" stroke="#F59E0B" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
    {/* Right pan arc */}
    <path d="M33.5 21 Q37 23.5 40.5 21" stroke="#F59E0B" strokeWidth="1.8" fill="none" strokeLinecap="round" />

    {/* Flow wave at bottom — teal accent */}
    <path
      d="M8 36 Q11.5 32.5 15 36 Q18.5 39.5 22 36 Q25.5 32.5 29 36 Q32.5 39.5 36 36 Q38.5 33.5 40 35"
      stroke="#22D3EE"
      strokeWidth="1.8"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

const JusFlowLogo: React.FC<JusFlowLogoProps> = ({ size = 'md', variant = 'full' }) => {
  const s = SIZES[size]

  if (variant === 'mark') return <LogoMark size={s.mark} />

  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={s.mark} />
      <div className="flex flex-col leading-none">
        <span
          className={`${s.wordmarkText} font-black tracking-tight text-[#0C1B33] leading-none`}
          style={{ fontFamily: "'Georgia', 'Cambria', serif" }}
        >
          Jus<span className="text-[#F59E0B]">Flow</span>
        </span>
        {size !== 'sm' && (
          <span className={`${s.tagText} text-gray-400 tracking-widest uppercase font-medium mt-0.5`}>
            Gestão Processual
          </span>
        )}
      </div>
    </div>
  )
}

export default JusFlowLogo
