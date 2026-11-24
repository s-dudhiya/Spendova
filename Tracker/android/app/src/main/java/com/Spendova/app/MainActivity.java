package com.Spendova.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdatePlugin.class);
        super.onCreate(savedInstanceState);
        applyWebViewSettings();
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
}
