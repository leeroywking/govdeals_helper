package com.leeroywking.govdealshelperroadpreview;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

public final class GovDealsRefreshStore {
    private static final String PREFS_NAME = "govdeals_refresh_status";
    private static final String KEY_STATUS = "status_json";
    private static final String BUNDLE_FILENAME = "govdeals_refresh_bundle.json";

    private GovDealsRefreshStore() {}

    public static void writeStatus(Context context, JSONObject status) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_STATUS, status.toString()).apply();
    }

    public static JSONObject readStatus(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_STATUS, null);
        if (raw == null || raw.isEmpty()) {
            return defaultStatus();
        }
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return defaultStatus();
        }
    }

    public static JSONObject defaultStatus() {
        JSONObject status = new JSONObject();
        try {
            status.put("running", false);
            status.put("phase", "idle");
            status.put("message", "No refresh has been started yet.");
            status.put("pagesFetched", 0);
            status.put("totalPages", 0);
            status.put("uniqueRows", 0);
            status.put("generatedAt", JSONObject.NULL);
            status.put("error", JSONObject.NULL);
        } catch (JSONException ignored) {
        }
        return status;
    }

    public static void writeBundle(Context context, JSONObject bundle) throws Exception {
        File target = new File(context.getFilesDir(), BUNDLE_FILENAME);
        try (FileOutputStream output = new FileOutputStream(target, false)) {
            output.write(bundle.toString().getBytes(StandardCharsets.UTF_8));
        }
    }

    public static JSONObject readBundle(Context context) {
        File target = new File(context.getFilesDir(), BUNDLE_FILENAME);
        if (!target.exists()) {
            return null;
        }
        try (FileInputStream input = new FileInputStream(target)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            byte[] bytes = output.toByteArray();
            return new JSONObject(new String(bytes, StandardCharsets.UTF_8));
        } catch (Exception ignored) {
            return null;
        }
    }
}
