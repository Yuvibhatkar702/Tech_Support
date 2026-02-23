# Free Deployment Guide (No Credit Card Required)

## 🎯 Overview

Deploy your Grievance Portal for **completely free**:
- **Frontend** → Vercel (Free, No CC)
- **Backend** → Render Free Tier (Manual Deploy)
- **AI Model** → Render Free Tier (Manual Deploy)
- **Database** → MongoDB Atlas (Free Tier)

---

## 📋 Prerequisites

- [x] GitHub account
- [x] Code pushed to GitHub repository
- [x] Vercel account (sign up free at https://vercel.com)
- [x] Render account (sign up free at https://render.com)
- [x] MongoDB Atlas account (sign up free at https://www.mongodb.com/cloud/atlas)

---

## Part 1: Database Setup (MongoDB Atlas)

### Step 1: Create Free MongoDB Cluster

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up / Log in (free, no CC required)
3. Click "**Build a Database**"
4. Select "**FREE**" tier (M0 Sandbox)
5. Choose a cloud provider and region (AWS, closest to you)
6. Click "**Create**"

### Step 2: Create Database User

1. Go to "**Database Access**" (left sidebar)
2. Click "**Add New Database User**"
3. Username: `grievance_admin`
4. Password: Generate a secure password (save it!)
5. Database User Privileges: "**Read and write to any database**"
6. Click "**Add User**"

### Step 3: Whitelist All IPs

1. Go to "**Network Access**" (left sidebar)
2. Click "**Add IP Address**"
3. Click "**Allow Access from Anywhere**"
4. IP Address: `0.0.0.0/0`
5. Click "**Confirm**"

### Step 4: Get Connection String

1. Go to "**Database**" → Click "**Connect**"
2. Choose "**Connect your application**"
3. Copy the connection string:
   ```
   mongodb+srv://grievance_admin:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. Replace `<password>` with your actual password
5. Add database name: `mongodb+srv://grievance_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/grievance_portal?retryWrites=true&w=majority`

✅ **Save this connection string** - you'll need it later!

---

## Part 2: Backend Deployment (Render - Manual)

### Step 1: Create Backend Web Service

1. Go to https://render.com/dashboard
2. Click "**New +**" → "**Web Service**"
3. Connect your GitHub repository
4. **Service Name**: `grievance-portal-backend`
5. **Root Directory**: `server`
6. **Environment**: `Node`
7. **Build Command**: `npm install`
8. **Start Command**: `node server.js`
9. **Instance Type**: `Free`

### Step 2: Add Environment Variables

Click "**Advanced**" → "**Add Environment Variable**":

```env
NODE_ENV=production
PORT=10000
MONGODB_URI=mongodb+srv://grievance_admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/grievance_portal?retryWrites=true&w=majority
JWT_SECRET=your-super-secret-jwt-key-change-this-random-string-12345
CLIENT_URL=FRONTEND_URL_WILL_ADD_LATER
WHATSAPP_API_URL=https://graph.facebook.com/v18.0
GEOCODING_API_URL=https://nominatim.openstreetmap.org/reverse
DUPLICATE_RADIUS_METERS=100
DUPLICATE_TIME_WINDOW_HOURS=24
MAX_IMAGE_SIZE_MB=5
COMPRESSED_IMAGE_QUALITY=80
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
UPLOAD_DIR=./uploads
```

**Important**: 
- Replace `MONGODB_URI` with your actual connection string from Part 1
- Generate a random string for `JWT_SECRET`
- Leave `CLIENT_URL` as placeholder for now

### Step 3: Deploy Backend

1. Click "**Create Web Service**"
2. Wait for deployment (5-10 minutes)
3. Once deployed, copy the URL: `https://grievance-portal-backend.onrender.com`

✅ **Save this backend URL** - you'll need it for frontend!

---

## Part 3: AI Model Deployment (Render)

### Step 1: Create AI Web Service

1. Go to Render Dashboard
2. Click "**New +**" → "**Web Service**"
3. Select same GitHub repository
4. **Service Name**: `grievance-portal-ai`
5. **Root Directory**: `ai_model`
6. **Environment**: `Python 3`
7. **Build Command**: `pip install -r requirements.txt`
8. **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
9. **Instance Type**: `Free`

### Step 2: Add Environment Variables

```env
PYTHONUNBUFFERED=1
```

### Step 3: Deploy AI Service

1. Click "**Create Web Service**"
2. Wait for deployment (5-10 minutes)
3. Once deployed, copy the URL: `https://grievance-portal-ai.onrender.com`

✅ **Save this AI service URL** (optional - if frontend needs it)

---

## Part 4: Frontend Deployment (Vercel)

### Step 1: Deploy to Vercel

1. Go to https://vercel.com/new
2. Sign in with GitHub (free, no CC required)
3. Import your GitHub repository
4. **Framework Preset**: Vite (auto-detected)
5. **Root Directory**: `client`
6. Click "**Show More**" → Edit settings:
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

### Step 2: Add Environment Variable

Before deploying, add:

**Environment Variables:**
```
VITE_API_URL=https://grievance-portal-backend.onrender.com
```

Replace with your actual backend URL from Part 2, Step 3

### Step 3: Deploy

1. Click "**Deploy**"
2. Wait for deployment (2-5 minutes)
3. Once deployed, copy the URL: `https://grievance-portal-xyz.vercel.app`

### Step 4: Update Backend with Frontend URL

1. Go back to Render Dashboard
2. Open your backend service
3. Go to "**Environment**"
4. Update `CLIENT_URL`:
   ```
   CLIENT_URL=https://grievance-portal-xyz.vercel.app
   ```
5. Click "**Save Changes**"
6. Backend will automatically redeploy

---

## ✅ Verification Checklist

After deployment, test these:

- [ ] **Database**: Check MongoDB Atlas shows connected apps
- [ ] **Backend Health**: Visit `https://your-backend.onrender.com/health`
- [ ] **AI Service**: Visit `https://your-ai.onrender.com/docs`
- [ ] **Frontend**: Visit your Vercel URL
- [ ] **API Connection**: Try submitting a complaint from frontend
- [ ] **CORS**: Ensure no CORS errors in browser console

---

## 🔧 Troubleshooting

### Backend Won't Start
1. Check Render logs for errors
2. Verify MONGODB_URI is correct
3. Ensure MongoDB IP whitelist includes 0.0.0.0/0
4. Check all environment variables are set

### Frontend Can't Connect to Backend
1. Verify `VITE_API_URL` matches backend URL exactly (no trailing slash)
2. Check browser console for CORS errors
3. Verify `CLIENT_URL` is set in backend environment
4. Ensure backend is running (check Render status)

### Free Tier Limitations

**Render Free Tier:**
- Services sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds to wake up
- 750 hours/month free (enough for 1 service running 24/7)
- Limited bandwidth

**Vercel Free Tier:**
- Unlimited bandwidth
- 100 GB bandwidth/month
- Instant wake-up (no sleep)
- Commercial use allowed

**MongoDB Atlas Free Tier:**
- 512 MB storage
- Shared CPU
- Perfect for small projects

---

## 🚀 Auto-Deploy on Git Push

Both Vercel and Render auto-deploy when you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Both services will automatically detect the push and redeploy!

---

## 📊 Monitor Your Services

### Vercel Dashboard
- Real-time deployment logs
- Analytics and performance metrics
- Automatic HTTPS
- Visit: https://vercel.com/dashboard

### Render Dashboard
- Service logs (real-time)
- Metrics (CPU, RAM, Network)
- Deployment history
- Visit: https://dashboard.render.com

---

## 🎉 Your App is Live!

**URLs:**
- 🌐 Frontend: `https://your-app.vercel.app`
- 🔌 Backend API: `https://your-backend.onrender.com`
- 🤖 AI Service: `https://your-ai.onrender.com`
- 💾 Database: MongoDB Atlas Cloud

---

## 💰 Cost Summary

| Service | Cost | Limits |
|---------|------|--------|
| Vercel | $0 | 100 deployments/day, 100 GB bandwidth |
| Render (Backend) | $0 | Sleeps after 15 min, 750 hrs/month |
| Render (AI) | $0 | Sleeps after 15 min, 750 hrs/month |
| MongoDB Atlas | $0 | 512 MB storage |
| **Total** | **$0/month** | Perfect for MVP/Demo |

---

## 🔄 Optional: Keep Services Awake

Render free services sleep after 15 minutes. To keep them awake:

### Option 1: UptimeRobot (Free)
1. Sign up at https://uptimerobot.com
2. Add monitors for:
   - `https://your-backend.onrender.com/health`
   - `https://your-ai.onrender.com/docs`
3. Set check interval: 5 minutes
4. Services will stay awake!

### Option 2: Cron-job.org (Free)
1. Sign up at https://cron-job.org
2. Create jobs to ping your services every 10 minutes

---

## 📝 Next Steps

1. Set up custom domain (if needed)
2. Configure email service (SMTP)
3. Set up WhatsApp Business API (if using)
4. Add monitoring and alerts
5. Set up backups for MongoDB

---

## 🆘 Need Help?

- **Vercel Docs**: https://vercel.com/docs
- **Render Docs**: https://render.com/docs
- **MongoDB Docs**: https://docs.mongodb.com/

---

**Deployment Complete! 🎊**

Your Grievance Portal is now live and accessible worldwide - completely free!
