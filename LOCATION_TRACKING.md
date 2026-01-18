# Location Tracking Integration

## Overview

The Child Safety Detection app now captures and stores GPS location (latitude and longitude) when alerts are triggered, providing critical location data for emergency response.

## Changes Made

### 1. Database Schema Updates

**File**: `add-location-columns.sql`

Added three new columns to the `alerts` table:

- `latitude` (DOUBLE PRECISION) - GPS latitude coordinate
- `longitude` (DOUBLE PRECISION) - GPS longitude coordinate
- `location_accuracy` (DOUBLE PRECISION) - Accuracy of the location in meters

**To Apply**:

1. Open your Supabase SQL Editor: https://rlvgephkagtejlogudqo.supabase.co → SQL Editor
2. Run the `add-location-columns.sql` script
3. The script safely checks if columns exist before adding them

### 2. Type Definitions

**File**: [src/lib/supabase.ts](src/lib/supabase.ts)

Updated `AlertRecord` interface to include location fields:

```typescript
export interface AlertRecord {
  id?: string;
  detection_id?: string | null;
  type: "fall" | "violent_movement" | "abnormal_motion";
  confidence: number;
  timestamp: number;
  alert_triggered_at: string;
  latitude?: number | null; // ✨ NEW
  longitude?: number | null; // ✨ NEW
  location_accuracy?: number | null; // ✨ NEW
  device_info?: string;
  created_at?: string;
}
```

### 3. Database Service

**File**: [src/services/DatabaseService.ts](src/services/DatabaseService.ts)

The `DatabaseService.saveAlert()` method already had location tracking implemented:

- Uses browser's `navigator.geolocation.getCurrentPosition()` API
- Captures location with high accuracy enabled
- 5-second timeout for location acquisition
- Gracefully handles cases where location is unavailable
- Stores latitude, longitude, and accuracy in the database

### 4. Alert Manager

**File**: [src/utils/AlertManager.ts](src/utils/AlertManager.ts)

Updated `triggerAlert()` method to:

- Accept optional location parameter
- Log location data with alerts
- Support location sharing in production notifications

### 5. Main Application

**File**: [src/App.tsx](src/App.tsx)

Updated to clearly document that location is captured automatically by DatabaseService when high-confidence alerts (≥80%) are saved.

## How It Works

### Location Capture Flow

```
Alert Detected (confidence ≥ 80%)
         ↓
DatabaseService.saveAlert() called
         ↓
getCurrentLocation() requests GPS
         ↓
Browser prompts user for location permission (first time)
         ↓
Location captured (latitude, longitude, accuracy)
         ↓
Alert saved to database WITH location data
```

### Browser Permissions

The first time an alert is triggered, the browser will prompt the user:

```
"child-safety.app wants to know your location"
[Block] [Allow]
```

**Important**: Users must click "Allow" for location tracking to work.

### Location Settings

The location capture uses these settings:

```javascript
{
  enableHighAccuracy: true,  // Use GPS for best accuracy
  timeout: 5000,             // 5-second timeout
  maximumAge: 0              // Don't use cached location
}
```

## Data Stored

When an alert is triggered, the following location data is stored:

| Field               | Type   | Description        | Example   |
| ------------------- | ------ | ------------------ | --------- |
| `latitude`          | number | GPS latitude       | 37.7749   |
| `longitude`         | number | GPS longitude      | -122.4194 |
| `location_accuracy` | number | Accuracy in meters | 15.2      |

## Database Query Examples

### Get recent alerts with location

```sql
SELECT
  id,
  type,
  confidence,
  latitude,
  longitude,
  location_accuracy,
  alert_triggered_at,
  created_at
FROM alerts
WHERE latitude IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;
```

### Find alerts in specific area (within bounding box)

```sql
SELECT *
FROM alerts
WHERE latitude BETWEEN 37.7 AND 37.8
  AND longitude BETWEEN -122.5 AND -122.4
ORDER BY created_at DESC;
```

### Calculate distance between two alerts

```sql
SELECT
  a1.id as alert1_id,
  a2.id as alert2_id,
  earth_distance(
    ll_to_earth(a1.latitude, a1.longitude),
    ll_to_earth(a2.latitude, a2.longitude)
  ) as distance_meters
FROM alerts a1, alerts a2
WHERE a1.id < a2.id
  AND a1.latitude IS NOT NULL
  AND a2.latitude IS NOT NULL
LIMIT 10;
```

