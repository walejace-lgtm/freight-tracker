# Freight Tracker Pro - Development Notes

## Project Overview
Real-time freight tracking system with animated map. Generates tracking codes for FedEx, UPS, etc. Uses Tracktry API for real tracking.

## Architecture
- **Backend**: Express.js server (`server.js`) - proxies Tracktry API calls, SQLite database, auth, notifications
- **Frontend**: Single-page HTML app with Leaflet map, dark glassmorphism UI
- **Database**: SQLite via better-sqlite3 (`data/freight.db`)
- **PWA**: Service worker, manifest for app-like install on phones

## API
- **Tracktry API Key**: `87uh-3uq0-yqxc-hfwxzuqput42`
- **VAPID Public**: `BMKTh9JfvwSJ7YP-4TZveomzVbIOZ3egpzm0EAOo9RewmSdhPMKkm9a-B6kohmLPyiVakKgBNNhe7pBgbm67NbI`
- Endpoints: `/api/detect`, `/api/track`, `/api/track/:id`, `/api/carriers`

## Features Implemented
- [x] Simulated shipment generation with random routes
- [x] Real tracking via Tracktry API
- [x] Leaflet map with animated markers
- [x] Route visualization (origin, destination, stops, current location)
- [x] Shipment detail panel with progress bar
- [x] Route timeline with event history
- [x] Stats dashboard (total, active, in-transit, delivered)
- [x] Bulk shipment generation
- [x] Delete shipments
- [x] Auto-refresh toggle (30s interval)
- [x] PWA manifest + service worker for app install
- [x] Mode toggle (Simulated / Real Tracking)
- [x] Carrier selector for real tracking
- [x] City coordinates database for map rendering (100+ cities)
- [x] Custom SVG app icons
- [x] User authentication (register/login/logout)
- [x] GitHub OAuth login
- [x] SQLite database for persistent storage
- [x] Push notifications for status changes
- [x] Notification bell with unread count
- [x] Search/filter shipments
- [x] Dark/light theme toggle
- [x] Export shipments to CSV
- [x] User profile menu

## Database Schema
- `users` - user accounts (id, username, email, password)
- `sessions` - auth sessions (id, user_id, token)
- `shipments` - saved shipments (id, user_id, tracking_number, carrier, etc.)
- `push_subscriptions` - push notification subscriptions
- `notifications` - notification history

## What Was Being Worked On
- All major features implemented

## Pending / Could Improve
- Convert to React Native / Capacitor for native app
- Email notifications
- Shipment sharing via public link
- Real-time WebSocket updates
- Map clustering for many shipments
- Multi-language support
