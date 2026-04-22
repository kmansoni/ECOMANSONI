import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  size: number; // bytes
  url: string; // CDN URL to JS file
  entryFile: string; // JS filename (e.g., 'music-module.js')
  entryComponent?: string; // exported component name (default: 'default')
  checksum?: string;
  minAppVersion?: string;
}

interface InstalledModule {
  id: string;
  version: string;
  installedAt: number;
  path: string;
  manifest: ModuleManifest;
}

const MODULES_BASE_PATH = `${Directory.Data}/modules`;
const MANIFEST_FILE = 'modules-manifest.json';

export class ModuleLoader {
  private installedModules: Map<string, InstalledModule> = new Map();
  private isInitialized = false;

  async init() {
    if (this.isInitialized) return;
    try {
      await Filesystem.mkdir({
        path: MODULES_BASE_PATH,
        directory: Directory.Data,
        recursive: true,
      });
      await this.loadInstalledManifest();
      this.isInitialized = true;
    } catch (error) {
      console.error('ModuleLoader init error:', error);
    }
  }

  private async loadInstalledManifest() {
    try {
      const result = await Filesystem.readFile({
        path: MANIFEST_FILE,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });
      const manifest = JSON.parse(String(result.data)) as Record<string, InstalledModule>;
      this.installedModules = new Map(Object.entries(manifest));
    } catch (error: any) {
      if (error.code !== 'FILE_NOT_FOUND') {
        console.error('Failed to load modules manifest:', error);
      }
      this.installedModules = new Map();
    }
  }

  private async saveInstalledManifest() {
    const manifest = Object.fromEntries(this.installedModules);
    const data = JSON.stringify(manifest, null, 2);
    await Filesystem.writeFile({
      path: MANIFEST_FILE,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
  }

  async isInstalled(moduleId: string): Promise<boolean> {
    await this.init();
    return this.installedModules.has(moduleId);
  }

  async getInstalledModule(moduleId: string): Promise<InstalledModule | null> {
    await this.init();
    return this.installedModules.get(moduleId) || null;
  }

  async install(
    moduleId: string,
    manifest: ModuleManifest,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<void> {
    await this.init();

    if (this.installedModules.has(moduleId)) {
      const installed = this.installedModules.get(moduleId)!;
      if (installed.manifest.version === manifest.version) {
        console.log(`Module ${moduleId} already installed (v${manifest.version})`);
        return;
      }
    }

    console.log(`Installing module "${manifest.name}" (${(manifest.size / 1024 / 1024).toFixed(1)} MB)...`);

    // Download JS file
    const jsBlob = await this.downloadFile(manifest.url, manifest.size, onProgress);

    // Convert to base64 for Capacitor Filesystem
    const base64 = await this.blobToBase64(jsBlob);

    // Save to filesystem
    const modulePath = `${MODULES_BASE_PATH}/${moduleId}`;
    const fileName = manifest.entryFile || 'index.js';
    const filePath = `${modulePath}/${fileName}`;

    await Filesystem.mkdir({
      path: modulePath,
      directory: Directory.Data,
      recursive: true,
    });

    await Filesystem.writeFile({
      path: filePath,
      data: base64,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });

    // Save manifest
    const installedModule: InstalledModule = {
      id: moduleId,
      version: manifest.version,
      installedAt: Date.now(),
      path: modulePath,
      manifest,
    };

    this.installedModules.set(moduleId, installedModule);
    await this.saveInstalledManifest();

    console.log(`Module ${moduleId} installed successfully`);
  }

  async uninstall(moduleId: string): Promise<void> {
    await this.init();
    if (!this.installedModules.has(moduleId)) return;

    const module = this.installedModules.get(moduleId)!;
    try {
      await Filesystem.rmdir({
        path: module.path,
        directory: Directory.Data,
        recursive: true,
      });
    } catch (error) {
      console.error('Failed to remove module directory:', error);
    }

    this.installedModules.delete(moduleId);
    await this.saveInstalledManifest();
  }

  async loadModule<T = any>(moduleId: string, entryName?: string): Promise<T> {
    await this.init();
    const installed = this.installedModules.get(moduleId);
    if (!installed) {
      throw new Error(`Module "${moduleId}" is not installed. Open /services/${moduleId} to install.`);
    }

    const fileName = installed.manifest.entryFile || 'index.js';
    const filePath = `${installed.path}/${fileName}`;

    try {
      const result = await Filesystem.readFile({
        path: filePath,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      });

      // result.data is base64 string (because we saved it as such)
      const blob = this.base64ToBlob(String(result.data), 'application/javascript');
      const blobUrl = URL.createObjectURL(blob);

      const module = await import(/* webpackIgnore: true */ blobUrl);
      URL.revokeObjectURL(blobUrl);

      const exportName = entryName || installed.manifest.entryComponent || 'default';
      if (exportName === 'default') {
        return module.default as T;
      }
      return (module as any)[exportName] as T;
    } catch (error) {
      console.error('Failed to load module:', error);
      throw error;
    }
  }

  async getInstalledModules(): Promise<InstalledModule[]> {
    await this.init();
    return Array.from(this.installedModules.values());
  }

  async getTotalSize(): Promise<number> {
    await this.init();
    let total = 0;
    for (const mod of this.installedModules.values()) {
      total += mod.manifest.size;
    }
    return total;
  }

  private async downloadFile(
    url: string,
    totalSize: number,
    onProgress?: (downloaded: number, total: number) => void
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let downloaded = 0;
      xhr.open('GET', url, true);
      xhr.responseType = 'blob';
      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          downloaded = event.loaded;
          onProgress?.(downloaded, totalSize || event.total);
        }
      };
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Failed to download: ${xhr.statusText}`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.send();
    });
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private base64ToBlob(base64: string, mime: string = 'application/javascript'): Blob {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  }

  async clearAllModules(): Promise<void> {
    await this.init();
    for (const module of this.installedModules.values()) {
      try {
        await Filesystem.rmdir({
          path: module.path,
          directory: Directory.Data,
          recursive: true,
        });
      } catch (error) {
        console.error('Failed to remove module:', module.id, error);
      }
    }
    this.installedModules.clear();
    await this.saveInstalledManifest();
  }
}

export const moduleLoader = new ModuleLoader();
export default moduleLoader;
