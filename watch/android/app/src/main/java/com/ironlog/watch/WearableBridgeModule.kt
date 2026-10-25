package com.ironlog.watch

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Node
import com.google.android.gms.wearable.Wearable
import java.nio.charset.StandardCharsets

class WearableBridgeModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext), MessageClient.OnMessageReceivedListener {

  companion object {
    private const val TAG = "WearableBridgeModule"
    const val PATH_SET_LOGGED = "/ironlog/set_logged"
    const val PATH_WORKOUT_FINISHED = "/ironlog/workout_finished"
    const val PATH_REQUEST_ACTIVE = "/ironlog/request_active"
    const val PATH_ACTIVE_WORKOUT = "/ironlog/active_workout"
  }

  override fun getName(): String = "WearableBridge"

  override fun initialize() {
    super.initialize()
    try {
      Wearable.getMessageClient(reactContext).addListener(this)
      Log.i(TAG, "WearableBridge message listener registered on watch.")
    } catch (e: Exception) {
      Log.w(TAG, "Failed registering Wearable listener on watch: ${e.message}")
    }
  }

  override fun invalidate() {
    try {
      Wearable.getMessageClient(reactContext).removeListener(this)
    } catch (_: Exception) {}
    super.invalidate()
  }

  override fun onMessageReceived(messageEvent: MessageEvent) {
    val path = messageEvent.path
    val data = messageEvent.data?.let { String(it, StandardCharsets.UTF_8) } ?: "{}"
    Log.i(TAG, "Watch received message from phone: $path -> $data")

    val emitter = reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    if (path == PATH_ACTIVE_WORKOUT) {
      emitter.emit("onActiveWorkoutReceived", data)
    } else if (path == PATH_SET_LOGGED) {
      emitter.emit("onPhoneSetLogged", data)
    }
  }

  @ReactMethod
  fun sendSetLogged(payload: String, promise: Promise) {
    Thread {
      try {
        val data = payload.toByteArray(StandardCharsets.UTF_8)
        val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes)
        for (node in nodes) {
          Tasks.await(Wearable.getMessageClient(reactContext).sendMessage(node.id, PATH_SET_LOGGED, data))
        }
        promise.resolve(nodes.size)
      } catch (e: Exception) {
        Log.w(TAG, "Error sending set to phone: ${e.message}")
        promise.reject("ERR_SEND_SET", e.message)
      }
    }.start()
  }

  @ReactMethod
  fun sendWorkoutFinished(payload: String, promise: Promise) {
    Thread {
      try {
        val data = payload.toByteArray(StandardCharsets.UTF_8)
        val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes)
        for (node in nodes) {
          Tasks.await(Wearable.getMessageClient(reactContext).sendMessage(node.id, PATH_WORKOUT_FINISHED, data))
        }
        promise.resolve(nodes.size)
      } catch (e: Exception) {
        Log.w(TAG, "Error sending workout finished to phone: ${e.message}")
        promise.reject("ERR_SEND_FINISH", e.message)
      }
    }.start()
  }

  @ReactMethod
  fun requestActiveWorkout(promise: Promise) {
    Thread {
      try {
        val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes)
        for (node in nodes) {
          Tasks.await(Wearable.getMessageClient(reactContext).sendMessage(node.id, PATH_REQUEST_ACTIVE, ByteArray(0)))
        }
        promise.resolve(nodes.size)
      } catch (e: Exception) {
        Log.w(TAG, "Error requesting active workout from phone: ${e.message}")
        promise.reject("ERR_REQUEST_ACTIVE", e.message)
      }
    }.start()
  }

  @ReactMethod
  fun getConnectedPhoneCount(promise: Promise) {
    Thread {
      try {
        val nodes = Tasks.await(Wearable.getNodeClient(reactContext).connectedNodes)
        promise.resolve(nodes.size)
      } catch (e: Exception) {
        promise.reject("ERR_GET_NODES", e.message)
      }
    }.start()
  }
}
