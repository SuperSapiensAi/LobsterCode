import React, { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { Bell, Check, AlertTriangle, Info, X, Trash2 } from 'lucide-react';
import type { LobsterNotification } from '../../../shared/types';

function priorityIcon(priority: string) {
  switch (priority) {
    case 'urgent': return <AlertTriangle size={14} className="text-status-red flex-shrink-0" />;
    case 'warning': return <AlertTriangle size={14} className="text-status-yellow flex-shrink-0" />;
    default: return <Info size={14} className="text-ocean flex-shrink-0" />;
  }
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'adesso';
  if (mins < 60) return `${mins}m fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  return `${days}g fa`;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  anchorBottom?: boolean;
}

export function NotificationPanel({ isOpen, onClose }: NotificationPanelProps) {
  const { notifications, markNotificationRead } = useStore();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid capturing the opening click
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handler);
    };
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const unread = notifications.filter((n) => !n.read);
  const read = notifications.filter((n) => n.read);

  const handleMarkRead = (id: string) => {
    markNotificationRead(id);
    // Also mark on backend
    window.lobster?.notifications?.markRead?.(id);
  };

  const handleMarkAllRead = () => {
    unread.forEach((n) => {
      markNotificationRead(n.id);
      window.lobster?.notifications?.markRead?.(n.id);
    });
  };

  return (
    <div
      ref={panelRef}
      className="absolute bottom-16 left-2 w-80 max-h-[70vh] bg-white rounded-xl shadow-2xl border border-cream-200 z-50 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 bg-cream-50">
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-lobster" />
          <h3 className="text-sm font-semibold text-bark">Notifiche</h3>
          {unread.length > 0 && (
            <span className="bg-lobster text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
              {unread.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unread.length > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-ocean hover:text-lobster transition-colors px-2 py-1 rounded"
              title="Segna tutte come lette"
            >
              <Check size={14} />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-cream-100 text-bark-dim transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Bell size={32} className="text-bark-dim mb-2 opacity-40" />
            <p className="text-sm text-bark-dim">Nessuna notifica</p>
            <p className="text-xs text-bark-dim mt-1">Le notifiche appariranno qui quando succede qualcosa</p>
          </div>
        ) : (
          <>
            {/* Unread */}
            {unread.map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={handleMarkRead} />
            ))}

            {/* Separator */}
            {unread.length > 0 && read.length > 0 && (
              <div className="px-4 py-2 bg-cream-50">
                <span className="text-[10px] text-bark-dim uppercase tracking-wider">Precedenti</span>
              </div>
            )}

            {/* Read (last 20) */}
            {read.slice(0, 20).map((n) => (
              <NotificationItem key={n.id} notification={n} onMarkRead={handleMarkRead} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function NotificationItem({
  notification: n,
  onMarkRead,
}: {
  notification: LobsterNotification;
  onMarkRead: (id: string) => void;
}) {
  return (
    <div
      className={`flex gap-2.5 px-4 py-3 border-b border-cream-100 cursor-pointer transition-colors
        ${n.read ? 'bg-white opacity-70' : 'bg-cream-50 hover:bg-cream-100'}
      `}
      onClick={() => !n.read && onMarkRead(n.id)}
    >
      <div className="pt-0.5">{priorityIcon(n.priority)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs leading-snug ${n.read ? 'text-bark-dim' : 'text-bark font-medium'}`}>
            {n.title}
          </p>
          <span className="text-[10px] text-bark-dim flex-shrink-0">{timeAgo(n.timestamp)}</span>
        </div>
        <p className="text-[11px] text-bark-secondary mt-0.5 leading-snug truncate">{n.message}</p>
        {n.projectName && (
          <span className="text-[10px] text-ocean mt-1 inline-block">{n.projectName}</span>
        )}
      </div>
      {!n.read && (
        <div className="pt-1 flex-shrink-0">
          <span className="w-2 h-2 rounded-full bg-lobster block" />
        </div>
      )}
    </div>
  );
}

export default NotificationPanel;
