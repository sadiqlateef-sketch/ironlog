package com.ironlog.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The rest timer on the lock screen and in the notification shade: a silent
 * notification whose clock counts down to the end of your rest on its own,
 * so it keeps ticking while the app is asleep. Includes lockscreen actions:
 * +30s, -15s, and Skip.
 */
@CapacitorPlugin(name = "RestCountdown")
public class RestCountdownPlugin extends Plugin {

    public static final String CHANNEL = "rest-countdown";
    public static final int NOTIFICATION_ID = 1003;
    public static volatile long activeEndsAt = 0;
    public static volatile String activeLabel = "";

    @PluginMethod
    public void show(PluginCall call) {
        Double endsAt = call.getDouble("endsAt");
        String label = call.getString("label", "");
        Context ctx = getContext();
        if (endsAt == null) {
            call.resolve();
            return;
        }

        activeEndsAt = endsAt.longValue();
        activeLabel = label;
        updateNotification(ctx, activeEndsAt, activeLabel);
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        activeEndsAt = 0;
        NotificationManagerCompat.from(getContext()).cancel(NOTIFICATION_ID);
        call.resolve();
    }

    public static void adjustRestTime(Context ctx, long deltaMillis) {
        if (activeEndsAt <= 0) return;
        activeEndsAt += deltaMillis;
        long left = activeEndsAt - System.currentTimeMillis();
        if (left <= 0) {
            activeEndsAt = 0;
            NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
            return;
        }
        updateNotification(ctx, activeEndsAt, activeLabel);
    }

    public static void updateNotification(Context ctx, long end, String label) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (!nm.areNotificationsEnabled()) return;

        long left = end - System.currentTimeMillis();
        if (left <= 0) {
            nm.cancel(NOTIFICATION_ID);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Rest countdown", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows your rest time counting down on the lock screen");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        // Tap opens app
        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent tap = open == null
            ? null
            : PendingIntent.getActivity(ctx, NOTIFICATION_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Action: +30s
        Intent add30 = new Intent(ctx, RestActionReceiver.class).setAction(RestActionReceiver.ACTION_EXTEND_REST_30);
        PendingIntent piAdd30 = PendingIntent.getBroadcast(ctx, 101, add30, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Action: -15s
        Intent sub15 = new Intent(ctx, RestActionReceiver.class).setAction(RestActionReceiver.ACTION_REDUCE_REST_15);
        PendingIntent piSub15 = PendingIntent.getBroadcast(ctx, 102, sub15, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Action: Skip
        Intent skip = new Intent(ctx, RestActionReceiver.class).setAction(RestActionReceiver.ACTION_SKIP_REST);
        PendingIntent piSkip = PendingIntent.getBroadcast(ctx, 103, skip, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_ironlog)
            .setContentTitle("Resting")
            .setContentText(label.isEmpty() ? "Next set when the clock hits zero" : "Next: " + label)
            .setWhen(end)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setChronometerCountDown(true)
            .setTimeoutAfter(left)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(0, "+30s", piAdd30)
            .addAction(0, "-15s", piSub15)
            .addAction(0, "Skip", piSkip);

        if (tap != null) b.setContentIntent(tap);

        try {
            nm.notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException ignored) {}
    }
}
