# DevPass

**Register. Get Approved. Show Your Pass.**

DevPass is a lean event registration system built for developer communities. Attendees apply online, an admin(agent) curates the list, and approved attendees receive a QR pass by email. Volunteers scan QR codes at the door — no app required.

---

## Screenshots

**Registration form**
![Registration form](https://github.com/user-attachments/assets/f7deb269-1b92-4ec1-be8d-8a263d634d21)

**Registration confirmed**
![Registration confirmed](https://github.com/user-attachments/assets/00201884-ddba-43b2-ae45-7281e95a299e)

**Email Confirmation**
![Admin dashboard](https://github.com/user-attachments/assets/c4c21625-da0b-41f7-8392-a8cbb0fca924)

**Admin dashboard — approve / reject(agent curated)  Admin stats overview**
![Admin approve reject](https://github.com/user-attachments/assets/e23d1250-1fb2-4198-b798-7a81efee2357)

**QR pass email — mobile**
![Admin stats](https://github.com/user-attachments/assets/1cd5c547-ba29-46a6-bd8d-fc363c8c6e09)

**QR pass Scan Validation**

![QR pass email](https://github.com/user-attachments/assets/3dd83f1c-b29c-4e52-99c1-1094a82c993d)

**QR scan at the door — mobile**

![QR scan](https://github.com/user-attachments/assets/0096505d-91a0-4a61-9893-8fdb0fba4ccd)

---

## What it does

| Who | Where | What happens |
|---|---|---|
| Attendee | `/register` | Fills out a form — name, email, role, LinkedIn, GitHub, why they want to attend |
| Attendee | `/confirmed` | Sees a confirmation screen; waits for email |
| Admin | `/admin` | Reviews applicants, clicks Approve or Reject — email fires instantly |
| Attendee | Inbox | Gets a QR pass (approved) or a polite "we're at capacity" note (rejected) |
| Volunteer | `/scan` | Opens camera on phone, scans QR at the door — green means in, red means no |

---

## Stack

| Layer | Choice |
|---|---|
| Database | Azure Table Storage — Standard LRS |
| Email | Azure Communication Services |
| Backend | Node.js + Express on Azure App Service (Free F1) |
| Frontend | React on Azure Static Web Apps (Free) |
| QR generation | `qrcode` npm package |
| QR scanning | `html5-qrcode` — browser-based, no app install |
| Secrets | App Service Application Settings |

No Cosmos DB. No Azure SQL. No paid tiers. Runs at near-zero cost for event-scale traffic.

---

## Project structure

```
devpass/
  server.js
  routes/
    auth.js              # admin login / logout
    registrations.js     # public register + admin list + stats
    actions.js           # approve / reject
    checkin.js           # QR scan validation
  services/
    tableStorage.js      # Azure Table Storage wrapper
    emailService.js      # ACS email + HTML templates
    qrService.js         # QR code generation
  middleware/
    requireAuth.js       # bearer session check
  utils/
    validation.js        # shared input validation
  client/
    src/
      styles/
        theme.css         # design tokens and global resets
        components.css    # buttons, inputs, cards, pills, toasts
      components/
        Navbar.jsx
        Toast.jsx
        StatusPill.jsx
        Icons.jsx
      pages/
        Register.jsx
        Confirmed.jsx
        Admin.jsx
        Scan.jsx
      App.jsx
      index.js
  .env.example
  package.json
  README.md
```

---

## Local setup

**Prerequisites:** Node 20+, an Azure subscription (storage + email are real Azure services — no local emulator needed for MVP).

```bash
# Install dependencies for backend and frontend
npm run install:all

# Copy the example env file and fill in your values
cp .env.example .env

# Start the API on port 3001
npm run dev

# In a second terminal, start the React app on port 3000
npm run client
```

Open [http://localhost:3000/register](http://localhost:3000/register).

---

## Environment variables

```env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
ACS_CONNECTION_STRING=endpoint=https://<name>.communication.azure.com/;accesskey=...
ACS_SENDER_EMAIL=DoNotReply@<subdomain>.azurecomm.net
ADMIN_PASSWORD=change-me
SESSION_SECRET=some-long-random-string
EVENT_ID=devpass-2025
EVENT_NAME=DevPass 2025
EVENT_DATE=2025-08-15
EVENT_VENUE=Your Venue Here
PORT=3001
CLIENT_ORIGIN=http://localhost:3000
```

Minimum required to run: `AZURE_STORAGE_CONNECTION_STRING`, `ACS_CONNECTION_STRING`, `ACS_SENDER_EMAIL`, `ADMIN_PASSWORD`.

---

## Data model

**Table: `Registrations`**

| Field | Type | Notes |
|---|---|---|
| PartitionKey | string | `eventId` — e.g. `devpass-2025` |
| RowKey | string | UUID generated on registration |
| name, email, phone | string | Core contact info |
| company, role | string | Role is a dropdown |
| linkedinUrl, githubUrl | string | Optional social profiles |
| whyAttend | string | Short answer from the form |
| status | string | `pending` · `approved` · `rejected` |
| qrToken | string | UUID issued only on approval |
| checkedIn | boolean | Set to `true` on successful door scan |
| registeredAt, decidedAt | ISO timestamp | Audit trail |

**Table: `AdminSessions`**

Stores bearer tokens issued on admin login. 8-hour TTL. Both tables are created automatically on first API boot — no manual setup needed.

---

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | none | Health check + event info |
| GET | `/api/event` | none | Public event metadata |
| POST | `/api/register` | none | Attendee registration |
| POST | `/api/admin/login` | none | Password → bearer token |
| POST | `/api/admin/logout` | bearer | Invalidate session |
| GET | `/api/admin/registrations` | bearer | List all attendees |
| GET | `/api/admin/stats` | bearer | Counts by status |
| POST | `/api/admin/approve/:id` | bearer | Approve → generate QR → send email |
| POST | `/api/admin/reject/:id` | bearer | Reject → send email |
| POST | `/api/checkin` | none | Validate QR and mark checked in |

---

## Azure deployment

Install the Azure CLI and run `az login` before starting.

### 1 — Resource group and storage

```bash
RG=devpass-rg
LOC=eastus
STORAGE=devpassstore$RANDOM   # must be globally unique, lowercase alphanumeric

az group create --name $RG --location $LOC

az storage account create \
  --name $STORAGE \
  --resource-group $RG \
  --location $LOC \
  --sku Standard_LRS \
  --kind StorageV2

# Copy this — you'll need it as AZURE_STORAGE_CONNECTION_STRING
az storage account show-connection-string \
  --name $STORAGE --resource-group $RG --query connectionString -o tsv
```

### 2 — Azure Communication Services

```bash
az communication create \
  --name devpass-acs \
  --resource-group $RG \
  --location global \
  --data-location UnitedStates
```

Then in the Azure Portal: open the ACS resource → **Email** → **Domains** → **Add a domain** → choose **Azure-managed domain**. This gives you a sender address instantly with no DNS setup. Copy the sender address and the Primary connection string from the **Keys** blade.

### 3 — Backend on App Service

```bash
PLAN=devpass-plan
APP=devpass-api-$RANDOM   # becomes your API URL subdomain

az appservice plan create \
  --name $PLAN --resource-group $RG --sku F1 --is-linux

az webapp create \
  --name $APP \
  --resource-group $RG \
  --plan $PLAN \
  --runtime "NODE:20-lts"

# Set all environment variables
az webapp config appsettings set --resource-group $RG --name $APP --settings \
  AZURE_STORAGE_CONNECTION_STRING="<paste>" \
  ACS_CONNECTION_STRING="<paste>" \
  ACS_SENDER_EMAIL="<paste>" \
  ADMIN_PASSWORD="<your-password>" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  EVENT_ID="devpass-2025" \
  EVENT_NAME="DevPass 2025" \
  EVENT_DATE="2025-08-15" \
  EVENT_VENUE="<your venue>" \
  NODE_ENV="production" \
  SCM_DO_BUILD_DURING_DEPLOYMENT="true"

# Deploy via zip (from repo root)
zip -r deploy.zip . \
  -x "client/*" "node_modules/*" ".git/*" "*.env"

az webapp deploy \
  --resource-group $RG \
  --name $APP \
  --src-path deploy.zip \
  --type zip

# Smoke test
curl https://$APP.azurewebsites.net/api/health
```

### 4 — Frontend on Static Web Apps

Push your repo to GitHub first, then:

```bash
az staticwebapp create \
  --name devpass-web \
  --resource-group $RG \
  --source https://github.com/<you>/devpass \
  --branch main \
  --app-location "client" \
  --output-location "build" \
  --login-with-github
```

Once deployed, get the URL and set the API base in the SWA Configuration blade:

```
REACT_APP_API_BASE = https://<your-app>.azurewebsites.net
```

### 5 — Lock down CORS

```bash
SWA_URL=https://<your-swa>.azurestaticapps.net

az webapp cors add \
  --resource-group $RG --name $APP \
  --allowed-origins $SWA_URL

az webapp config appsettings set --resource-group $RG --name $APP --settings \
  CLIENT_ORIGIN="$SWA_URL"
```

---

## Go-live checklist

- [ ] `GET /api/health` returns `{ status: "ok" }`
- [ ] Registration form submits and saves to Table Storage
- [ ] Admin login works at `/admin`
- [ ] Approving an attendee sends a QR pass email
- [ ] Rejecting an attendee sends a polite rejection email
- [ ] QR scan page opens camera on mobile
- [ ] Valid QR scan marks attendee as checked in
- [ ] Scanning the same QR a second time returns "already checked in"
- [ ] `.env` file is not in the GitHub repo

---

## Design system

The UI uses a lime-orange dark theme across all pages. Tokens live in `client/src/styles/theme.css`.

```css
--dp-lime:    #C8E649;   /* primary CTA, approved states */
--dp-orange:  #F97316;   /* pending, warnings */
--dp-bg:      #0F0F0F;   /* page background */
--dp-surface: #1A1A1A;   /* cards and panels */
--dp-text:    #F5F5F5;   /* primary text */
--dp-muted:   #888888;   /* secondary text */
--dp-danger:  #f87171;   /* rejected, errors */
```

---

## Notes

**Sessions** are plain UUIDs stored in Table Storage with an 8-hour TTL. Fine for MVP — swap for JWT or an identity provider when you outgrow it.

**Email reliability** — the approval flow writes to storage before attempting to send email. If email fails you get a `502` and can safely retry from the dashboard without creating a duplicate record.

**Check-in auth** — `/api/checkin` is intentionally unauthenticated. Volunteers shouldn't need to log in at the door. The QR encodes a UUID `qrToken` that is only generated on approval, so forging a valid one is not feasible.

**Cold starts** — Free F1 App Service sleeps after inactivity. If snappy door check-in matters, upgrade to B1 (~$13/month).

---

## License

Apache 2.0

## Note

- It recently scaled 2500+ registrations in client MVP application.

