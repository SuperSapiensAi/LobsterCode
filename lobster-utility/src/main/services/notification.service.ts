// ============================================================
// LOBSTER UTILITY — Notification Service
// Dual notification system (in-app + native)
// ============================================================

import { EventEmitter } from 'events';
import { Notification } from 'electron';
import * as crypto from 'crypto';
import type { LobsterNotification, NotificationPriority, AppSettings } from '../../shared/types';

interface NotificationOptions {
  title: string;
  message: string;
  priority: NotificationPriority;
  projectId?: string;
  projectName?: string;
  actionLabel?: string;
  actionType?: string;
  icon?: string;
}

/** Tipo di evento notificabile — mappato alle impostazioni granulari */
export type NotificationEventType =
  | 'containerStopped'
  | 'containerStarted'
  | 'projectStopped'
  | 'projectStarted'
  | 'portFreed'
  | 'portOccupied'
  | 'highCpu'
  | 'highMemory'
  | 'highDisk';

export class NotificationService extends EventEmitter {
  private notifications: Map<string, LobsterNotification> = new Map();
  private readonly maxHistorySize = 100;
  private readonly rateLimitMs = 5000; // 5 seconds per project
  private lastNotificationTime: Map<string, number> = new Map();
  private settingsGetter: (() => AppSettings) | null = null;

  constructor() {
    super();
  }

  /**
   * Set a function to retrieve current app settings.
   * Chiamato da index.ts dopo l'init delle settings.
   */
  setSettingsGetter(getter: () => AppSettings): void {
    this.settingsGetter = getter;
  }

  /**
   * Check se un tipo di notifica è abilitato nelle impostazioni.
   * Se non c'è un settingsGetter, tutto è abilitato (backward-compatible).
   */
  isEventEnabled(eventType: NotificationEventType): boolean {
    if (!this.settingsGetter) return true;
    try {
      const settings = this.settingsGetter();
      // Check globale notifiche
      if (!settings.general.notificationsEnabled) return false;
      // Check granulare per tipo
      const notifSettings = settings.notifications;
      if (!notifSettings) return true;
      return (notifSettings as any)[eventType] !== false;
    } catch {
      return true; // fallback: abilita
    }
  }

  /**
   * Notify only if the event type is enabled in settings.
   * Shorthand per: if (isEventEnabled(type)) notify(opts)
   */
  notifyIfEnabled(eventType: NotificationEventType, opts: NotificationOptions): LobsterNotification | null {
    if (!this.isEventEnabled(eventType)) {
      return null; // Silenziata dalle impostazioni
    }
    return this.notify(opts);
  }

  /**
   * Create and send a notification
   */
  notify(opts: NotificationOptions): LobsterNotification {
    // Rate limiting: max 1 per project+event-type per 5 seconds
    // Using title prefix as type key to avoid unrelated events suppressing each other
    const typeKey = opts.title?.replace(/\s+/g, '_').slice(0, 20) || 'generic';
    const rateLimitKey = `${opts.projectId || '__global__'}:${typeKey}`;
    const lastTime = this.lastNotificationTime.get(rateLimitKey) || 0;
    const now = Date.now();

    if (now - lastTime < this.rateLimitMs) {
      // Silenzia — non lanciare errore, crea notifica "fantasma" per non rompere il flusso
      return {
        id: this.generateId(),
        title: opts.title,
        message: opts.message,
        priority: opts.priority || 'info',
        channel: 'in-app',
        read: true, // Marcata come letta — non appare nel conteggio
        timestamp: new Date().toISOString(),
      } as LobsterNotification;
    }

    this.lastNotificationTime.set(rateLimitKey, now);

    // Create notification object
    const notification: LobsterNotification = {
      id: this.generateId(),
      title: opts.title,
      message: opts.message,
      priority: opts.priority,
      channel: opts.priority === 'urgent' || opts.priority === 'warning' ? 'both' : 'in-app',
      projectId: opts.projectId,
      projectName: opts.projectName,
      timestamp: new Date().toISOString(),
      read: false,
      actionLabel: opts.actionLabel,
      actionType: opts.actionType,
      icon: opts.icon,
    };

    // Store in history
    this.notifications.set(notification.id, notification);

    // Trim history to max size
    if (this.notifications.size > this.maxHistorySize) {
      const firstKey = this.notifications.keys().next().value;
      if (firstKey !== undefined) this.notifications.delete(firstKey);
    }

    // Send native notification if priority warrants it
    if (notification.channel === 'both' || notification.channel === 'native') {
      this.sendNativeNotification(notification);
    }

    // Emit event for renderer
    this.emit('newNotification', notification);

    return notification;
  }

  /**
   * Send native OS notification
   */
  private sendNativeNotification(notification: LobsterNotification): void {
    try {
      const nativeNotif = new Notification({
        title: notification.title,
        body: notification.message || '',
        urgency: notification.priority === 'urgent' ? 'critical' : 'normal',
        icon: notification.icon,
      });

      nativeNotif.show();
    } catch (error) {
      console.error('[NotificationService] Error sending native notification:', error);
    }
  }

  /**
   * Get all notifications (returns last N)
   */
  getHistory(limit: number = 100): LobsterNotification[] {
    return Array.from(this.notifications.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  /**
   * Mark notification as read
   */
  markRead(id: string): void {
    const notification = this.notifications.get(id);
    if (notification) {
      notification.read = true;
      this.emit('notificationRead', id);
    }
  }

  /**
   * Mark all as read
   */
  markAllRead(): void {
    for (const notification of this.notifications.values()) {
      notification.read = true;
    }
    this.emit('allNotificationsRead');
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return Array.from(this.notifications.values()).filter((n) => !n.read).length;
  }

  /**
   * Clear all notifications
   */
  clearHistory(): void {
    this.notifications.clear();
    this.lastNotificationTime.clear();
    this.emit('historyCleared');
  }

  /**
   * Generate unique notification ID
   */
  private generateId(): string {
    return `notif_${crypto.randomBytes(4).toString('hex')}`;
  }
}

export default NotificationService;
