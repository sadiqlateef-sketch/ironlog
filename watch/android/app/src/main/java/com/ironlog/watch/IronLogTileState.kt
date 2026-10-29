package com.ironlog.watch

import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import org.json.JSONObject

data class TileStateData(
    val hasActiveWorkout: Boolean = false,
    val workoutName: String = "IronLog",
    val exerciseName: String = "Ready to Train",
    val setText: String = "Set 1 of 4",
    val targetWeightText: String = "225 lb",
    val targetRepsText: String = "5 reps",
    val isRestActive: Boolean = false,
    val restSecondsRemaining: Int = 0,
    val totalRestSeconds: Int = 120,
    val restPercent: Int = 0,
    val heartRate: Int = 0,
    val updatedAt: Long = System.currentTimeMillis()
)

object IronLogTileState {
    private const val TAG = "IronLogTileState"
    private const val PREFS_NAME = "ironlog_tile_state"

    fun getPrefs(context: Context): SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveFromPayload(context: Context, jsonStr: String) {
        try {
            val json = JSONObject(jsonStr)
            val prefs = getPrefs(context).edit()

            val hasActive = json.optBoolean("hasActiveWorkout", true)
            prefs.putBoolean("has_active_workout", hasActive)
            prefs.putString("workout_name", json.optString("workoutName", "IronLog"))
            prefs.putString("exercise_name", json.optString("exerciseName", "Ready to Train"))
            prefs.putString("set_text", json.optString("setIndexText", "Set 1 of 4"))
            prefs.putString("target_weight_text", json.optString("targetWeightText", "0 lb"))
            prefs.putString("target_reps_text", json.optString("targetRepsText", "0 reps"))
            prefs.putBoolean("is_rest_active", json.optBoolean("isRestActive", false))
            prefs.putInt("rest_seconds_remaining", json.optInt("restSecondsRemaining", 0))
            prefs.putInt("total_rest_seconds", json.optInt("totalRestSeconds", 120))
            prefs.putInt("rest_percent", json.optInt("restPercent", 0))
            prefs.putInt("heart_rate", json.optInt("heartRate", 0))
            prefs.putLong("updated_at", System.currentTimeMillis())
            prefs.apply()

            notifyUpdates(context)
        } catch (e: Exception) {
            Log.e(TAG, "Error saving tile state from payload: ${e.message}")
        }
    }

    fun getState(context: Context): TileStateData {
        val p = getPrefs(context)
        return TileStateData(
            hasActiveWorkout = p.getBoolean("has_active_workout", false),
            workoutName = p.getString("workout_name", "IronLog") ?: "IronLog",
            exerciseName = p.getString("exercise_name", "Ready to Train") ?: "Ready to Train",
            setText = p.getString("set_text", "Set 1 of 4") ?: "Set 1 of 4",
            targetWeightText = p.getString("target_weight_text", "225 lb") ?: "225 lb",
            targetRepsText = p.getString("target_reps_text", "5 reps") ?: "5 reps",
            isRestActive = p.getBoolean("is_rest_active", false),
            restSecondsRemaining = p.getInt("rest_seconds_remaining", 0),
            totalRestSeconds = p.getInt("total_rest_seconds", 120),
            restPercent = p.getInt("rest_percent", 0),
            heartRate = p.getInt("heart_rate", 0),
            updatedAt = p.getLong("updated_at", 0L)
        )
    }

    fun clearState(context: Context) {
        getPrefs(context).edit().clear().apply()
        notifyUpdates(context)
    }

    fun notifyUpdates(context: Context) {
        try {
            // Update Wear OS Tiles
            TileService.getUpdater(context).requestUpdate(WorkoutTileService::class.java)

            // Update Wear OS Complications
            val requester = ComplicationDataSourceUpdateRequester.create(
                context,
                ComponentName(context, WorkoutComplicationService::class.java)
            )
            requester.requestUpdateAll()
        } catch (e: Exception) {
            Log.w(TAG, "Error notifying tile/complication updaters: ${e.message}")
        }
    }
}
