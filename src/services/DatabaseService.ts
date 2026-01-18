/**
 * Database Service
 *
 * Handles all database operations for storing detection events and alerts
 */

import { supabase } from "../lib/supabase";
import type { DetectionResult } from "../types/motion";
import type { DetectionRecord, AlertRecord } from "../lib/supabase";

export class DatabaseService {
  /**
   * Save a detection event to the database
   */
  static async saveDetection(
    detection: DetectionResult,
  ): Promise<string | null> {
    if (!detection.type) return null;

    try {
      const record: DetectionRecord = {
        type: detection.type,
        confidence: detection.confidence,
        timestamp: detection.timestamp,
        features: detection.features,
        device_info: navigator.userAgent,
      };

      console.log("🔄 Sending detection to Supabase...", record);

      const { data, error } = await supabase
        .from("detections")
        .insert(record)
        .select()
        .single();

      if (error) {
        console.error("❌ Supabase error saving detection:", error);
        console.error("   Error code:", error.code);
        console.error("   Error message:", error.message);

        if (
          error.message.includes("relation") ||
          error.message.includes("does not exist")
        ) {
          console.error(
            "   💡 Fix: Run supabase-schema.sql in Supabase SQL Editor!",
          );
          console.error(
            "   Go to: https://rlvgephkagtejlogudqo.supabase.co → SQL Editor",
          );
        } else if (error.code === "42501") {
          console.error(
            "   💡 Fix: RLS policies are blocking. Run the FULL SQL schema including policies!",
          );
        }

        return null;
      }

      console.log("✅ Detection saved successfully:", data);
      return data?.id || null;
    } catch (error) {
      console.error("❌ Exception saving detection:", error);
      console.error(
        "   This might be a network issue or Supabase is unreachable",
      );
      return null;
    }
  }

