package com.ironlog.app

import android.app.Activity
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView

/**
 * Health Connect opens this when you tap "Read privacy policy" for Ironlog.
 * Android requires it before Health Connect will show the permission screen.
 */
class HealthPrivacyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad, pad, pad)
            textSize = 16f
            text = getString(R.string.health_privacy)
        }
        setContentView(ScrollView(this).apply { addView(text) })
    }
}
