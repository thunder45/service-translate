# Service Translate - macOS Audio Capture

Simple username/password login - no JWT tokens needed!

## Setup

```bash
cd src/capture
./setup.sh
npm run dev
```

## First Time Setup

1. Get configuration from backend deployment:
   - WebSocket Endpoint
   - User Pool ID
   - Client ID
   - Region

2. Create admin user (one-time):
```bash
cd ../backend
./create-admin.sh admin@church.com <UserPoolId>
```

## Usage

1. **Launch app**: `npm run dev`
2. **Click "⚙️ Configuration"** and enter:
   - WebSocket Endpoint (from deployment)
   - User Pool ID (from deployment)
   - Client ID (from deployment)
   - Region (e.g., us-east-1)
3. **Login** with username and password
4. **First login**: Change temporary password
5. **Start Session**: Enter optional session name
6. **Share QR code** with congregation

That's it! No JWT tokens to manage.

## For Church Admins

Just remember:
- **Username**: Your email
- **Password**: Your password

The app handles all the technical stuff automatically!
