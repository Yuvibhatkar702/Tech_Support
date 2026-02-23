# Railway Deployment Guide

## Prerequisites
- GitHub account with your code pushed to a repository
- Railway account (sign up at https://railway.app - no credit card required!)

## Deployment Steps

### Step 1: Push Your Code to GitHub

```bash
# Initialize git if not already done
git init
git add .
git commit -m "Ready for Railway deployment"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/grievance-portal.git
git push -u origin main
```

### Step 2: Sign Up for Railway

1. Go to https://railway.app
2. Click "Start a New Project"
3. Sign in with GitHub (no credit card needed for $5/month free tier)

### Step 3: Deploy Backend Service (Node.js API)

1. Click "**New Project**" → "**Deploy from GitHub repo**"
2. Select your `grievance-portal` repository
3. Railway will auto-detect the monorepo
4. Click "**Add variables**" and add these environment variables:

```env
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your-super-secret-jwt-key-change-this-12345
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

5. **Important**: Set **Root Directory** to `server`
6. Click "**Deploy**"
7. Railway will automatically build and deploy
8. Copy the deployed URL (e.g., `https://grievance-portal-api.up.railway.app`)

### Step 4: Deploy AI Model Service (Python FastAPI)

1. In the same Railway project, click "**New**" → "**GitHub Repo**"
2. Select the same repository
3. Set **Root Directory** to `ai_model`
4. Add environment variable:
```env
PYTHONUNBUFFERED=1
```
5. Click "**Deploy**"
6. Copy the deployed URL (e.g., `https://grievance-portal-ai.up.railway.app`)

### Step 5: Deploy Frontend (React/Vite)

1. In the same Railway project, click "**New**" → "**GitHub Repo**"
2. Select the same repository
3. Set **Root Directory** to `client`
4. Add environment variable:
```env
VITE_API_URL=https://grievance-portal-api.up.railway.app
```
   *(Use the backend URL from Step 3)*

5. Click "**Deploy**"
6. Copy the deployed URL (e.g., `https://grievance-portal-client.up.railway.app`)

### Step 6: Update Backend with Frontend URL

1. Go back to your Backend service in Railway
2. Add this environment variable:
```env
CLIENT_URL=https://grievance-portal-client.up.railway.app
```
   *(Use the frontend URL from Step 5)*

3. Railway will automatically redeploy

### Step 7: Update Frontend with AI Model URL (Optional)

If your frontend calls the AI service directly:
1. Go to Frontend service settings
2. Add:
```env
VITE_AI_API_URL=https://grievance-portal-ai.up.railway.app
```

## MongoDB Setup (If Not Done)

1. Go to https://www.mongodb.com/cloud/atlas
2. Create free cluster (no credit card required)
3. Create database user
4. Whitelist all IPs (0.0.0.0/0) for Railway access
5. Get connection string and add to Railway backend env vars as `MONGODB_URI`

## Environment Variables Summary

### Backend Service (server/)
| Variable | Value | Required |
|----------|-------|----------|
| NODE_ENV | production | ✅ |
| MONGODB_URI | Your MongoDB connection string | ✅ |
| JWT_SECRET | Random secret string | ✅ |
| CLIENT_URL | Frontend Railway URL | ✅ |
| WHATSAPP_API_URL | https://graph.facebook.com/v18.0 | ⚠️ Optional |
| GEOCODING_API_URL | https://nominatim.openstreetmap.org/reverse | ✅ |
| DUPLICATE_RADIUS_METERS | 100 | ✅ |
| DUPLICATE_TIME_WINDOW_HOURS | 24 | ✅ |
| MAX_IMAGE_SIZE_MB | 5 | ✅ |
| COMPRESSED_IMAGE_QUALITY | 80 | ✅ |
| RATE_LIMIT_WINDOW_MS | 900000 | ✅ |
| RATE_LIMIT_MAX_REQUESTS | 100 | ✅ |
| UPLOAD_DIR | ./uploads | ✅ |

### AI Model Service (ai_model/)
| Variable | Value | Required |
|----------|-------|----------|
| PYTHONUNBUFFERED | 1 | ✅ |

### Frontend Service (client/)
| Variable | Value | Required |
|----------|-------|----------|
| VITE_API_URL | Backend Railway URL | ✅ |

## Troubleshooting

### Build Fails
- Check Railway logs in the dashboard
- Ensure `package.json` has all dependencies
- Verify Root Directory is set correctly

### Service Won't Start
- Check start command in railway.toml
- Verify environment variables are set
- Check Railway logs for errors

### Frontend Can't Connect to Backend
- Ensure CORS is configured in backend
- Verify `CLIENT_URL` is set in backend
- Check `VITE_API_URL` matches backend URL exactly

### MongoDB Connection Issues
- Whitelist 0.0.0.0/0 in MongoDB Atlas Network Access
- Verify connection string is correct
- Check MongoDB user has read/write permissions

## Railway CLI (Alternative Method)

Install Railway CLI:
```bash
npm i -g @railway/cli
railway login
```

Deploy each service:
```bash
# Backend
cd server
railway up

# AI Model
cd ../ai_model
railway up

# Frontend
cd ../client
railway up
```

## Free Tier Limits
- **$5 free credit per month**
- **500 hours of usage**
- **100 GB egress**
- Should be sufficient for development/testing

## Next Steps After Deployment

1. ✅ Test all API endpoints
2. ✅ Verify file uploads work
3. ✅ Test complaint submission
4. ✅ Check admin dashboard
5. ✅ Monitor logs in Railway dashboard
6. ✅ Set up automatic deployments from GitHub (already enabled)

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Check logs in Railway dashboard for debugging

---

**Your services will be live at:**
- Backend: `https://<service-name>.up.railway.app`
- AI Model: `https://<service-name>.up.railway.app`
- Frontend: `https://<service-name>.up.railway.app`

Each service gets a unique subdomain automatically!
