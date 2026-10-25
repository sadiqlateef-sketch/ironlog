package com.ironlog.app;

import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge starts
        registerPlugin(RestCountdownPlugin.class);
        registerPlugin(IronLogEcosystemPlugin.class);
        registerPlugin(WearableBridgePlugin.class);
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
    }
}
