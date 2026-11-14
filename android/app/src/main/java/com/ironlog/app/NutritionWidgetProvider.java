package com.ironlog.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen food widget (F29): today's kcal left, protein and water, plus a
 * "Log food" button that opens ironlog://food. It only shows what the app last
 * published (IronLogEcosystemPlugin.upsertNutritionDay); no network, no permission.
 */
public class NutritionWidgetProvider extends AppWidgetProvider {
    static final String PREFS = "ironlog_nutrition_widget";

    /** Store the text the app computed and redraw every placed widget. */
    static void publish(Context context, String date, String title, String line1, String line2) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("date", date)
                .putString("title", title)
                .putString("line1", line1)
                .putString("line2", line2)
                .apply();
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, NutritionWidgetProvider.class));
        if (ids.length > 0) draw(context, manager, ids);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        draw(context, manager, ids);
    }

    private static void draw(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        String date = p.getString("date", null);
        // An old day (the app hasn't opened since midnight) isn't shown as today.
        boolean current = date != null && date.compareTo(today) >= 0;
        String title = p.getString("title", "Food today");
        String line1 = current ? p.getString("line1", "Nothing logged yet") : "Nothing logged yet";
        String line2 = current ? p.getString("line2", "") : "Open IronLog to update";

        Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("ironlog://food"), context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(context, 29, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        for (int id : ids) {
            RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_nutrition);
            v.setTextViewText(R.id.widget_nutrition_title, title);
            v.setTextViewText(R.id.widget_nutrition_line1, line1);
            v.setTextViewText(R.id.widget_nutrition_line2, line2);
            v.setOnClickPendingIntent(R.id.widget_nutrition_log, tap);
            v.setOnClickPendingIntent(R.id.widget_nutrition_root, tap);
            manager.updateAppWidget(id, v);
        }
    }
}
