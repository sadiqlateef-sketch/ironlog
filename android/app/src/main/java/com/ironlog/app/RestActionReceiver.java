package com.ironlog.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;
import androidx.core.app.NotificationManagerCompat;

/**
 * Handles lockscreen and notification action buttons for the rest countdown:
 * "+30s", "-15s", and "Skip Rest".
 */
public class RestActionReceiver extends BroadcastReceiver {
    private static final String TAG = "RestActionReceiver";

    public static final String ACTION_EXTEND_REST_30 = "com.ironlog.app.ACTION_EXTEND_REST_30";
    public static final String ACTION_REDUCE_REST_15 = "com.ironlog.app.ACTION_REDUCE_REST_15";
    public static final String ACTION_SKIP_REST = "com.ironlog.app.ACTION_SKIP_REST";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        Log.i(TAG, "Received rest notification action: " + action);

        switch (action) {
            case ACTION_SKIP_REST:
                NotificationManagerCompat.from(context).cancel(RestCountdownPlugin.NOTIFICATION_ID);
                RestCountdownPlugin.activeEndsAt = 0;
                break;

            case ACTION_EXTEND_REST_30:
                RestCountdownPlugin.adjustRestTime(context, 30_000L);
                break;

            case ACTION_REDUCE_REST_15:
                RestCountdownPlugin.adjustRestTime(context, -15_000L);
                break;
        }
    }
}
