# Freight Tracker Pro

Real-time freight tracking system with animated map, GitHub OAuth, and push notifications.

## Features

- Simulated shipment generation with animated routes
- Real tracking via Tracktry API (FedEx, UPS, DHL, etc.)
- Interactive Leaflet map with route visualization
- User authentication (email/password + GitHub OAuth)
- Push notifications for status changes
- Dark/light theme toggle
- Export shipments to CSV
- Search and filter shipments
- PWA - installable as app on phones

## Deploy to Render (Free)

### Step 1: Push to GitHub

1. Create a new repository on GitHub
2. Push this code to the repo:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/freight-tracker-pro.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign up (free)
2. Click **New +** > **Web Service**
3. Connect your GitHub repo
4. Fill in:
   - **Name**: freight-tracker-pro
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
5. Add these **Environment Variables**:
```
TRACKTRY_API_KEY=87uh-3uq0-yqxc-hfwxzuqput42
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
SESSION_SECRET=any_random_string_here
VAPID_PUBLIC=your_vapid_public_key
VAPID_PRIVATE=your_vapid_private_key
```
6. Click **Create Web Service**
7. Wait 2-3 minutes for deployment
8. Your app is live at `https://freight-tracker-pro.onrender.com`

### Step 3: Setup GitHub OAuth

1. Go to [github.com/settings/developers](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: Freight Tracker Pro
   - **Homepage URL**: `https://freight-tracker-pro.onrender.com`
   - **Authorization callback URL**: `https://freight-tracker-pro.onrender.com/api/auth/github/callback`
4. Copy the **Client ID** and **Client Secret**
5. Go to Render dashboard > your service > **Environment** tab
6. Update `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` with the values
7. Save - Render will auto-redeploy

## Run Locally

```bash
npm install
npm start
```

Open http://localhost:3000

## Tech Stack

- Express.js backend
- SQLite database
- Leaflet.js maps
- GitHub OAuth (Passport.js)
- Web Push notifications
- PWA (installable on phones)
