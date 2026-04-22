interface ValidationMessageProps {
  type: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export default function ValidationMessage({ 
  type, 
  message, 
  suggestion 
}: ValidationMessageProps) {
  const styles = {
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: '❌'
    },
    warning: {
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      text: 'text-yellow-800',
      icon: '⚠️'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      text: 'text-blue-800',
      icon: 'ℹ️'
    }
  };

  const style = styles[type];

  return (
    <div className={`${style.bg} border ${style.border} rounded-lg p-3 my-2`}>
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium ${style.text}`}>
            {message}
          </p>
          {suggestion && (
            <p className={`text-xs mt-1 ${style.text} opacity-90`}>
              💡 {suggestion}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}