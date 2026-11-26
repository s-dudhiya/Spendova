import { Capacitor, registerPlugin } from "@capacitor/core";
import { APP_VERSION } from "./version";

export interface AppUpdatePluginInterface {
  canRequestPackageInstalls(): Promise<{ value: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  installApk(options?: { path?: string }): Promise<void>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (data: { progress: number; bytesDownloaded?: number; totalBytes?: number }) => void
  ): Promise<any>;
}

export const AppUpdate = registerPlugin<AppUpdatePluginInterface>("AppUpdate");

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  apkUrl: string;
  releaseNotes?: string;
}

export const isAndroidApp = (): boolean => {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
};

// Compare versions like "2.2.0" vs "2.1.0"
export const compareVersions = (v1: string, v2: string): number => {
  const clean1 = v1.replace(/^v/i, "").trim().split(".").map(Number);
  const clean2 = v2.replace(/^v/i, "").trim().split(".").map(Number);
  const maxLen = Math.max(clean1.length, clean2.length);

  for (let i = 0; i < maxLen; i++) {
    const num1 = clean1[i] || 0;
    const num2 = clean2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

export const checkForAppUpdate = async (): Promise<UpdateInfo | null> => {
  // STRICT CHECK: Never run or expose update logic for web users
  if (!isAndroidApp()) {
    return null;
  }

  try {
    const response = await fetch(
      "https://api.github.com/repos/s-dudhiya/Spendova/releases/tags/v-latest",
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    if (!response.ok) {
      console.warn("Update check failed with status:", response.status);
      return null;
    }

    const releaseData = await response.json();
    const body: string = releaseData.body || "";
    const name: string = releaseData.name || "";

    // Extract version from body (RELEASE_VERSION=X.Y.Z) or from release name
    let latestVersion = "";
    const versionMatch = body.match(/RELEASE_VERSION=([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
    if (versionMatch && versionMatch[1]) {
      latestVersion = versionMatch[1];
    } else {
      const nameMatch = name.match(/v?([0-9]+\.[0-9]+(\.[0-9]+)?)/i);
      if (nameMatch && nameMatch[1]) {
        latestVersion = nameMatch[1];
      }
    }

    if (!latestVersion) {
      return null;
    }

    // Find the APK download asset URL
    const apkAsset = (releaseData.assets || []).find(
      (asset: any) =>
        asset.name && asset.name.toLowerCase().endsWith(".apk")
    );

    const apkUrl =
      apkAsset?.browser_download_url ||
      `https://github.com/s-dudhiya/Spendova/releases/download/v-latest/Spendova_v${latestVersion}.apk`;

    const hasUpdate = compareVersions(latestVersion, APP_VERSION) > 0;

    return {
      hasUpdate,
      currentVersion: APP_VERSION,
      latestVersion,
      apkUrl,
      releaseNotes: body.replace(/RELEASE_VERSION=.*(\r?\n)?/gi, "").trim(),
    };
  } catch (error) {
    console.warn("Check update error:", error);
    return null;
  }
};
