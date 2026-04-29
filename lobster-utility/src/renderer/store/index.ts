import { create } from 'zustand';
import type { LobsterNotification } from '../../shared/types';

type ActiveView = 'dashboard' | 'ports' | 'docker' | 'advisor' | 'uitest' | 'mnemo' | 'lobstercode' | 'settings' | 'project-detail' | 'profile';

interface PendingFixPrompt {
  projectPath: string;
  prompt: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
  duration?: number;
}

interface AppState {
  activeView: ActiveView;
  selectedProjectId: string | null;
  sidebarCollapsed: boolean;
  notifications: LobsterNotification[];
  unreadCount: number;
  pendingFixPrompt: PendingFixPrompt | null;
  toasts: Toast[];
  // Actions
  setActiveView: (view: ActiveView) => void;
  selectProject: (id: string) => void;
  clearSelection: () => void;
  toggleSidebar: () => void;
  addNotification: (n: LobsterNotification) => void;
  markNotificationRead: (id: string) => void;
  openCodeWithPrompt: (projectPath: string, prompt: string) => void;
  clearPendingPrompt: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useStore = create<AppState>((set) => ({
  activeView: 'dashboard',
  selectedProjectId: null,
  sidebarCollapsed: false,
  notifications: [],
  unreadCount: 0,
  pendingFixPrompt: null,
  toasts: [],

  setActiveView: (view) => set({ activeView: view }),
  openCodeWithPrompt: (projectPath, prompt) => set({
    activeView: 'lobstercode',
    pendingFixPrompt: { projectPath, prompt },
  }),
  clearPendingPrompt: () => set({ pendingFixPrompt: null }),
  selectProject: (id) => set({ selectedProjectId: id, activeView: 'project-detail' }),
  clearSelection: () => set({ selectedProjectId: null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  addNotification: (n) =>
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 100),
      unreadCount: s.unreadCount + (n.read ? 0 : 1),
    })),

  markNotificationRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - 1),
    })),

  showToast: (message, type = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ toasts: [...s.toasts, { id, message, type, duration }] }));
    // Auto-remove after duration
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
  },

  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
