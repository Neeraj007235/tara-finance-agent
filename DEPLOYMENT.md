# Deployment Guide for Tara Finance Agent

## Step 1: Push Code to GitHub

### 1.1 Prepare Git Commit
First, let's commit all changes in the local repository:

```powershell
cd "d:\pazago tech\tara-finance-agent"
git add .
git commit -m "Initial commit for deployment"
```

### 1.2 Create GitHub Repository
1. Go to https://github.com/new
2. Name your repository (e.g., `tara-finance-agent`)
3. Choose Public or Private (as needed)
4. **Do NOT** initialize with README, .gitignore, or license (we already have these)
5. Click "Create repository"

### 1.3 Push to GitHub
Follow the instructions GitHub provides (or use these commands):

```powershell
# Replace YOUR-USERNAME and YOUR-REPO-NAME with your actual values
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy to Render

### 2.1 Sign Up / Log In to Render
- Go to https://render.com
- Sign up or log in with your GitHub account (recommended)

### 2.2 Create New Web Service
1. Click "New" → "Web Service"
2. Connect your GitHub account and grant access to your repository
3. Select your `tara-finance-agent` repository

### 2.3 Configure Web Service
Fill in the following details:
- **Name**: `tara-finance-agent` (or your preferred name)
- **Region**: Choose the one closest to you
- **Branch**: `main`
- **Root Directory**: Leave blank (or set to project root)
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Plan**: Starter (free tier available)

### 2.4 Add Environment Variables
In the "Environment" section, add these variables:
1. `NODE_ENV`: `production`
2. `OPENAI_API_KEY`: Your OpenAI API key (you can get this from https://platform.openai.com/account/api-keys)
3. (Optional) If you want to use a different LLM provider: `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY`

### 2.5 Add PostgreSQL Database
1. Click "New" → "PostgreSQL" (or use the render.yaml to auto-provision)
2. Name it `tara-finance-db`
3. Choose Starter plan
4. Wait for the database to be ready (this takes a couple of minutes)
5. Copy the `Internal Database URL` (this will be used for DATABASE_URL)

### 2.6 Link Database to Web Service
1. Go back to your Web Service settings
2. In the "Environment" section, add:
   - `DATABASE_URL`: Paste the Internal Database URL from your PostgreSQL database
3. Save the changes

### 2.7 Deploy!
Click "Create Web Service" and Render will start building and deploying your app!

---

## Step 3: After Deployment (Important!)

### 3.1 Ingest Sample Data
Once your app is deployed, you need to ingest data into the database. Here's how:

Option 1: Use Render's Shell
1. In Render dashboard, go to your Web Service
2. Click "Shell" from the left menu
3. Run these commands:
   ```bash
   # Set data directory and ingest sample data
   export DATA_DIR=./data/sample_a
   npm run ingest
   ```

Option 2: Run Locally (if you have DATABASE_URL)
You can also run the ingest script locally with your Render DATABASE_URL:
```powershell
$env:DATABASE_URL="postgresql://..."  # Replace with your Render DB URL
$env:DATA_DIR="./data/sample_a"
npm run ingest
```

### 3.2 Test Your Deployed App
Your app is now live! Let's test it:
1. Get your Render app URL from the dashboard (ends with `.onrender.com`)
2. Test health check: Open `https://your-app-url.onrender.com/health`
3. Test /ask endpoint using curl or Postman:
   ```bash
   curl -X POST https://your-app-url.onrender.com/ask \
     -H "Content-Type: application/json" \
     -d '{"question": "How much did I spend on food last month?"}'
   ```

---

## Final Checks
✅ Code is on GitHub
✅ App is deployed on Render
✅ Database is connected
✅ Sample data is ingested
✅ Endpoints are working

Congratulations! Your Tara Finance Agent is now live! 🚀
