package com.Spendova.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private long lastBackPressTime = 0;
    private Toast exitToast;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        applyWebViewSettings();
        setupBackNavigation();
    }

    @Override
    public void onResume() {
        super.onResume();
        applyWebViewSettings();
    }

    private void applyWebViewSettings() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            // Lock text zoom to 100% so Android system font/display downscaling doesn't shrink APK text
            settings.setTextZoom(100);
        }
    }

    private void setupBackNavigation() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.evaluateJavascript(
                        "(function() { try { return Boolean(window.handleAppBack && window.handleAppBack()); } catch(e) { return false; } })()",
                        value -> {
                            boolean handled = "true".equalsIgnoreCase(value);
                            if (!handled) {
                                runOnUiThread(() -> handleExitPress());
                            }
                        }
                    );
                } else {
                    handleExitPress();
                }
            }
        });
    }

    private void handleExitPress() {
        long currentTime = System.currentTimeMillis();
        if (currentTime - lastBackPressTime < 2000) {
            if (exitToast != null) {
                exitToast.cancel();
            }
            finish();
        } else {
            lastBackPressTime = currentTime;
            if (exitToast != null) {
                exitToast.cancel();
            }
            exitToast = Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT);
            exitToast.show();
        }
    }
}
