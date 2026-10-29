package com.ironlog.watch

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.MonochromaticImageComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

class WorkoutComplicationService : SuspendingComplicationDataSourceService() {

    private fun getTapIntent(): PendingIntent {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        return PendingIntent.getActivity(
            this,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun getIcon(): Icon {
        return Icon.createWithResource(this, R.drawable.ic_ironlog_tile)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? {
        val tapIntent = getTapIntent()
        val monoImage = MonochromaticImage.Builder(getIcon()).build()

        return when (type) {
            ComplicationType.SHORT_TEXT -> {
                ShortTextComplicationData.Builder(
                    PlainComplicationText.Builder("45s").build(),
                    PlainComplicationText.Builder("Rest Countdown").build()
                )
                    .setTitle(PlainComplicationText.Builder("REST").build())
                    .setMonochromaticImage(monoImage)
                    .setTapAction(tapIntent)
                    .build()
            }
            ComplicationType.RANGED_VALUE -> {
                RangedValueComplicationData.Builder(
                    value = 45f,
                    min = 0f,
                    max = 90f,
                    contentDescription = PlainComplicationText.Builder("Rest remaining").build()
                )
                    .setText(PlainComplicationText.Builder("45s").build())
                    .setTitle(PlainComplicationText.Builder("REST").build())
                    .setMonochromaticImage(monoImage)
                    .setTapAction(tapIntent)
                    .build()
            }
            ComplicationType.LONG_TEXT -> {
                LongTextComplicationData.Builder(
                    PlainComplicationText.Builder("Squat: 225 lb × 5").build(),
                    PlainComplicationText.Builder("Current Set").build()
                )
                    .setTitle(PlainComplicationText.Builder("Set 3 of 4").build())
                    .setMonochromaticImage(monoImage)
                    .setTapAction(tapIntent)
                    .build()
            }
            ComplicationType.MONOCHROMATIC_IMAGE -> {
                MonochromaticImageComplicationData.Builder(
                    monoImage,
                    PlainComplicationText.Builder("IronLog").build()
                )
                    .setTapAction(tapIntent)
                    .build()
            }
            else -> null
        }
    }

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val state = IronLogTileState.getState(this)
        val tapIntent = getTapIntent()
        val monoImage = MonochromaticImage.Builder(getIcon()).build()

        return when (request.complicationType) {
            ComplicationType.SHORT_TEXT -> {
                val (text, title) = if (state.hasActiveWorkout) {
                    if (state.isRestActive) {
                        "${state.restSecondsRemaining}s" to "REST"
                    } else {
                        state.setText.replace("Set ", "S") to state.exerciseName.take(4).uppercase()
                    }
                } else {
                    "LOG" to "IRON"
                }

                ShortTextComplicationData.Builder(
                    PlainComplicationText.Builder(text).build(),
                    PlainComplicationText.Builder(if (state.isRestActive) "Rest" else "Active set").build()
                )
                    .setTitle(PlainComplicationText.Builder(title).build())
                    .setMonochromaticImage(monoImage)
                    .setTapAction(tapIntent)
                    .build()
            }

            ComplicationType.RANGED_VALUE -> {
                if (state.hasActiveWorkout && state.isRestActive && state.totalRestSeconds > 0) {
                    val remaining = state.restSecondsRemaining.toFloat()
                    val total = state.totalRestSeconds.toFloat()

                    RangedValueComplicationData.Builder(
                        value = remaining,
                        min = 0f,
                        max = total,
                        contentDescription = PlainComplicationText.Builder("Rest Countdown").build()
                    )
                        .setText(PlainComplicationText.Builder("${state.restSecondsRemaining}s").build())
                        .setTitle(PlainComplicationText.Builder("REST").build())
                        .setMonochromaticImage(monoImage)
                        .setTapAction(tapIntent)
                        .build()
                } else if (state.hasActiveWorkout) {
                    RangedValueComplicationData.Builder(
                        value = 100f,
                        min = 0f,
                        max = 100f,
                        contentDescription = PlainComplicationText.Builder("Lift Set").build()
                    )
                        .setText(PlainComplicationText.Builder(state.setText.replace("Set ", "S")).build())
                        .setTitle(PlainComplicationText.Builder(state.exerciseName.take(4).uppercase()).build())
                        .setMonochromaticImage(monoImage)
                        .setTapAction(tapIntent)
                        .build()
                } else {
                    RangedValueComplicationData.Builder(
                        value = 0f,
                        min = 0f,
                        max = 100f,
                        contentDescription = PlainComplicationText.Builder("IronLog").build()
                    )
                        .setText(PlainComplicationText.Builder("LOG").build())
                        .setTitle(PlainComplicationText.Builder("IRON").build())
                        .setMonochromaticImage(monoImage)
                        .setTapAction(tapIntent)
                        .build()
                }
            }

            ComplicationType.LONG_TEXT -> {
                val (line1, line2) = if (state.hasActiveWorkout) {
                    if (state.isRestActive) {
                        "REST: ${state.restSecondsRemaining}s" to "Next: ${state.exerciseName} (${state.setText})"
                    } else {
                        "${state.exerciseName}: ${state.targetWeightText} × ${state.targetRepsText}" to state.setText
                    }
                } else {
                    "IronLog: Ready to train" to "Tap to start workout"
                }

                LongTextComplicationData.Builder(
                    PlainComplicationText.Builder(line1).build(),
                    PlainComplicationText.Builder("IronLog").build()
                )
                    .setTitle(PlainComplicationText.Builder(line2).build())
                    .setMonochromaticImage(monoImage)
                    .setTapAction(tapIntent)
                    .build()
            }

            ComplicationType.MONOCHROMATIC_IMAGE -> {
                MonochromaticImageComplicationData.Builder(
                    monoImage,
                    PlainComplicationText.Builder(if (state.hasActiveWorkout) state.exerciseName else "IronLog").build()
                )
                    .setTapAction(tapIntent)
                    .build()
            }

            else -> null
        }
    }
}
