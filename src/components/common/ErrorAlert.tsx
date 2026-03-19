interface ErrorAlertProps {
  message: string | null
}

export function ErrorAlert({ message }: ErrorAlertProps) {
  if (!message) return null
  return (
    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
      {message}
    </div>
  )
}