  /**
   * Record audio for 5 seconds
   */
  private static async recordAudio(): Promise<Blob | null> {
    return new Promise(async (resolve) => {
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        const mediaRecorder = new MediaRecorder(stream);
        const audioChunks: BlobPart[] = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          // Stop all tracks to release microphone
          stream.getTracks().forEach((track) => track.stop());

          const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
          console.log("🎤 Audio recorded:", audioBlob.size, "bytes");
          resolve(audioBlob);
        };

        mediaRecorder.onerror = (error) => {
          console.error("❌ Recording error:", error);
          stream.getTracks().forEach((track) => track.stop());
          resolve(null);
        };

        // Start recording
        mediaRecorder.start();
        console.log("🎤 Recording started for 5 seconds...");

        // Stop after 5 seconds
        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
          }
        }, 5000);
      } catch (error) {
        console.error("❌ Could not access microphone:", error);
        resolve(null);
      }
    });
  }

  /**
   * Upload audio to Supabase Storage
   */
  private static async uploadAudio(audioBlob: Blob): Promise<string | null> {
    try {
      const fileName = `alert-audio-${Date.now()}.webm`;
      const filePath = `alerts/${fileName}`;

      console.log("📤 Uploading audio to Supabase Storage...");

      const { error } = await supabase.storage
        .from("audio-recordings")
        .upload(filePath, audioBlob, {
          contentType: "audio/webm",
          upsert: false,
        });

      if (error) {
        console.error("❌ Error uploading audio:", error);
        return null;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("audio-recordings").getPublicUrl(filePath);

      console.log("✅ Audio uploaded successfully:", publicUrl);
      return publicUrl;
    } catch (error) {
      console.error("❌ Exception uploading audio:", error);
      return null;
    }
  }

  /**
   * Get current location
   */
  private static async getCurrentLocation(): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn("⚠️ Geolocation not supported");
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          console.log("📍 Location obtained:", position.coords);
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (error) => {
          console.warn("⚠️ Could not get location:", error.message);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        },
      );
    });
  }

  /**
   * Save an alert event to the database with location and audio recording
   */
  static async saveAlert(
    detection: DetectionResult,
    detectionId?: string,
  ): Promise<boolean> {
    if (!detection.type) return false;

    try {
      // Record 5 seconds of audio (this also adds a 5-second delay between alerts)
      console.log("🎤 Starting audio recording...");
      const audioBlob = await this.recordAudio();

      // Upload audio to Supabase Storage
      let audioUrl: string | null = null;
      if (audioBlob) {
        audioUrl = await this.uploadAudio(audioBlob);
      }

      // Get current location
      const location = await this.getCurrentLocation();

      const record: any = {
        detection_id: detectionId || null,
        type: detection.type,
        confidence: detection.confidence,
        timestamp: detection.timestamp,
        alert_triggered_at: new Date().toISOString(),
        device_info: navigator.userAgent,
        audio_url: audioUrl,
      };

      // Add location if available
      if (location) {
        record.latitude = location.latitude;
        record.longitude = location.longitude;
        record.location_accuracy = location.accuracy;
        console.log("📍 Alert includes location:", {
          lat: location.latitude,
          lng: location.longitude,
          accuracy: location.accuracy,
        });
      } else {
        console.warn("⚠️ Alert saved without location data");
      }

      console.log("🔄 Sending alert to Supabase...", record);

      const { error } = await supabase.from("alerts").insert(record);

      if (error) {
        console.error("❌ Supabase error saving alert:", error);
        console.error("   Error code:", error.code);
        console.error("   Error message:", error.message);

        if (
          error.message.includes("relation") ||
          error.message.includes("does not exist")
        ) {
          console.error(
            "   💡 Fix: Run supabase-schema.sql in Supabase SQL Editor!",
          );
        } else if (error.code === "42501") {
          console.error(
            "   💡 Fix: RLS policies are blocking. Run the FULL SQL schema!",
          );
        }

        return false;
      }

      console.log(
        "✅ Alert saved successfully with location and audio recording",
      );
      return true;
    } catch (error) {
      console.error("❌ Exception saving alert:", error);
      return false;
    }
  }

  /**
   * Get recent detections
   */
  static async getRecentDetections(
    limit: number = 50,
  ): Promise<DetectionRecord[]> {
    try {
      const { data, error } = await supabase
        .from("detections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching detections:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Exception fetching detections:", error);
      return [];
    }
  }

  /**
   * Get recent alerts
   */
  static async getRecentAlerts(limit: number = 50): Promise<AlertRecord[]> {
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error fetching alerts:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Exception fetching alerts:", error);
      return [];
    }
  }

  /**
   * Get detection statistics
   */
  static async getStatistics(): Promise<{
    totalDetections: number;
    totalAlerts: number;
    detectionsByType: Record<string, number>;
    alertsByType: Record<string, number>;
  }> {
    try {
      // Get total detections
      const { count: totalDetections } = await supabase
        .from("detections")
        .select("*", { count: "exact", head: true });

      // Get total alerts
      const { count: totalAlerts } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true });

      // Get detections by type
      const { data: detectionsData } = await supabase
        .from("detections")
        .select("type");

      const detectionsByType: Record<string, number> = {};
      detectionsData?.forEach((d) => {
        detectionsByType[d.type] = (detectionsByType[d.type] || 0) + 1;
      });

      // Get alerts by type
      const { data: alertsData } = await supabase.from("alerts").select("type");

      const alertsByType: Record<string, number> = {};
      alertsData?.forEach((a) => {
        alertsByType[a.type] = (alertsByType[a.type] || 0) + 1;
      });

      return {
        totalDetections: totalDetections || 0,
        totalAlerts: totalAlerts || 0,
        detectionsByType,
        alertsByType,
      };
    } catch (error) {
      console.error("Exception fetching statistics:", error);
      return {
        totalDetections: 0,
        totalAlerts: 0,
        detectionsByType: {},
        alertsByType: {},
      };
    }
  }

  /**
   * Delete old records (for cleanup)
   */
  static async deleteOldRecords(daysOld: number = 30): Promise<boolean> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      // Delete old detections
      const { error: detectionsError } = await supabase
        .from("detections")
        .delete()
        .lt("created_at", cutoffDate.toISOString());

      // Delete old alerts
      const { error: alertsError } = await supabase
        .from("alerts")
        .delete()
        .lt("created_at", cutoffDate.toISOString());

      if (detectionsError || alertsError) {
        console.error(
          "Error deleting old records:",
          detectionsError || alertsError,
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Exception deleting old records:", error);
      return false;
    }
  }
}
