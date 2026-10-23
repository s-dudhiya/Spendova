package com.Spendova.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void canRequestPackageInstalls(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ret.put("value", getContext().getPackageManager().canRequestPackageInstalls());
        } else {
            ret.put("value", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String downloadUrl = call.getString("url");
        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("Download URL is required");
            return;
        }

        // Run background download
        new Thread(() -> {
            InputStream input = null;
            FileOutputStream output = null;
            HttpURLConnection connection = null;
            try {
                URL url = new URL(downloadUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("User-Agent", "Spendova-Android-App");
                connection.connect();

                int responseCode = connection.getResponseCode();
                // Handle redirects manually if needed
                if (responseCode == HttpURLConnection.HTTP_MOVED_PERM || responseCode == HttpURLConnection.HTTP_MOVED_TEMP || responseCode == 307 || responseCode == 308) {
                    String newUrl = connection.getHeaderField("Location");
                    connection.disconnect();
                    url = new URL(newUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setRequestProperty("User-Agent", "Spendova-Android-App");
                    connection.connect();
                    responseCode = connection.getResponseCode();
                }

                if (responseCode != HttpURLConnection.HTTP_OK) {
                    call.reject("Server returned HTTP " + responseCode);
                    return;
                }

                int fileLength = connection.getContentLength();
                File outputDir = getContext().getExternalFilesDir(null);
                if (outputDir == null) {
                    outputDir = getContext().getFilesDir();
                }
                File apkFile = new File(outputDir, "Spendova-update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                input = connection.getInputStream();
                output = new FileOutputStream(apkFile);

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                long lastNotified = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);

                    if (fileLength > 0) {
                        int progress = (int) ((total * 100) / fileLength);
                        long now = System.currentTimeMillis();
                        if (now - lastNotified > 150 || progress == 100) {
                            lastNotified = now;
                            JSObject progressObj = new JSObject();
                            progressObj.put("progress", progress);
                            progressObj.put("bytesDownloaded", total);
                            progressObj.put("totalBytes", fileLength);
                            notifyListeners("downloadProgress", progressObj);
                        }
                    }
                }
                output.flush();

                JSObject completeObj = new JSObject();
                completeObj.put("progress", 100);
                notifyListeners("downloadProgress", completeObj);

                // Launch package installer
                triggerInstall(apkFile);
                call.resolve();

            } catch (Exception e) {
                call.reject("Download failed: " + e.getMessage(), e);
            } finally {
                try {
                    if (output != null) output.close();
                    if (input != null) input.close();
                    if (connection != null) connection.disconnect();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("path");
        File file;
        if (filePath != null && !filePath.isEmpty()) {
            file = new File(filePath);
        } else {
            File outputDir = getContext().getExternalFilesDir(null);
            if (outputDir == null) outputDir = getContext().getFilesDir();
            file = new File(outputDir, "Spendova-update.apk");
        }

        if (!file.exists()) {
            call.reject("APK file does not exist: " + file.getAbsolutePath());
            return;
        }

        try {
            triggerInstall(file);
            call.resolve();
        } catch (Exception e) {
            call.reject("Install launch failed: " + e.getMessage(), e);
        }
    }

    private void triggerInstall(File apkFile) {
        Uri apkUri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
        } else {
            apkUri = Uri.fromFile(apkFile);
        }

        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
