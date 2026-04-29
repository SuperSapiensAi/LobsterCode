import React, { useEffect, useState, useCallback } from 'react';
import { useStore } from './store';
import { Dashboard } from './components/Dashboard/Dashboard';
import { PortMonitor } from './components/PortMonitor/PortMonitor';
import { DockerMonitor } from './components/DockerMonitor/DockerMonitor';
import { SmartAdvisor } from './components/SmartAdvisor/SmartAdvisor';
import { UITestAgent } from './components/UITestAgent/UITestAgent';
import { Mnemo } from './components/Mnemo/Mnemo';
import { LobsterCode } from './components/LobsterCode/LobsterCode';
import { Settings as SettingsView } from './components/Settings/Settings';
import { ProjectDetail } from './components/ProjectDetail/ProjectDetail';
import { ProfileEditor } from './components/Profile/ProfileEditor';
import { NotificationPanel } from './components/NotificationPanel/NotificationPanel';
import { ToastContainer } from './components/ToastContainer/ToastContainer';
import { Home, Plug, Container, Brain, FlaskConical, Cpu, Terminal, Settings, Bell, ChevronLeft, ChevronRight } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard' as const, label: 'Il Mio Mondo', icon: Home, emoji: '🏠' },
  { id: 'ports' as const, label: 'Porte', icon: Plug, emoji: '🔌' },
  { id: 'docker' as const, label: 'Docker', icon: Container, emoji: '🐳' },
  { id: 'advisor' as const, label: 'Consulente', icon: Brain, emoji: '🧠' },
  { id: 'uitest' as const, label: 'Test UI', icon: FlaskConical, emoji: '🧪' },
  { id: 'mnemo' as const, label: 'MNEMO', icon: Cpu, emoji: '🧠' },
  { id: 'lobstercode' as const, label: 'Code', icon: Terminal, emoji: '🦞' },
  { id: 'settings' as const, label: 'Impostazioni', icon: Settings, emoji: '⚙️' },
];

export function App() {
  const { activeView, setActiveView, sidebarCollapsed, toggleSidebar, unreadCount, addNotification } = useStore();
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  // Subscribe to new notifications from backend and feed the store
  useEffect(() => {
    // Load existing notifications on mount
    window.lobster?.notifications?.getAll?.().then((all) => {
      if (all && Array.isArray(all)) {
        all.forEach((n) => addNotification(n));
      }
    }).catch(() => {});

    // Subscribe to new notifications pushed from main process
    const unsub = window.lobster?.notifications?.onNew?.((notification) => {
      if (notification) {
        addNotification(notification);
      }
    });
    return () => { unsub?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleNotifPanel = useCallback(() => {
    setNotifPanelOpen((prev) => !prev);
  }, []);

  const closeNotifPanel = useCallback(() => {
    setNotifPanelOpen(false);
  }, []);

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard />;
      case 'ports': return <PortMonitor />;
      case 'docker': return <DockerMonitor />;
      case 'advisor': return <SmartAdvisor />;
      case 'uitest': return <UITestAgent />;
      case 'mnemo': return <Mnemo />;
      case 'lobstercode': return <LobsterCode />;
      case 'settings': return <SettingsView />;
      case 'project-detail': return <ProjectDetail />;
      case 'profile': return <ProfileEditor />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-cream-50">
      {/* Sidebar */}
      <aside
        className={`flex flex-col bg-sidebar text-cream-50 transition-all duration-300 ease-in-out flex-shrink-0
          ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
      >
        {/* macOS traffic light area */}
        <div className="h-[52px] drag-region flex-shrink-0" />

        {/* Brand */}
        {!sidebarCollapsed && (
          <div className="px-4 pb-4 flex items-center gap-2">
            <span className="text-2xl">🦞</span>
            <span className="text-sm font-bold tracking-wide text-cream-50">
              Lobster Manager
            </span>
          </div>
        )}
        {sidebarCollapsed && (
          <div className="flex justify-center pb-4">
            <span className="text-2xl">🦞</span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center gap-3 w-full rounded-lg transition-all duration-150 no-drag
                  ${sidebarCollapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2.5 text-left'}
                  ${isActive
                    ? 'bg-sidebar-active text-lobster-light'
                    : 'text-cream-400 hover:text-cream-50 hover:bg-sidebar-hover'
                  }`}
                title={item.label}
              >
                <item.icon size={20} className={isActive ? 'text-lobster-light' : ''} />
                {!sidebarCollapsed && (
                  <span className="text-sm font-medium">{item.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="px-2 pb-4 space-y-2 relative">
          {/* Notifications */}
          <button
            onClick={toggleNotifPanel}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-cream-400 hover:text-cream-50 hover:bg-sidebar-hover transition-colors no-drag relative"
            title="Notifiche"
          >
            <Bell size={20} />
            {!sidebarCollapsed && <span className="text-sm">Notifiche</span>}
            {unreadCount > 0 && (
              <span className="absolute top-1.5 left-7 bg-lobster text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Panel */}
          <NotificationPanel isOpen={notifPanelOpen} onClose={closeNotifPanel} />

          {/* Collapse toggle */}
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center w-full py-2 rounded-lg text-cream-400 hover:text-cream-50 hover:bg-sidebar-hover transition-colors no-drag"
            title={sidebarCollapsed ? 'Espandi' : 'Comprimi'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Drag region for macOS */}
        <div className="h-[52px] drag-region flex-shrink-0 sticky top-0 z-10 bg-cream-50/80 backdrop-blur-sm border-b border-cream-200" />

        {renderView()}
      </main>

      {/* Global toast notifications */}
      <ToastContainer />
    </div>
  );
}
