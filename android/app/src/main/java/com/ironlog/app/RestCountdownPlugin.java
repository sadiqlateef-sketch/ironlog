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
 * so it keeps ticking while the app is asleep. The "Rest over" alert itself
 * is still the scheduled notification from the web side (native.ts).
 */
@CapacitorPlugin(name = "RestCountdown")
public class RestCountdownPlugin extends Plugin {

    private static final String CHANNEL = "rest-countdown";
    private static final int ID = 1003;

    @PluginMethod
    public void show(PluginCall call) {
        Double endsAt = call.getDouble("endsAt");
        String label = call.getString("label", "");
        Context ctx = getContext();
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        if (endsAt == null || !nm.areNotificationsEnabled()) {
            call.resolve();
            return;
        }
        long end = endsAt.longValue();
        long left = end - System.currentTimeMillis();
        if (left <= 0) {
            nm.cancel(ID);
            call.resolve();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "Rest countdown", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Shows your rest time counting down on the lock screen");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
            ctx.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }

        Intent open = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent tap = open == null
            ? null
            : PendingIntent.getActivity(ctx, ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

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
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (tap != null) b.setContentIntent(tap);

        try {
            nm.notify(ID, b.build());
        } catch (SecurityException e) {
            // Notifications were turned off between the check and now.
        }
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        NotificationManagerCompat.from(getContext()).cancel(ID);
        call.resolve();
    }
}
