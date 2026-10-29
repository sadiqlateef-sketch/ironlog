package com.ironlog.watch

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DeviceParametersBuilders
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material.ChipColors
import androidx.wear.protolayout.material.Colors
import androidx.wear.protolayout.material.CompactChip
import androidx.wear.protolayout.material.Text
import androidx.wear.protolayout.material.Typography
import androidx.wear.protolayout.material.layouts.PrimaryLayout
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class WorkoutTileService : TileService() {

    companion object {
        private const val RESOURCES_VERSION = "1"
        private const val COLOR_ACCENT = 0xFF3D63EE.toInt()
        private const val COLOR_AMBER = 0xFFF5B544.toInt()
        private const val COLOR_TEXT = 0xFFF5F7FF.toInt()
        private const val COLOR_MUTED = 0xFFA3AACB.toInt()
        private const val COLOR_CARD = 0xFF1A1E36.toInt()
    }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest
    ): ListenableFuture<ResourceBuilders.Resources> {
        return Futures.immediateFuture(
            ResourceBuilders.Resources.Builder()
                .setVersion(RESOURCES_VERSION)
                .build()
        )
    }

    override fun onTileRequest(
        requestParams: RequestBuilders.TileRequest
    ): ListenableFuture<TileBuilders.Tile> {
        val state = IronLogTileState.getState(this)
        val deviceParams = requestParams.deviceConfiguration

        val clickAction = ModifiersBuilders.Clickable.Builder()
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(
                        ActionBuilders.AndroidActivity.Builder()
                            .setPackageName(packageName)
                            .setClassName(MainActivity::class.java.name)
                            .build()
                    )
                    .build()
            )
            .build()

        val rootModifier = ModifiersBuilders.Modifiers.Builder()
            .setClickable(clickAction)
            .build()

        val layout = if (state.hasActiveWorkout) {
            buildActiveWorkoutLayout(state, deviceParams, clickAction)
        } else {
            buildIdleLayout(deviceParams, clickAction)
        }

        val timelineEntry = TimelineBuilders.TimelineEntry.Builder()
            .setLayout(
                LayoutElementBuilders.Layout.Builder()
                    .setRoot(
                        LayoutElementBuilders.Box.Builder()
                            .setModifiers(rootModifier)
                            .addContent(layout)
                            .build()
                    )
                    .build()
            )
            .build()

        val timeline = TimelineBuilders.Timeline.Builder()
            .addTimelineEntry(timelineEntry)
            .build()

        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                .setTileTimeline(timeline)
                .setFreshnessIntervalMillis(5_000)
                .build()
        )
    }

    private fun buildActiveWorkoutLayout(
        state: TileStateData,
        deviceParams: DeviceParametersBuilders.DeviceParameters,
        clickAction: ModifiersBuilders.Clickable
    ): LayoutElementBuilders.LayoutElement {
        val labelText = if (state.heartRate > 0) {
            "${state.workoutName} · ${state.heartRate} bpm"
        } else {
            state.workoutName
        }

        val primaryLabel = Text.Builder(this, labelText)
            .setTypography(Typography.TYPOGRAPHY_CAPTION1)
            .setColor(argb(COLOR_MUTED))
            .build()

        val centerColumn = LayoutElementBuilders.Column.Builder()

        if (state.isRestActive) {
            val restTitle = Text.Builder(this, "REST")
                .setTypography(Typography.TYPOGRAPHY_CAPTION2)
                .setColor(argb(COLOR_AMBER))
                .build()

            val restCountdown = Text.Builder(this, "${state.restSecondsRemaining}s")
                .setTypography(Typography.TYPOGRAPHY_DISPLAY2)
                .setColor(argb(COLOR_TEXT))
                .build()

            val nextSet = Text.Builder(this, "${state.exerciseName} · ${state.setText}")
                .setTypography(Typography.TYPOGRAPHY_CAPTION1)
                .setColor(argb(COLOR_MUTED))
                .build()

            centerColumn
                .addContent(restTitle)
                .addContent(restCountdown)
                .addContent(nextSet)
        } else {
            val exerciseTitle = Text.Builder(this, state.exerciseName)
                .setTypography(Typography.TYPOGRAPHY_TITLE3)
                .setColor(argb(COLOR_TEXT))
                .build()

            val setInfo = Text.Builder(this, state.setText)
                .setTypography(Typography.TYPOGRAPHY_CAPTION1)
                .setColor(argb(COLOR_MUTED))
                .build()

            val targetInfo = Text.Builder(this, "${state.targetWeightText} × ${state.targetRepsText}")
                .setTypography(Typography.TYPOGRAPHY_BODY1)
                .setColor(argb(COLOR_ACCENT))
                .build()

            centerColumn
                .addContent(exerciseTitle)
                .addContent(setInfo)
                .addContent(targetInfo)
        }

        val chipColors = ChipColors(argb(COLOR_ACCENT), argb(0xFFFFFFFF.toInt()))
        val bottomChip = CompactChip.Builder(this, "OPEN APP ▶", clickAction, deviceParams)
            .setChipColors(chipColors)
            .build()

        return PrimaryLayout.Builder(deviceParams)
            .setPrimaryLabelTextContent(primaryLabel)
            .setContent(centerColumn.build())
            .setPrimaryChipContent(bottomChip)
            .build()
    }

    private fun buildIdleLayout(
        deviceParams: DeviceParametersBuilders.DeviceParameters,
        clickAction: ModifiersBuilders.Clickable
    ): LayoutElementBuilders.LayoutElement {
        val primaryLabel = Text.Builder(this, "IronLog")
            .setTypography(Typography.TYPOGRAPHY_CAPTION1)
            .setColor(argb(COLOR_MUTED))
            .build()

        val centerColumn = LayoutElementBuilders.Column.Builder()
            .addContent(
                Text.Builder(this, "Ready to Train")
                    .setTypography(Typography.TYPOGRAPHY_TITLE3)
                    .setColor(argb(COLOR_TEXT))
                    .build()
            )
            .addContent(
                Text.Builder(this, "Tap to start routine")
                    .setTypography(Typography.TYPOGRAPHY_CAPTION1)
                    .setColor(argb(COLOR_MUTED))
                    .build()
            )
            .build()

        val chipColors = ChipColors(argb(COLOR_CARD), argb(COLOR_TEXT))
        val bottomChip = CompactChip.Builder(this, "START ▶", clickAction, deviceParams)
            .setChipColors(chipColors)
            .build()

        return PrimaryLayout.Builder(deviceParams)
            .setPrimaryLabelTextContent(primaryLabel)
            .setContent(centerColumn)
            .setPrimaryChipContent(bottomChip)
            .build()
    }
}
