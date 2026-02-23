# Railway Deployment - Quick Start

## ✅ Pre-Deployment Checklist

- [ ] Code pushed to GitHub
- [ ] MongoDB Atlas account created (free tier)
- [ ] MongoDB connection string ready
- [ ] Railway account created (no credit card needed)

## 🚀 Quick Deploy Steps

### 1️⃣ Push to GitHub (if not done)

```bash
git init
git add .
git commit -m "Deploy to Railway"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2️⃣ Deploy on Railway

**Visit:** https://railway.app

1. Click "**Start a New Project**"
2. Select "**Deploy from GitHub repo**"
3. Choose your repository
4. Deploy 3 services separately:

---

### 📦 Service 1: Backend API

**Settings:**
- Root Directory: `server`
- Auto-detect will handle build/start commands

**Environment Variables:**
```
NODE_ENV=production
MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING
JWT_SECRET=create-a-random-secure-string-here
CLIENT_URL=FRONTEND_URL_WILL_ADD_LATER
GEOCODING_API_URL=https://nominatim.openstreetmap.org/reverse
DUPLICATE_RADIUS_METERS=100
DUPLICATE_TIME_WINDOW_HOURS=24
MAX_IMAGE_SIZE_MB=5
COMPRESSED_IMAGE_QUALITY=80
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_DIR=./uploads
```

✅ **Deploy** → Copy the URL

---

### 🤖 Service 2: AI Model

**Settings:**
- Root Directory: `ai_model`
- Auto-detect will handle build/start commands

**Environment Variables:**
```
PYTHONUNBUFFERED=1
```

✅ **Deploy** → Copy the URL

---

### 🎨 Service 3: Frontend

**Settings:**
- Root Directory: `client`
- Auto-detect will handle build/start commands

**Environment Variables:**
```
VITE_API_URL=YOUR_BACKEND_URL_FROM_STEP_1
```

✅ **Deploy** → Copy the URL

---

### 🔄 Final Step: Update Backend with Frontend URL

Go back to Backend service → Add/Update:
```
CLIENT_URL=YOUR_FRONTEND_URL_FROM_STEP_3
```

Railway will auto-redeploy.

---

## 🎉 Done!

Your app is live at the Railway URLs!

### Test Your Deployment:
- Frontend: Visit the frontend URL
- Backend: Visit `{backend-url}/health`
- AI Model: Visit `{ai-model-url}/docs`

---

## 📊 Monitor Your Services

Railway Dashboard shows:
- Logs (real-time)
- Metrics (CPU, RAM, Network)
- Deployments history
- Environment variables

---

## 🆓 Free Tier

- **$5/month credit** (renewable)
- More than enough for development/testing
- Upgrade only when needed

---

## ❓ Need Help?

See [RAILWAY_DEPLOYMENT.md](RAILWAY_DEPLOYMENT.md) for detailed guide.