## Testing Location Tracking

### 1. Enable Location Services

Ensure location services are enabled on your device:

- **Mobile**: Settings → Privacy → Location Services → ON
- **Desktop**: System Preferences → Security & Privacy → Location Services → ON

### 2. Test in Browser

1. Start the app: `npm run dev`
2. Open in browser
3. Start monitoring
4. Trigger a test alert
5. Allow location permission when prompted
6. Check browser console for location logs:
   ```
   📍 Location obtained: {latitude: 37.7749, longitude: -122.4194, accuracy: 15.2}
   ✅ Alert saved successfully with location
   ```

### 3. Verify in Database

```sql
SELECT latitude, longitude, location_accuracy, created_at
FROM alerts
ORDER BY created_at DESC
LIMIT 1;
```

## Troubleshooting

### Location Not Captured

**Problem**: Alerts saved but latitude/longitude are NULL

**Solutions**:

1. **Check browser permission**: Browser DevTools → Application → Permissions → Geolocation should be "Allow"
2. **Enable location services**: Ensure device location services are ON
3. **Use HTTPS**: Geolocation API requires secure context (HTTPS or localhost)
4. **Check console**: Look for warnings like "⚠️ Could not get location"

### Location Accuracy Issues

**Problem**: Location accuracy is very low (> 100 meters)

**Solutions**:

1. **GPS signal**: Move outdoors or near windows for better GPS signal
2. **Wait longer**: Location accuracy improves over time
3. **High accuracy mode**: Already enabled in code (`enableHighAccuracy: true`)

### Browser Blocks Location

**Problem**: Browser doesn't prompt for permission

**Solutions**:

1. **Reset permission**: Browser Settings → Site Settings → Clear permissions
2. **Check blocked sites**: Ensure domain isn't in blocked list
3. **Try incognito**: Test in private browsing mode

## Privacy Considerations

### Data Protection

- Location data is only captured when high-confidence alerts are triggered (≥80%)
- Data is stored securely in Supabase with SSL encryption
- Users must explicitly grant location permission

### GDPR Compliance

If deploying in EU:

1. Add privacy policy explaining location data collection
2. Provide option to opt-out of location tracking
3. Allow users to delete their location data
4. Document data retention policies

### Location Accuracy

- Typical accuracy: 10-50 meters outdoors with GPS
- Indoor accuracy: 50-500 meters using WiFi/cell triangulation
- Accuracy is stored with each alert for transparency

## Future Enhancements

### Possible Improvements

1. **Geofencing**: Alert only when outside safe zones
2. **Location history**: Show map of all alert locations
3. **Reverse geocoding**: Convert coordinates to street addresses
4. **Real-time tracking**: Share live location during active monitoring
5. **Emergency contacts**: Auto-send location to designated contacts
6. **Offline caching**: Queue location data when offline

### Map Integration

Consider adding map visualization:

```typescript
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

<MapContainer center={[latitude, longitude]} zoom={13}>
  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
  <Marker position={[latitude, longitude]} />
</MapContainer>
```

## API Reference

### DatabaseService.saveAlert()

```typescript
static async saveAlert(
  detection: DetectionResult,
  detectionId?: string
): Promise<boolean>
```

Automatically captures and stores location when saving alerts:

- Returns `true` if alert saved successfully (with or without location)
- Returns `false` if database operation failed
- Logs location status to console

### Location Capture

```typescript
private static async getCurrentLocation(): Promise<{
  latitude: number;
  longitude: number;
  accuracy: number;
} | null>
```

Internal method that:

- Requests high-accuracy GPS location
- Times out after 5 seconds
- Returns `null` if location unavailable
- Never blocks alert saving

## Summary

✅ **Implemented**: Location tracking is now fully integrated
✅ **Automatic**: Captured automatically on high-confidence alerts
✅ **Graceful**: Works even when location is unavailable
✅ **Accurate**: Uses GPS for best possible accuracy
✅ **Logged**: All location operations logged to console
✅ **Stored**: Latitude, longitude, and accuracy in database

🔐 **Privacy**: Requires explicit user permission
📱 **Mobile-first**: Optimized for mobile device GPS
🌍 **Production-ready**: Ready for emergency response integration
