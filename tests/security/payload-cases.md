# Linux Island — IPC Security & Malformed Payload Test Cases (M4-18)

## Overview

Linux Island Core and Extension enforce strict input validation, type safety, and memory bounds across all D-Bus IPC interfaces.

## 1. D-Bus Settings Payloads (`UpdateSettings`)

| Test Case | Injected Payload | Expected Result | Verified Behavior |
|---|---|---|---|
| **Unknown Setting Key** | `{"unknownKey": 123}` | Rejected with `org.freedesktop.DBus.Error.InvalidArgument` | Entire patch rejected, no state change |
| **Wrong Value Type (String for Bool)** | `{"animationEnabled": "true"}` | Rejected without silent string coercion | Strict `QMetaType::Bool` type checking |
| **Wrong Value Type (Bool for String)** | `{"theme": true}` | Rejected | Strict `QMetaType::QString` type checking |
| **Unapproved Theme Enum** | `{"theme": "neon"}` | Rejected | Only `system`, `dark`, `light` allowed |
| **Unapproved Capsule Size** | `{"capsuleSize": "huge"}` | Rejected | Only `small`, `medium`, `large` allowed |
| **Unapproved Display Mode** | `{"displayMode": "floating"}` | Rejected in v0.1 | Only `dynamic` mode supported |
| **Excessive Payload Entries** | 35 entries (`key_0` .. `key_34`) | Rejected (entry limit 32) | Checked before deserialization |
| **Oversized Payload String** | > 16 KiB serialized patch | Rejected (size limit 16 KiB) | Memory exhaustion prevented |
| **Oversized Player ID** | > 256 bytes string | Rejected | String boundary enforced |

## 2. MPRIS Normalizer Payloads

| Test Case | Injected Payload | Expected Result | Verified Behavior |
|---|---|---|---|
| **Remote HTTP/HTTPS Artwork URL** | `https://remote.example.com/art.png` | Stripped to empty string | Zero remote network requests made |
| **Arbitrary Schemes** | `ftp://`, `data:`, `gopher://` | Stripped to empty string | Only vetted local `file://` accepted |
| **Oversized Title / Artist** | 5,000 UTF-8 bytes string | Truncated to max 2048 bytes | Bounded before sending to GNOME Shell |
| **Negative Duration / Position** | `-12345LL`, `-500LL` | Clamped to `0` | Non-negative 64-bit integer enforced |
| **NaN / Inf Playback Rate** | `NaN`, `+Inf`, `0.0`, `-2.5` | Fallback to `1.0` | Finite positive double enforced |
| **Unknown Playback Status** | `"Exploding"`, `"Random"` | Fallback to `"Stopped"` | Validated enum string |

## 3. Event Storms & Concurrency

- **Rapid Duplicate Signals:** Duplicate identical `PropertiesChanged` events are coalesced; `mediaChanged` emitted only on effective difference.
- **In-flight Control Guard:** Rapid repeated clicks on `PlayPause`/`Next`/`Previous` are guarded by in-flight boolean flags to prevent queue flooding.
- **Service Owner Disconnect:** In-flight cancellables cancelled immediately upon Core service disappearance or extension `disable()`.
