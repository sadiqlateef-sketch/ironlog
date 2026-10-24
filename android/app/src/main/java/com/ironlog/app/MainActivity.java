package com.ironlog.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register native plugins before bridge starts
        registerPlugin(RestCountdownPlugin.class);
        registerPlugin(IronLogEcosystemPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
