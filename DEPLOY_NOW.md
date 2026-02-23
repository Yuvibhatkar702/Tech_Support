# 🚀 Quick Deploy - FREE (No Credit Card!)

## Total Time: ~30 minutes
## Total Cost: $0/month

---

## Step 1: MongoDB (5 min) 🗄️

1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up → Create FREE cluster (M0)
3. Create user: `grievance_admin` / `[password]`
4. Network Access → Add IP: `0.0.0.0/0`
5. Copy connection string:
   ```
   mongodb+srv://grievance_admin:PASSWORD@cluster0.xxxxx.mongodb.net/grievance_portal
   ```

✅ **Save this string!**

---

## Step 2: Backend on Render (10 min) ⚡

1. Go to https://render.com → Sign up (free, no CC!)
2. **New +** → **Web Service**
3. Connect GitHub repo
4. Settings:
   - Name: `grievance-backend`
   - Root: `server`
   - Build: `npm install`
   - Start: `node server.js`
   - Instance: **Free**

5. **Environment Variables** (copy from [server/.env.render](server/.env.render)):
   ```
   NODE_ENV=production
   PORT=10000
   MONGODB_URI=[paste your MongoDB string]
   JWT_SECRET=random-secret-string-create-your-own
   CLIENT_URL=will-add-later
   GEOCODING_API_URL=https://nominatim.openstreetmap.org/reverse
   DUPLICATE_RADIUS_METERS=100
   DUPLICATE_TIME_WINDOW_HOURS=24
   MAX_IMAGE_SIZE_MB=5
   COMPRESSED_IMAGE_QUALITY=80
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   UPLOAD_DIR=./uploads
   ```

6. Click **Create Web Service**
7. Wait ~5 min for deploy
8. Copy URL: `https://grievance-backend.onrender.com`

✅ **Save backend URL!**

---

## Step 3: AI Model on Render (10 min) 🤖

1. Render Dashboard → **New +** → **Web Service**
2. Same GitHub repo
3. Settings:
   - Name: `grievance-ai`
   - Root: `ai_model`
   - Build: `pip install -r requirements.txt`
   - Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - Instance: **Free**

4. **Environment Variables**:
   ```
   PYTHONUNBUFFERED=1
   ```

5. Click **Create Web Service**
6. Wait ~5 min for deploy

✅ **AI service ready!**

---

## Step 4: Frontend on Vercel (5 min) 🎨

1. Go to https://vercel.com/new
2. Sign in with GitHub (free, no CC!)
3. Import your repo
4. Settings:
   - Root: `client`
   - Framework: Vite (auto-detected)
   - Build: `npm run build`
   - Output: `dist`

5. **Environment Variables**:
   ```
   VITE_API_URL=https://grievance-backend.onrender.com
   ```
   *(Use your backend URL from Step 2)*

6. Click **Deploy**
7. Wait ~2 min
8. Copy URL: `https://your-app.vercel.app`

✅ **Frontend live!**

---

## Step 5: Link Frontend to Backend (2 min) 🔗

1. Go back to Render → Backend service
2. **Environment** tab
3. Update:
   ```
   CLIENT_URL=https://your-app.vercel.app
   ```
4. Save → Auto redeploys

✅ **All connected!**

---

## 🎉 DONE!

Visit your live app: `https://your-app.vercel.app`

### Test URLs:
- Frontend: `https://your-app.vercel.app`
- Backend Health: `https://grievance-backend.onrender.com/health`
- AI Docs: `https://grievance-ai.onrender.com/docs`

---

## ⚠️ Important Notes

1. **First Load Slow**: Render free tier sleeps after 15 min. First request takes ~30s to wake up.
2. **Keep Awake**: Use UptimeRobot (free) to ping every 5 min: https://uptimerobot.com
3. **Auto Deploy**: Push to GitHub → Both services auto-deploy!

---

## 🆘 Issues?

See full guide: [FREE_DEPLOYMENT_GUIDE.md](FREE_DEPLOYMENT_GUIDE.md)

---

## 💡 Quick Commands

```bash
# Push updates
git add .
git commit -m "Update"
git push origin main

# Both Vercel & Render auto-deploy!
```

---

**Total Cost: $0/month** ✨
**Setup Time: ~30 min** ⚡
**Credit Card: NOT REQUIRED** 🎉
