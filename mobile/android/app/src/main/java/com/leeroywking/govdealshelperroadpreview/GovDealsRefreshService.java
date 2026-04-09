package com.leeroywking.govdealshelperroadpreview;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Base64;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

public class GovDealsRefreshService extends Service {
    public static final String ACTION_START = "com.leeroywking.govdealshelperroadpreview.action.START_REFRESH";
    public static final String ACTION_CANCEL = "com.leeroywking.govdealshelperroadpreview.action.CANCEL_REFRESH";
    public static final String EXTRA_PAGE_SIZE = "pageSize";
    public static final String EXTRA_PAUSE_SECONDS = "pauseSeconds";

    private static final String CHANNEL_ID = "govdeals_refresh";
    private static final int NOTIFICATION_ID = 4107;
    private static final String API_URL = "https://maestro.lqdt1.com/search/list";
    private static final String PAGE_URL = "https://www.govdeals.com/en/search";
    private static final String BUSINESS_ID = "GD";
    private static final String API_KEY = "af93060f-337e-428c-87b8-c74b5837d6cd";
    private static final String APIM_SUBSCRIPTION_KEY = "cf620d1d8f904b5797507dc5fd1fdb80";
    private static final AtomicBoolean RUNNING = new AtomicBoolean(false);

    private volatile boolean cancelRequested = false;

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : ACTION_START;
        if (ACTION_CANCEL.equals(action)) {
            cancelRequested = true;
            updateStatus("cancel_requested", "Stopping after the current page.", 0, 0, 0, null, null);
            return START_NOT_STICKY;
        }
        if (!RUNNING.compareAndSet(false, true)) {
            updateStatus("running", "A refresh is already running.", 0, 0, 0, null, null);
            return START_STICKY;
        }

        int pageSize = intent != null ? intent.getIntExtra(EXTRA_PAGE_SIZE, 100) : 100;
        double pauseSeconds = intent != null ? intent.getDoubleExtra(EXTRA_PAUSE_SECONDS, 2.0) : 2.0;
        cancelRequested = false;
        createChannel();
        updateStatus("starting", "Starting on-device refresh…", 0, 0, 0, null, null);
        startForeground(NOTIFICATION_ID, buildNotification("Starting refresh…", 0, 0, true));

