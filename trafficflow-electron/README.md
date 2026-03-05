# TrafficFlow v18.0 Enterprise - Desktop Edition

## Quick Start for Windows 11

### Option 1: One-Click Launch (Recommended)
1. **Double-click `START-WINDOWS.bat`**
2. The application will start automatically

> Note: If Node.js is not installed, the script will prompt you to install it from https://nodejs.org/

### Option 2: Manual Start
1. Open Command Prompt or PowerShell in this folder
2. Run: `npm install` (only needed once)
3. Run: `npm start`

## System Requirements
- Windows 10/11 (64-bit)
- Node.js 18+ (download from https://nodejs.org/)
- 4GB RAM minimum
- 500MB disk space

## Features

### Dashboard
- Real-time traffic analytics
- Visitor statistics
- Conversion tracking
- Traffic patterns visualization

### Campaign Management
- Create unlimited traffic campaigns
- Multiple traffic sources (Google, Bing, Facebook, Instagram, etc.)
- Geo-targeting by continent/country
- Custom keywords and URLs
- Business hours scheduling
- E-commerce mode

### SEO Center
- Domain Authority tracking
- Backlink monitoring
- Topical Authority scoring
- Technical SEO analysis
- Content scoring
- Keyword tracking

### Proxy Infrastructure
- Add unlimited proxies
- Residential/Datacenter support
- Country-based routing
- Real-time status monitoring

### Settings
- Email configuration
- Timezone settings
- Billing management
- Data backup/restore

## Data Storage
All data is stored locally in:
- Windows: `%APPDATA%\trafficflow-data\`
- This ensures your data remains private and offline

## Troubleshooting

### Application won't start
1. Ensure Node.js is installed: `node --version`
2. Try reinstalling dependencies: `npm install`
3. Check for Windows updates

### Data not saving
- Check if you have write permissions
- Try running as Administrator

### Performance issues
- Close other heavy applications
- Ensure at least 4GB RAM available

## Building Windows Executable

To create a standalone .exe file:

```bash
npm run build
```

This will create:
- `dist/TrafficFlow Enterprise Setup X.X.X.exe` - Installer
- `dist/TrafficFlow Enterprise X.X.X.exe` - Portable version

## Support
For issues and feature requests, contact support@trafficflow.local

---
Version: 18.0.0 Enterprise
License: Proprietary
