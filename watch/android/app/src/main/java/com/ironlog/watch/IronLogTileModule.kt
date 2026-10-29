package com.ironlog.watch

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class IronLogTileModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "IronLogTile"

    @ReactMethod
    fun updateTileState(payloadJson: String, promise: Promise) {
        try {
            IronLogTileState.saveFromPayload(reactContext, payloadJson)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_UPDATE_TILE", e.message)
        }
    }

    @ReactMethod
    fun clearTileState(promise: Promise) {
        try {
            IronLogTileState.clearState(reactContext)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERR_CLEAR_TILE", e.message)
        }
    }
}
