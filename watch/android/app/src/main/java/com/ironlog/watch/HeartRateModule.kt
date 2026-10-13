package com.ironlog.watch

import android.view.WindowManager
import androidx.core.content.ContextCompat
import androidx.health.services.client.HealthServices
import androidx.health.services.client.MeasureCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataPointContainer
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.DeltaDataType
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Live heart rate from the watch's sensor (Wear OS Health Services), sent to
 * JavaScript as "IronlogHeartRate" events: { bpm, at }. It runs while the app
 * is open, which is why the workout screen also keeps the display on.
 */
class HeartRateModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

  private val measureClient by lazy { HealthServices.getClient(context).measureClient }
  private var registered = false

  private val callback = object : MeasureCallback {
    override fun onAvailabilityChanged(dataType: DeltaDataType<*, *>, availability: Availability) {
      if (availability is DataTypeAvailability) {
        val map = Arguments.createMap()
        map.putString("status", availability.name)
        context.emitDeviceEvent("IronlogHeartRateStatus", map)
      }
    }

    override fun onDataReceived(data: DataPointContainer) {
      val now = System.currentTimeMillis()
      for (point in data.getData(DataType.HEART_RATE_BPM)) {
        val map = Arguments.createMap()
        map.putDouble("bpm", point.value)
        map.putDouble("at", now.toDouble())
        context.emitDeviceEvent("IronlogHeartRate", map)
      }
    }
  }

  override fun getName() = "IronlogHeartRate"

  /** Resolves true if this watch has a heart-rate sensor Health Services can read. */
  @ReactMethod
  fun isAvailable(promise: Promise) {
    val future = measureClient.getCapabilitiesAsync()
    future.addListener({
      try {
        promise.resolve(DataType.HEART_RATE_BPM in future.get().supportedDataTypesMeasure)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }, ContextCompat.getMainExecutor(context))
  }

  @ReactMethod
  fun start() {
    if (registered) return
    measureClient.registerMeasureCallback(DataType.HEART_RATE_BPM, callback)
    registered = true
  }

  @ReactMethod
  fun stop() {
    if (!registered) return
    measureClient.unregisterMeasureCallbackAsync(DataType.HEART_RATE_BPM, callback)
    registered = false
  }

  /** Keeps the display awake during a workout (and lets it sleep again after). */
  @ReactMethod
  fun setKeepScreenOn(on: Boolean) {
    val activity = context.currentActivity ?: return
    activity.runOnUiThread {
      if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }
  }

  // Required for NativeEventEmitter on the JavaScript side.
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Double) {}

  override fun invalidate() {
    stop()
    super.invalidate()
  }
}
