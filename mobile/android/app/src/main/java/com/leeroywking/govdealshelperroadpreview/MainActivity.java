package com.leeroywking.govdealshelperroadpreview;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GovDealsRefreshPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
