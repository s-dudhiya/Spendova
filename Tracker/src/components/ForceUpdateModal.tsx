import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AppUpdate,
  checkForAppUpdate,
  isAndroidApp,
  type UpdateInfo,
} from "@/lib/app-update";

export const ForceUpdateModal = () => {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  useEffect(() => {
    // Only check if running on the native Android application
    if (!isAndroidApp()) return;

    let mounted = true;
    checkForAppUpdate().then((info) => {
      if (mounted && info && info.hasUpdate) {
        setUpdateInfo(info);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleStartUpdate = async () => {
    if (!updateInfo) return;

    setError(null);
    setDownloading(true);
    setProgress(0);
    setStatusText("Connecting...");

    try {
      // Check if permission to install unknown apps is granted on Android 8+
      try {
        const perm = await AppUpdate.canRequestPackageInstalls();
        if (perm && perm.value === false) {
          setNeedsPermission(true);
        }
      } catch (err) {
        console.warn("Could not check install permission:", err);
      }

      // Listen for download progress events from the native plugin
      const listener = await AppUpdate.addListener(
        "downloadProgress",
        (data: { progress: number; bytesDownloaded?: number; totalBytes?: number }) => {
          setProgress(data.progress);
          if (data.progress < 100) {
            setStatusText(`Downloading update... ${data.progress}%`);
          } else {
            setStatusText("Opening installer...");
          }
        }
      );

      await AppUpdate.downloadAndInstall({ url: updateInfo.apkUrl });

      // Clean up listener
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    } catch (err: any) {
      console.error("Update failed:", err);
      setError(err?.message || "Failed to download update. Please try again.");
      setDownloading(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await AppUpdate.openInstallPermissionSettings();
    } catch (err) {
      console.warn("Failed to open settings:", err);
    }
  };

  // Strictly do not render if not Android or no update available
  if (!updateInfo || !updateInfo.hasUpdate) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/85 p-4 backdrop-blur-md select-none"
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-border/80 bg-card p-6 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Header Icon */}
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/15 text-primary shadow-inner">
          {downloading ? (
            <Download className="size-8 animate-bounce" />
          ) : (
            <Sparkles className="size-8" />
          )}
        </div>

        {/* Title & Version Info */}
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Update Required
        </h2>
        <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
          A new version of Spendova is required to continue. Please update to keep your expenses in sync and access the latest features.
        </p>

        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-background/80 py-2 px-3 text-xs font-semibold border border-border/60">
          <span className="text-muted-foreground">v{updateInfo.currentVersion}</span>
          <span className="text-primary font-bold">→</span>
          <span className="text-primary font-bold">v{updateInfo.latestVersion}</span>
        </div>

        {/* Permission Notice if Android 8+ requires permission */}
        {needsPermission && (
          <div className="mt-3.5 flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-2.5 text-left text-xs text-warning">
            <ShieldAlert className="size-4 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">Permission Required</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Please allow Spendova to install updates in settings.
              </p>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="mt-1.5 font-bold text-primary underline text-xs"
              >
                Open Settings
              </button>
            </div>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="mt-3.5 rounded-xl border border-destructive/40 bg-destructive/10 p-2.5 text-xs font-medium text-destructive">
            {error}
          </div>
        )}

        {/* Progress Bar (when downloading) */}
        {downloading ? (
          <div className="mt-5 space-y-2">
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-200 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs font-semibold text-muted-foreground">
              {statusText || `Downloading... ${progress}%`}
            </p>
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-2">
            <Button
              type="button"
              onClick={handleStartUpdate}
              className="w-full h-11 rounded-2xl font-bold text-sm shadow-md"
            >
              <Download className="mr-2 size-4" />
              Update Now
            </Button>
            {error && (
              <Button
                type="button"
                variant="outline"
                onClick={handleStartUpdate}
                className="w-full h-10 rounded-2xl font-semibold text-xs"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Retry Download
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