        new Thread(() -> runRefresh(pageSize, pauseSeconds), "govdeals-refresh").start();
        return START_STICKY;
    }

    private void runRefresh(int pageSize, double pauseSeconds) {
        JSONArray rawItems = new JSONArray();
        Set<String> seenKeys = new HashSet<>();
        int totalPages = 0;
        int pagesFetched = 0;
        try {
            int page = 1;
            while (!cancelRequested) {
                PageResult result = fetchPage(page, pageSize);
                if (pagesFetched == 0) {
                    totalPages = (int) Math.ceil(result.totalCount / (double) pageSize);
                    if (totalPages <= 0) {
                        totalPages = 1;
                    }
                }
                pagesFetched += 1;
                for (int i = 0; i < result.items.length(); i++) {
                    JSONObject item = result.items.getJSONObject(i);
                    String key = item.optString("accountId", "") + ":" + item.optString("assetId", "");
                    if (seenKeys.add(key)) {
                        rawItems.put(item);
                    }
                }
                updateStatus("running", "Fetching current listings…", pagesFetched, totalPages, seenKeys.size(), null, null);
                updateNotification("Refreshing listings…", pagesFetched, totalPages, true);
                if (page >= totalPages || result.items.length() == 0) {
                    break;
                }
                page += 1;
                if (pauseSeconds > 0) {
                    try {
                        Thread.sleep((long) (pauseSeconds * 1000));
                    } catch (InterruptedException ignored) {
                    }
                }
            }

            if (cancelRequested) {
                updateStatus("cancelled", "Refresh cancelled.", pagesFetched, totalPages, seenKeys.size(), null, null);
                updateNotification("Refresh cancelled", pagesFetched, totalPages, false);
                return;
            }

            updateStatus("scoring", "Scoring refreshed listings on-device…", pagesFetched, totalPages, seenKeys.size(), null, null);
            updateNotification("Scoring refreshed listings…", pagesFetched, totalPages, true);
            JSONObject bundle = GovDealsFirstLayer.buildBundle(rawItems);
            GovDealsRefreshStore.writeBundle(this, bundle);
            String generatedAt = bundle.getJSONObject("manifest").optString("generatedAt", isoNow());
            updateStatus("complete", "Refresh complete.", pagesFetched, totalPages, seenKeys.size(), generatedAt, null);
            updateNotification("Refresh complete", pagesFetched, totalPages, false);
        } catch (Exception error) {
            updateStatus("failed", "Refresh failed.", pagesFetched, totalPages, seenKeys.size(), null, String.valueOf(error));
            updateNotification("Refresh failed", pagesFetched, totalPages, false);
        } finally {
            RUNNING.set(false);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
        }
    }

    private PageResult fetchPage(int page, int pageSize) throws Exception {
        URL url = new URL(API_URL);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(30000);
        connection.setReadTimeout(30000);
        connection.setDoOutput(true);
        connection.setRequestProperty("x-api-key", API_KEY);
        connection.setRequestProperty("Ocp-Apim-Subscription-Key", APIM_SUBSCRIPTION_KEY);
        connection.setRequestProperty("x-user-id", "-1");
        connection.setRequestProperty("x-api-correlation-id", UUID.randomUUID().toString());
        connection.setRequestProperty("x-ecom-session-id", UUID.randomUUID().toString());
        connection.setRequestProperty("x-page-unique-id", Base64.encodeToString(PAGE_URL.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING));
        connection.setRequestProperty("x-referer", PAGE_URL);
        connection.setRequestProperty("x-user-timezone", "America/Los_Angeles");
        connection.setRequestProperty("User-Agent", "GovDealsHelperRoadPreview/1.0 Android");
        connection.setRequestProperty("Content-Type", "application/json");

        JSONObject payload = new JSONObject();
        payload.put("businessId", BUSINESS_ID);
        payload.put("page", page);
        payload.put("displayRows", pageSize);
        payload.put("requestType", "search");

        try (OutputStream output = connection.getOutputStream()) {
            output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
        String body = readFully(stream);
        if (status < 200 || status >= 300) {
            throw new IllegalStateException("GovDeals API returned " + status + ": " + body);
        }
        JSONObject json = new JSONObject(body);
        int totalCount = 0;
        try {
            totalCount = Integer.parseInt(String.valueOf(connection.getHeaderField("x-total-count")));
        } catch (Exception ignored) {
        }
        JSONArray items = json.optJSONArray("assetSearchResults");
        return new PageResult(items != null ? items : new JSONArray(), totalCount);
    }

    private String readFully(InputStream input) throws Exception {
        if (input == null) {
            return "";
        }
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            StringBuilder builder = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
            return builder.toString();
        }
    }

    private void updateStatus(String phase, String message, int pagesFetched, int totalPages, int uniqueRows, @Nullable String generatedAt, @Nullable String error) {
        JSONObject status = GovDealsRefreshStore.defaultStatus();
        try {
            status.put("running", "starting".equals(phase) || "running".equals(phase) || "scoring".equals(phase) || "cancel_requested".equals(phase));
            status.put("phase", phase);
            status.put("message", message);
            status.put("pagesFetched", pagesFetched);
            status.put("totalPages", totalPages);
            status.put("uniqueRows", uniqueRows);
            status.put("generatedAt", generatedAt == null ? JSONObject.NULL : generatedAt);
            status.put("error", error == null ? JSONObject.NULL : error);
        } catch (JSONException ignored) {
        }
        GovDealsRefreshStore.writeStatus(this, status);
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "GovDeals Refresh", NotificationManager.IMPORTANCE_LOW);
                channel.setDescription("Foreground refresh progress for GovDeals Helper.");
                manager.createNotificationChannel(channel);
            }
        }
    }

    private String isoNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(System.currentTimeMillis());
    }

    private Notification buildNotification(String text, int pagesFetched, int totalPages, boolean ongoing) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("GovDeals dataset refresh")
                .setContentText(text)
                .setOnlyAlertOnce(true)
                .setOngoing(ongoing)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (totalPages > 0 && ongoing) {
            builder.setProgress(totalPages, Math.min(pagesFetched, totalPages), false);
        } else {
            builder.setProgress(0, 0, false);
        }
        return builder.build();
    }

    private void updateNotification(String text, int pagesFetched, int totalPages, boolean ongoing) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        manager.notify(NOTIFICATION_ID, buildNotification(text, pagesFetched, totalPages, ongoing));
    }

    private static final class PageResult {
        final JSONArray items;
        final int totalCount;

        PageResult(JSONArray items, int totalCount) {
            this.items = items;
            this.totalCount = totalCount;
        }
    }
}
