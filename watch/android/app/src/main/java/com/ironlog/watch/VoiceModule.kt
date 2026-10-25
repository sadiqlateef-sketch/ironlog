package com.ironlog.watch

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.speech.RecognizerIntent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Voice input with the watch's own speech screen ("Speak now"), asking for
 * on-device recognition so it works with no signal where the watch supports
 * it. Resolves with what was heard, or null if you cancelled.
 */
class VoiceModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context), ActivityEventListener {

  private var pending: Promise? = null

  init {
    context.addActivityEventListener(this)
  }

  override fun getName() = "IronlogVoice"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
    promise.resolve(intent.resolveActivity(context.packageManager) != null)
  }

  @ReactMethod
  fun listen(prompt: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.reject("no_activity", "Open Ironlog first.")
      return
    }
    pending?.resolve(null)
    pending = promise
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
      putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      putExtra(RecognizerIntent.EXTRA_PROMPT, prompt)
      putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
      putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    try {
      activity.startActivityForResult(intent, REQUEST)
    } catch (e: ActivityNotFoundException) {
      pending = null
      promise.reject("unavailable", "This watch has no voice input.")
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode != REQUEST) return
    val promise = pending ?: return
    pending = null
    val text = data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
    promise.resolve(if (resultCode == Activity.RESULT_OK) text else null)
  }

  override fun onNewIntent(intent: Intent) {}

  companion object {
    private const val REQUEST = 4127
  }
}
