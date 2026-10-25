package com.ironlog.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(name = "IronLogEcosystem")
public class IronLogEcosystemPlugin extends Plugin {
    private static final String TAG = "IronLogEcosystemPlugin";

    private String getNowIso() {
        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        return sdf.format(new Date());
    }

    @PluginMethod
    public void upsertWorkoutRecord(PluginCall call) {
        String id = call.getString("id", "workout-" + System.currentTimeMillis());
        String title = call.getString("title", "Strength Training");
        String startTime = call.getString("startTime", getNowIso());
        int durationSeconds = call.getInt("durationSeconds", 0);
        double totalVolumeLb = call.getDouble("totalVolumeLb", 0.0);
        int totalSets = call.getInt("totalSets", 0);
        int avgHr = call.getInt("avgHr", 0);
        int dailyStrain = call.getInt("dailyStrain", 50);

        try {
            ContentValues cv = new ContentValues();
            cv.put("id", id);
            cv.put("title", title);
            cv.put("startTime", startTime);
            cv.put("durationSeconds", durationSeconds);
            cv.put("totalVolumeLb", totalVolumeLb);
            cv.put("totalSets", totalSets);
            cv.put("avgHr", avgHr);
            cv.put("dailyStrain", dailyStrain);
            cv.put("atGym", 1);
            cv.put("prsHit", 0);
            cv.put("updatedAt", getNowIso());

            Uri uri = Uri.parse("content://com.ironlog.app.provider/workouts");
            getContext().getContentResolver().insert(uri, cv);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to upsert workout record", e);
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void completeBujoWorkoutAndWaterOak(PluginCall call) {
        String date = call.getString("date", getNowIso());
        String workoutTitle = call.getString("workoutTitle", "Strength Training");
        int durationMinutes = call.getInt("durationMinutes", 45);
        double totalVolumeLb = call.getDouble("totalVolumeLb", 0.0);
        int strain = call.getInt("strain", 65);
        String treeSpecies = call.getString("treeSpecies", "oak");
        String treeName = call.getString("treeName", "Oak · Tree of Vitality");

        try {
            ContentResolver resolver = getContext().getContentResolver();

            // 1. Water Oak Habit Tree in Bujo
            ContentValues habitCv = new ContentValues();
            habitCv.put("id", "habit-vitality-oak");
            habitCv.put("name", "Strength & Vitality");
            habitCv.put("treeSpecies", treeSpecies);
            habitCv.put("treeName", treeName);
            habitCv.put("streak", 1);
            habitCv.put("stage", 2);
            habitCv.put("wilted", 0);
            habitCv.put("lastCheckinDate", date);
            habitCv.put("updatedAt", getNowIso());

            Uri bujoHabitUri = Uri.parse("content://com.sadiqlateef.bujotasks.provider/habits");
            resolver.insert(bujoHabitUri, habitCv);

            // 2. Insert/Complete Task Entry in Bujo
            ContentValues entryCv = new ContentValues();
            entryCv.put("id", "workout-" + System.currentTimeMillis());
            entryCv.put("type", "task");
            entryCv.put("title", "Crushed " + workoutTitle + " (" + Math.round(totalVolumeLb) + " lb, " + durationMinutes + "m)");
            entryCv.put("status", "done");
            entryCv.put("priority", 1);
            entryCv.put("contexts", "@gym");
            entryCv.put("source", "ironlog");
            entryCv.put("updatedAt", getNowIso());
            entryCv.put("createdAt", getNowIso());

            Uri bujoEntryUri = Uri.parse("content://com.sadiqlateef.bujotasks.provider/entries");
            resolver.insert(bujoEntryUri, entryCv);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to sync workout to Bujo Tasks", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("error", e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void pushWorkoutContextToBraindump(PluginCall call) {
        String summaryText = call.getString("summaryText", "");
        try {
            ContentValues cv = new ContentValues();
            cv.put("id", "ironlog-context-" + System.currentTimeMillis());
            cv.put("type", "workout_summary");
            cv.put("content", summaryText);
            cv.put("source", "ironlog");
            cv.put("created_at", getNowIso());

            Uri uri = Uri.parse("content://com.sadiqlateef.braindump.provider/entries");
            getContext().getContentResolver().insert(uri, cv);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.w(TAG, "Braindump context push skipped: " + e.getMessage());
            JSObject ret = new JSObject();
            ret.put("success", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void syncRecoveryState(PluginCall call) {
        String date = call.getString("date", getNowIso());
        int recoveryScore = call.getInt("recoveryScore", 75);
        int dailyStrain = call.getInt("dailyStrain", 50);
        boolean recommendRestToken = call.getBoolean("recommendRestToken", false);

        try {
            ContentValues cv = new ContentValues();
            cv.put("date", date);
            cv.put("recoveryScore", recoveryScore);
            cv.put("dailyStrain", dailyStrain);
            cv.put("fatiguedMuscles", "");
            cv.put("readyMuscles", "");
            cv.put("deloadRecommended", recommendRestToken ? 1 : 0);
            cv.put("updatedAt", getNowIso());

            Uri uri = Uri.parse("content://com.ironlog.app.provider/recovery");
            getContext().getContentResolver().insert(uri, cv);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Failed to sync recovery state", e);
            call.reject("Failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void queryBudgetFitnessSpend(PluginCall call) {
        JSObject ret = new JSObject();
        double monthlySpend = 68.99; // Default fitness allowance fallback

        try {
            Uri billsUri = Uri.parse("content://com.sadiqlateef.budget.provider/subscriptions");
            Cursor cursor = getContext().getContentResolver().query(billsUri, null, "packageName LIKE '%fitness%' OR name LIKE '%Gym%'", null, null);
            if (cursor != null) {
                if (cursor.moveToFirst()) {
                    int amtIdx = cursor.getColumnIndex("monthlyAmount");
                    if (amtIdx != -1) {
                        monthlySpend = cursor.getDouble(amtIdx);
                    }
                }
                cursor.close();
            }
        } catch (Exception e) {
            Log.w(TAG, "Budget fitness spend query skipped: " + e.getMessage());
        }

        ret.put("monthlyGymAndSupplements", monthlySpend);
        call.resolve(ret);
    }
}
