package com.leeroywking.govdealshelperroadpreview;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONObject;

@CapacitorPlugin(
        name = "GovDealsRefresh",
        permissions = {
                @Permission(strings = {Manifest.permission.POST_NOTIFICATIONS}, alias = "notifications")
        }
)
public class GovDealsRefreshPlugin extends Plugin {

    @PluginMethod
    public void ensureNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("notifications", call, "notificationsPermissionCallback");
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void startRefresh(PluginCall call) {
        Context context = getContext();
        double pauseSeconds = call.getDouble("pauseSeconds", 2.0);
        int pageSize = call.getInt("pageSize", 100);
        Intent intent = new Intent(context, GovDealsRefreshService.class);
        intent.setAction(GovDealsRefreshService.ACTION_START);
        intent.putExtra(GovDealsRefreshService.EXTRA_PAUSE_SECONDS, pauseSeconds);
        intent.putExtra(GovDealsRefreshService.EXTRA_PAGE_SIZE, pageSize);
        ContextCompat.startForegroundService(context, intent);
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void cancelRefresh(PluginCall call) {
        Context context = getContext();
        Intent intent = new Intent(context, GovDealsRefreshService.class);
        intent.setAction(GovDealsRefreshService.ACTION_CANCEL);
        context.startService(intent);
        JSObject result = new JSObject();
        result.put("cancelRequested", true);
        call.resolve(result);
    }

    @PluginMethod
    public void getRefreshStatus(PluginCall call) {
        JSONObject status = GovDealsRefreshStore.readStatus(getContext());
        JSObject result = JSObject.fromJSONObject(status);
        call.resolve(result);
    }

    @PluginMethod
    public void getCachedBundle(PluginCall call) {
        JSONObject bundle = GovDealsRefreshStore.readBundle(getContext());
        JSObject result = new JSObject();
        result.put("available", bundle != null);
        if (bundle != null) {
            result.put("bundle", JSObject.fromJSONObject(bundle));
        }
        call.resolve(result);
    }
}
