// File: android/app/src/main/java/com/ironlog/app/IronLogContentProvider.java
package com.ironlog.app;

import android.content.ContentProvider;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.content.UriMatcher;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

public class IronLogContentProvider extends ContentProvider {
    public static final String AUTHORITY = "com.ironlog.app.provider";
    private static final int WORKOUTS = 100;
    private static final int RECOVERY = 200;
    private static final int PRS = 300;
    private static final int TODAY_PLAN = 400;
    private static final UriMatcher URI_MATCHER = new UriMatcher(UriMatcher.NO_MATCH);

    static {
        URI_MATCHER.addURI(AUTHORITY, "workouts", WORKOUTS);
        URI_MATCHER.addURI(AUTHORITY, "recovery", RECOVERY);
        URI_MATCHER.addURI(AUTHORITY, "prs", PRS);
        URI_MATCHER.addURI(AUTHORITY, "today_plan", TODAY_PLAN);
    }

    private IronLogDbHelper dbHelper;

    public static class IronLogDbHelper extends SQLiteOpenHelper {
        private static final String DB_NAME = "ironlog_ecosystem.db";
        private static final int DB_VERSION = 2;

        public IronLogDbHelper(Context context) {
            super(context, DB_NAME, null, DB_VERSION);
        }

        @Override
        public void onCreate(SQLiteDatabase db) {
            db.execSQL("CREATE TABLE IF NOT EXISTS workouts (" +
                "id TEXT PRIMARY KEY, title TEXT, startTime TEXT, durationSeconds INTEGER, " +
                "totalVolumeLb REAL, totalSets INTEGER, avgHr INTEGER, maxHr INTEGER, " +
                "dailyStrain INTEGER, atGym INTEGER, prsHit INTEGER, updatedAt TEXT)");
            db.execSQL("CREATE TABLE IF NOT EXISTS recovery (" +
                "date TEXT PRIMARY KEY, recoveryScore INTEGER, dailyStrain INTEGER, " +
                "fatiguedMuscles TEXT, readyMuscles TEXT, deloadRecommended INTEGER, updatedAt TEXT)");
            db.execSQL("CREATE TABLE IF NOT EXISTS prs (" +
                "id TEXT PRIMARY KEY, exerciseName TEXT, weightLb REAL, reps INTEGER, " +
                "estimated1Rm REAL, achievedAt TEXT)");
            // Added in DB version 2. Read-only for Bujo Tasks; exercisesJson is a JSON array of
            // { name, sets, reps, weightLb }, empty on a rest day.
            db.execSQL("CREATE TABLE IF NOT EXISTS today_plan (" +
                "date TEXT PRIMARY KEY, routineName TEXT, programName TEXT, week INTEGER, day INTEGER, " +
                "exercisesJson TEXT, updatedAt TEXT)");
        }

        @Override
        public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
            onCreate(db);
        }
    }

    @Override
    public boolean onCreate() {
        dbHelper = new IronLogDbHelper(getContext());
        return true;
    }

    @Nullable
    @Override
    public Cursor query(@NonNull Uri uri, @Nullable String[] projection, @Nullable String selection,
                        @Nullable String[] selectionArgs, @Nullable String sortOrder) {
        SQLiteDatabase db = dbHelper.getReadableDatabase();
        return db.query(resolveTable(uri), projection, selection, selectionArgs, null, null, sortOrder);
    }

    @Nullable
    @Override
    public Uri insert(@NonNull Uri uri, @Nullable ContentValues values) {
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        long rowId = db.insertWithOnConflict(resolveTable(uri), null, values, SQLiteDatabase.CONFLICT_REPLACE);
        if (getContext() != null) getContext().getContentResolver().notifyChange(uri, null);
        return ContentUris.withAppendedId(uri, rowId);
    }

    @Override
    public int update(@NonNull Uri uri, @Nullable ContentValues values, @Nullable String selection,
                      @Nullable String[] selectionArgs) {
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        return db.update(resolveTable(uri), values, selection, selectionArgs);
    }

    @Override
    public int delete(@NonNull Uri uri, @Nullable String selection, @Nullable String[] selectionArgs) {
        SQLiteDatabase db = dbHelper.getWritableDatabase();
        return db.delete(resolveTable(uri), selection, selectionArgs);
    }

    @Nullable
    @Override
    public String getType(@NonNull Uri uri) {
        return "vnd.android.cursor.dir/vnd.com.ironlog.app." + resolveTable(uri);
    }

    private String resolveTable(Uri uri) {
        switch (URI_MATCHER.match(uri)) {
            case RECOVERY: return "recovery";
            case PRS: return "prs";
            case TODAY_PLAN: return "today_plan";
            case WORKOUTS:
            default: return "workouts";
        }
    }
}
