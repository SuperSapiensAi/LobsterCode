// ============================================================
// LOBSTER UTILITY — Desktop Shortcut Service
// Creates .webloc files on macOS Desktop
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { Project, DesktopShortcut } from '../../shared/types';

export class DesktopShortcutService {
  private desktopPath: string;

  constructor(targetDir?: string) {
    this.desktopPath = targetDir || path.join(os.homedir(), 'Desktop');
  }

  /**
   * Create a single .webloc shortcut on Desktop
   */
  async createShortcut(
    projectName: string,
    icon: string,
    url: string
  ): Promise<DesktopShortcut | null> {
    try {
      if (!fs.existsSync(this.desktopPath)) {
        fs.mkdirSync(this.desktopPath, { recursive: true });
      }

      const filename = `${icon} ${projectName}.webloc`;
      const shortcutPath = path.join(this.desktopPath, filename);

      // Generate .webloc plist XML
      const webloc = this.generateWebloc(url);

      fs.writeFileSync(shortcutPath, webloc, 'utf-8');

      console.log(`[DesktopShortcut] Created shortcut at ${shortcutPath}`);

      return {
        projectName,
        projectId: projectName, // Would be replaced with actual ID in real usage
        icon,
        url,
        label: `${icon} ${projectName}`,
        shortcutPath,
      };
    } catch (error) {
      console.error(`[DesktopShortcut] Error creating shortcut for ${projectName}:`, error);
      return null;
    }
  }

  /**
   * Remove a shortcut from Desktop
   */
  async removeShortcut(projectName: string, icon: string): Promise<boolean> {
    try {
      const filename = `${icon} ${projectName}.webloc`;
      const shortcutPath = path.join(this.desktopPath, filename);

      if (fs.existsSync(shortcutPath)) {
        fs.unlinkSync(shortcutPath);
        console.log(`[DesktopShortcut] Removed shortcut at ${shortcutPath}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`[DesktopShortcut] Error removing shortcut for ${projectName}:`, error);
      return false;
    }
  }

  /**
   * Batch create shortcuts for all projects with web ports
   */
  async createAllShortcuts(projects: Project[]): Promise<DesktopShortcut[]> {
    const shortcuts: DesktopShortcut[] = [];

    for (const project of projects) {
      // Find first port that looks like a web service
      const webPort = project.ports.find(
        (p) =>
          (p.port >= 3000 && p.port <= 9000) || // Common dev ports
          [80, 443, 5173, 5174, 8000, 8080, 8443].includes(p.port)
      );

      if (webPort) {
        const url = `http://localhost:${webPort.port}`;
        const shortcut = await this.createShortcut(project.name, project.icon, url);

        if (shortcut) {
          shortcuts.push(shortcut);
        }
      }
    }

    return shortcuts;
  }

  /**
   * Get all existing Lobster shortcuts on Desktop
   */
  async getShortcuts(): Promise<DesktopShortcut[]> {
    const shortcuts: DesktopShortcut[] = [];

    try {
      if (!fs.existsSync(this.desktopPath)) {
        return [];
      }

      const files = fs.readdirSync(this.desktopPath);

      for (const file of files) {
        if (file.endsWith('.webloc')) {
          const filePath = path.join(this.desktopPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Parse URL from plist
          const urlMatch = content.match(/<string>(.*?)<\/string>/);
          const url = urlMatch ? urlMatch[1] : '';

          // Extract icon and name from filename (format: "🐳 ProjectName.webloc")
          const nameMatch = file.match(/^(.) (.+)\.webloc$/);
          if (nameMatch) {
            const [, icon, projectName] = nameMatch;

            shortcuts.push({
              projectId: projectName,
              projectName,
              icon,
              url,
              label: `${icon} ${projectName}`,
              shortcutPath: filePath,
            });
          }
        }
      }
    } catch (error) {
      console.error('[DesktopShortcut] Error reading shortcuts:', error);
    }

    return shortcuts;
  }

  /**
   * Generate .webloc plist XML content
   */
  private generateWebloc(url: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>URL</key>
  <string>${url}</string>
</dict>
</plist>`;
  }
}

export default DesktopShortcutService;
