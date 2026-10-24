package com.ironlog.app;

import android.util.Log;
import androidx.annotation.NonNull;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.android.gms.wearable.MessageClient;
import com.google.android.gms.wearable.MessageEvent;
import com.google.android.gms.wearable.Node;
import com.google.android.gms.wearable.Wearable;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.List;

@CapacitorPlugin(name = "WearableBridge")
public class WearableBridgePlugin extends Plugin implements MessageClient.OnMessageReceivedListener {
    private static final String TAG = "WearableBridgePlugin";

    public static final String PATH_SET_LOGGED = "/ironlog/set_logged";
    public static final String PATH_WORKOUT_FINISHED = "/ironlog/workout_finished";
    public static final String PATH_REQUEST_ACTIVE = "/ironlog/request_active";
    public static final String PATH_ACTIVE_WORKOUT = "/ironlog/active_workout";

    @Override
    public void load() {
        super.load();
        try {
            Wearable.getMessageClient(getContext()).addListener(this);
            Log.i(TAG, "WearableBridgePlugin message listener registered.");
        } catch (Exception e) {
            Log.w(TAG, "Failed to register Wearable listener: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            Wearable.getMessageClient(getContext()).removeListener(this);
        } catch (Exception ignored) {}
        super.handleOnDestroy();
    }

    @Override
    public void onMessageReceived(@NonNull MessageEvent messageEvent) {
        String path = messageEvent.getPath();
        byte[] data = messageEvent.getData();
        String jsonStr = data != null ? new String(data, StandardCharsets.UTF_8) : "{}";
        Log.i(TAG, "Message received from watch: " + path + " -> " + jsonStr);

        try {
            JSONObject json = new JSONObject(jsonStr);
            JSObject jsObj = JSObject.fromJSONObject(json);

            if (PATH_SET_LOGGED.equals(path)) {
                notifyListeners("watchSetLogged", jsObj);
            } else if (PATH_WORKOUT_FINISHED.equals(path)) {
                notifyListeners("watchWorkoutFinished", jsObj);
            } else if (PATH_REQUEST_ACTIVE.equals(path)) {
                notifyListeners("watchRequestedActive", jsObj);
            }
        } catch (Exception e) {
            Log.w(TAG, "Error handling watch message on " + path + ": " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendActiveWorkoutToWatch(PluginCall call) {
        String payload = call.getString("payload", "{}");
        byte[] data = payload.getBytes(StandardCharsets.UTF_8);

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                int sent = 0;
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext()).sendMessage(node.getId(), PATH_ACTIVE_WORKOUT, data));
                    sent++;
                }
                JSObject ret = new JSObject();
                ret.put("sentToNodes", sent);
                call.resolve(ret);
            } catch (Exception e) {
                Log.w(TAG, "Failed sending active workout to watch: " + e.getMessage());
                call.reject("Failed sending to watch: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void sendSetToWatch(PluginCall call) {
        String payload = call.getString("payload", "{}");
        byte[] data = payload.getBytes(StandardCharsets.UTF_8);

        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                for (Node node : nodes) {
                    Tasks.await(Wearable.getMessageClient(getContext()).sendMessage(node.getId(), PATH_SET_LOGGED, data));
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed broadcasting set to watch: " + e.getMessage());
            }
        }).start();
    }

    @PluginMethod
    public void getConnectedWatchCount(PluginCall call) {
        new Thread(() -> {
            try {
                List<Node> nodes = Tasks.await(Wearable.getNodeClient(getContext()).getConnectedNodes());
                JSObject ret = new JSObject();
                ret.put("count", nodes.size());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Error querying watch nodes: " + e.getMessage());
            }
        }).start();
    }
}
