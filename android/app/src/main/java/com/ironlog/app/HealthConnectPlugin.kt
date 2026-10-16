package com.ironlog.app

import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.health.connect.client.units.Length
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.reflect.KClass
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * Android Health Connect for the web app (src/lib/health.ts): send finished
 * workouts to it, and read heart rate and body weight back.
 *
 * Every workout is written with its Ironlog session id as the client record id,
 * so sending the same workout again updates it instead of adding a copy.
 */
@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val permissionContract = PermissionController.createRequestPermissionResultContract()

    /** The permissions Ironlog asks for, by the short names the web app uses. */
    private val permissions = mapOf(
        "writeWorkouts" to HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        "writeDistance" to HealthPermission.getWritePermission(DistanceRecord::class),
        "readHeartRate" to HealthPermission.getReadPermission(HeartRateRecord::class),
        "readWeight" to HealthPermission.getReadPermission(WeightRecord::class),
    )

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        scope.cancel()
    }

    /** Runs [block] off the UI thread's queue and always settles the call, so a Health Connect error can't crash the app. */
    private fun PluginCall.withClient(block: suspend (HealthConnectClient) -> Unit) {
        val call = this
        val sdk = HealthConnectClient.getSdkStatus(context, PROVIDER)
        if (sdk != HealthConnectClient.SDK_AVAILABLE) {
            call.reject(reason(sdk), "UNAVAILABLE")
            return
        }
        val client = HealthConnectClient.getOrCreate(context)
        scope.launch {
            try {
                block(client)
            } catch (e: CancellationException) {
                throw e
            } catch (e: SecurityException) {
                call.reject("Health Connect permission is off for Ironlog.", "PERMISSION", e)
            } catch (e: Exception) {
                Log.w(TAG, "Health Connect call failed", e)
                call.reject(e.message ?: "Health Connect didn't respond.", e)
            }
        }
    }

    private fun reason(sdk: Int): String = when (sdk) {
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
        else -> if (android.os.Build.VERSION.SDK_INT >= 28) "not_installed" else "unsupported"
    }

    private suspend fun statusOf(client: HealthConnectClient?): JSObject {
        val out = JSObject()
        val granted = JSArray()
        if (client == null) {
            out.put("available", false)
            out.put("reason", reason(HealthConnectClient.getSdkStatus(context, PROVIDER)))
        } else {
            out.put("available", true)
            val have = client.permissionController.getGrantedPermissions()
            permissions.forEach { (name, permission) -> if (permission in have) granted.put(name) }
        }
        out.put("granted", granted)
        return out
    }

    @PluginMethod
    fun status(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context, PROVIDER) != HealthConnectClient.SDK_AVAILABLE) {
            scope.launch { call.resolve(statusOf(null)) }
            return
        }
        call.withClient { client -> call.resolve(statusOf(client)) }
    }

    /** Shows Health Connect's own permission screen. Resolves with the new status. */
    @PluginMethod
    fun askPermissions(call: PluginCall) {
        call.withClient { client ->
            val have = client.permissionController.getGrantedPermissions()
            if (have.containsAll(permissions.values)) {
                call.resolve(statusOf(client))
                return@withClient
            }
            val intent = permissionContract.createIntent(context, permissions.values.toSet())
            startActivityForResult(call, intent, "permissionsAnswered")
        }
    }

    @ActivityCallback
    private fun permissionsAnswered(call: PluginCall?, @Suppress("UNUSED_PARAMETER") result: ActivityResult) {
        call?.withClient { client -> call.resolve(statusOf(client)) }
    }

    /** Opens Health Connect (Android 14+ settings, or the app on older phones), or its Play Store page when it's missing. */
    @PluginMethod
    fun openHealthConnect(call: PluginCall) {
        val sdk = HealthConnectClient.getSdkStatus(context, PROVIDER)
        val intent = if (sdk == HealthConnectClient.SDK_AVAILABLE) {
            Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
        } else {
            Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding")).setPackage("com.android.vending")
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        try {
            context.startActivity(intent)
        } catch (e: Exception) {
            context.startActivity(
                Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=$PROVIDER")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
        }
        call.resolve()
    }

    /**
     * Writes workouts: [{ id, version, start, end, type, title, notes, distanceM }].
     * Distance is only written when that permission was granted.
     */
    @PluginMethod
    fun writeWorkouts(call: PluginCall) {
        val list = call.getArray("workouts") ?: JSArray()
        call.withClient { client ->
            val have = client.permissionController.getGrantedPermissions()
            val distanceOk = permissions.getValue("writeDistance") in have
            val records = mutableListOf<Record>()
            for (i in 0 until list.length()) {
                val w = list.getJSONObject(i)
                val id = w.getString("id")
                val version = w.optLong("version", 0)
                val start = Instant.parse(w.getString("start"))
                val end = Instant.parse(w.getString("end"))
                if (!end.isAfter(start)) continue
                records += ExerciseSessionRecord(
                    startTime = start,
                    startZoneOffset = offset(start),
                    endTime = end,
                    endZoneOffset = offset(end),
                    metadata = Metadata.manualEntry(clientRecordId = "ironlog-workout-$id", clientRecordVersion = version),
                    exerciseType = exerciseType(w.optString("type")),
                    title = w.optString("title").ifBlank { null },
                    notes = w.optString("notes").ifBlank { null },
                )
                val metres = w.optDouble("distanceM", 0.0)
                if (distanceOk && metres > 0) {
                    records += DistanceRecord(
                        startTime = start,
                        startZoneOffset = offset(start),
                        endTime = end,
                        endZoneOffset = offset(end),
                        distance = Length.meters(metres),
                        metadata = Metadata.manualEntry(clientRecordId = "ironlog-distance-$id", clientRecordVersion = version),
                    )
                }
            }
            if (records.isNotEmpty()) client.insertRecords(records)
            call.resolve(JSObject().put("written", records.count { it is ExerciseSessionRecord }))
        }
    }

    /** Removes workouts (and their distance) that were deleted in Ironlog. */
    @PluginMethod
    fun deleteWorkouts(call: PluginCall) {
        val ids = call.getArray("ids") ?: JSArray()
        call.withClient { client ->
            val all = (0 until ids.length()).map { ids.getString(it) }
            if (all.isNotEmpty()) {
                client.deleteRecords(ExerciseSessionRecord::class, emptyList(), all.map { "ironlog-workout-$it" })
                val have = client.permissionController.getGrantedPermissions()
                if (permissions.getValue("writeDistance") in have) {
                    client.deleteRecords(DistanceRecord::class, emptyList(), all.map { "ironlog-distance-$it" })
                }
            }
            call.resolve()
        }
    }

    /** Heart-rate readings from other apps (a watch, Samsung Health...) between start and end: [{ time, bpm }]. */
    @PluginMethod
    fun readHeartRate(call: PluginCall) {
        val range = rangeOf(call) ?: return
        call.withClient { client ->
            val samples = JSArray()
            read(client, HeartRateRecord::class, range) { record ->
                record.samples.forEach { s ->
                    if (!s.time.isBefore(range.first) && !s.time.isAfter(range.second)) {
                        samples.put(JSObject().put("time", s.time.toString()).put("bpm", s.beatsPerMinute))
                    }
                }
            }
            call.resolve(JSObject().put("samples", samples))
        }
    }

    /** Body-weight entries from other apps (scales, Samsung Health...) between start and end: [{ time, kg }]. */
    @PluginMethod
    fun readWeight(call: PluginCall) {
        val range = rangeOf(call) ?: return
        call.withClient { client ->
            val records = JSArray()
            read(client, WeightRecord::class, range) { r ->
                records.put(JSObject().put("time", r.time.toString()).put("kg", r.weight.inKilograms))
            }
            call.resolve(JSObject().put("records", records))
        }
    }

    private fun rangeOf(call: PluginCall): Pair<Instant, Instant>? = try {
        Instant.parse(call.getString("start")) to Instant.parse(call.getString("end"))
    } catch (e: Exception) {
        call.reject("start and end must be ISO times.")
        null
    }

    /** Reads every page, skipping what Ironlog wrote itself. */
    private suspend fun <T : Record> read(client: HealthConnectClient, type: KClass<T>, range: Pair<Instant, Instant>, each: (T) -> Unit) {
        var token: String? = null
        var pages = 0
        do {
            val response = client.readRecords(
                ReadRecordsRequest(type, TimeRangeFilter.between(range.first, range.second), pageSize = 1000, pageToken = token),
            )
            response.records.filter { it.metadata.dataOrigin.packageName != context.packageName }.forEach(each)
            token = response.pageToken
            pages++
            // Older Health Connect versions end with "" instead of null.
        } while (!token.isNullOrEmpty() && pages < 20)
    }

    private fun offset(at: Instant): ZoneOffset = ZoneId.systemDefault().rules.getOffset(at)

    private fun exerciseType(name: String): Int = when (name) {
        "running" -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING
        "running_treadmill" -> ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL
        "walking" -> ExerciseSessionRecord.EXERCISE_TYPE_WALKING
        "rowing_machine" -> ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE
        "biking_stationary" -> ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY
        "elliptical" -> ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL
        "stair_climbing_machine" -> ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE
        "other" -> ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT
        else -> ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING
    }

    companion object {
        private const val TAG = "IronlogHealth"
        private const val PROVIDER = "com.google.android.apps.healthdata"
    }
}
