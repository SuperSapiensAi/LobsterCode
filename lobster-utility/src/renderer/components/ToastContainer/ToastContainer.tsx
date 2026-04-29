import React from 'react';
import { useStore } from '../../store';
import type { Toast } from '../../store';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

const iconMap = {
  success: <CheckCircle size={16} className="text-status-green flex-shrink-0" />,
  error: <AlertTriangle size={16} className="text-status-red flex-shrink-0" />,
  info: <Info size={16} className="text-ocean flex-shrink-0" />,
};

const bgMap = {
  success: 'bg-green-50 border-green-200',
  error: 'bg-red-50 border-red-200',
  info: 'bg-cream-50 border-cream-200',
};

function ToastItem({ toast }: { toast: Toast }) {
  const { removeToast } = useStore();

  return (
    <div
      className={`flex items-center gap-2.5 px-4 py-3 rounded-lg border shadow-lg animate-slide-in ${bgMap[toast.type]}`}
      role="alert"
    >
      {iconMap[toast.type]}
      <p className="text-sm text-bark flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="p-0.5 rounded hover:bg-black/5 text-bark-dim transition-colors flex-shrink-0"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts } = useStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

export default ToastContainer;
