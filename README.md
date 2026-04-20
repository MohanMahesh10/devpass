# DevPass

> **Register. Get Approved. Show Your Pass.**

A lean, production-ready MVP for running developer events on Azure's lowest-cost services.

- Attendees self-register at `/register`
- Admin reviews and approves / rejects at `/admin`
- Approved attendees receive an email with a QR DevPass
- Volunteers scan QR codes at the door at `/scan`

---

## Stack

| Layer            | Choice                                                           |
| ---------------- | ---------------------------------------------------------------- |
| Storage          | **Azure Table Storage** (Standard LRS)                           |
| Email            | **Azure Communication Services — Email**                         |
| Backend          | Node.js + Express — hosted on **Azure App Service (Free F1)**    |
| Frontend         | React (CRA) — hosted on **Azure Static Web Apps (Free)**         |
| QR generation    | [`qrcode`](https://www.npmjs.com/package/qrcode)                 |
| QR scanning      | [`html5-qrcode`](https://www.npmjs.com/package/html5-qrcode)     |
| Secrets          | App Service **App Settings** (no Key Vault needed for MVP)       |

No Cosmos DB, no Service Bus, no Azure SQL, no paid tiers.

---

## Project structure

```
devpass/
  server.js
  routes/
    auth.js            # admin login / logout
    registrations.js   # public register + admin list/stats
    actions.js         # admin approve / reject
    checkin.js         # volunteer QR scan endpoint
  services/
    tableStorage.js    # @azure/data-tables wrapper
    emailService.js    # @azure/communication-email wrapper + templates
    qrService.js       # QR generation
  middleware/
    requireAuth.js     # Bearer session check against AdminSessions table
  utils/
    validation.js      # shared server-side validation
  client/
    src/
      styles/
        theme.css          # design tokens, globals, typography
        components.css     # buttons, inputs, cards, pills, toasts, scan
      components/
        Navbar.jsx
        Toast.jsx
        StatusPill.jsx
        Icons.jsx          # inline SVG icons (LinkedIn, GitHub, etc.)
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

## Local development

**Prerequisites:** Node 18+, an Azure subscription (for real storage + email).

```bash
# 1. Install deps (root + client)
npm run install:all

# 2. Copy env and fill in values (at minimum: AZURE_STORAGE_CONNECTION_STRING,
#    ACS_CONNECTION_STRING, ACS_SENDER_EMAIL, ADMIN_PASSWORD)
cp .env.example .env

# 3. Run the API (port 3001)
npm run dev

# 4. In a second terminal, run the React app (port 3000, proxies /api to :3001)
npm run client
```

Open `http://localhost:3000/register`.

---

## Environment variables

See `.env.example`. Minimum set:

```env
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;AccountKey=...
ACS_CONNECTION_STRING=endpoint=https://<acs>.communication.azure.com/;accesskey=...
ACS_SENDER_EMAIL=DoNotReply@devpass.azurecomm.net
ADMIN_PASSWORD=change-me
SESSION_SECRET=some-long-random-string
EVENT_ID=devpass-2025
EVENT_NAME=DevPass 2025
EVENT_DATE=2025-08-15
EVENT_VENUE=Your Venue Here
PORT=3001
CLIENT_ORIGIN=http://localhost:3000
```

---

## Data model — Azure Table Storage

**Table: `Registrations`**
- `PartitionKey` = `eventId` (e.g. `devpass-2025`)
- `RowKey` = `uuid`
- Fields: `name`, `email`, `phone`, `company`, `role`, `linkedinUrl`, `githubUrl`, `whyAttend`, `status` (`pending | approved | rejected`), `qrToken`, `checkedIn`, `registeredAt`, `decidedAt`

**Table: `AdminSessions`**
- `PartitionKey` = `"sessions"`
- `RowKey` = `sessionToken`
- Fields: `createdAt`, `expiresAt`

Tables are **created automatically on first run** (`ensureTables()` in `services/tableStorage.js`).

---

## API reference

| Method | Path                          | Auth   | Purpose                                   |
| ------ | ----------------------------- | ------ | ----------------------------------------- |
| GET    | `/api/health`                 | none   | Health + event info                       |
| GET    | `/api/event`                  | none   | Public event metadata                     |
| POST   | `/api/register`               | none   | Attendee self-registration                |
| POST   | `/api/admin/login`            | none   | Password → bearer session token           |
| POST   | `/api/admin/logout`           | bearer | Invalidate current session                |
| GET    | `/api/admin/registrations`    | bearer | List all registrations for the event      |
| GET    | `/api/admin/stats`            | bearer | Counts by status + checked-in             |
| POST   | `/api/admin/approve/:id`      | bearer | Approve → generate QR → send email        |
| POST   | `/api/admin/reject/:id`       | bearer | Reject → send rejection email             |
| POST   | `/api/checkin`                | none   | Volunteer QR scan (body = decoded JSON)   |

All admin routes expect `Authorization: Bearer <token>`.

---

## Design system

All colours, radii and spacing are centralised in `client/src/styles/theme.css` as CSS custom properties. The two CSS files are the **single source of truth** — every page consumes them. Key tokens:

```css
--dp-lime:   #C8E649;  /* primary CTA, approved */
--dp-orange: #F97316;  /* pending, warnings */
--dp-bg:     #0F0F0F;  /* page background */
--dp-surface:#1A1A1A;  /* cards */
--dp-text:   #F5F5F5;
--dp-muted:  #888888;
--dp-danger: #f87171;
```

---

## Azure deployment (copy-paste)

Assumes Azure CLI (`az`) is installed and you're logged in (`az login`).

### 1. Resource group + storage

```bash
# Pick unique, globally unique names (storage must be 3-24 lowercase alphanum)
RG=devpass-rg
LOC=eastus
STORAGE=devpassstore$RANDOM

az group create --name $RG --location $LOC

az storage account create \
  --name $STORAGE \
  --resource-group $RG \
  --location $LOC \
  --sku Standard_LRS \
  --kind StorageV2 \
  --access-tier Hot

# Grab the connection string
STORAGE_CONN=$(az storage account show-connection-string \
  --name $STORAGE --resource-group $RG --query connectionString -o tsv)
echo "AZURE_STORAGE_CONNECTION_STRING=$STORAGE_CONN"
```

Tables (`Registrations`, `AdminSessions`) will be created automatically on first API boot.

### 2. Azure Communication Services — Email

Provisioning the ACS + Email resources and verifying a sender domain is a one-time UI task. Quick path using the default Azure-managed subdomain (no DNS setup required):

```bash
# Create ACS (Communication Services) resource
az communication create \
  --name devpass-acs \
  --resource-group $RG \
  --location global \
  --data-location UnitedStates

# Then in the Azure Portal:
#   1. Open your ACS resource → Domains → "+ Connect domain"
#   2. Create an "Azure-managed domain" (e.g. devpass.azurecomm.net) — instant, no DNS
#   3. Note the sender address:  DoNotReply@<your-subdomain>.azurecomm.net
#   4. Copy the ACS "Primary connection string" from Keys blade

ACS_CONN="endpoint=https://<your-acs>.communication.azure.com/;accesskey=..."
ACS_SENDER="DoNotReply@<your-subdomain>.azurecomm.net"
```

### 3. Backend — App Service (Free F1)

```bash
PLAN=devpass-plan
APP=devpass-api-$RANDOM  # must be globally unique

az appservice plan create \
  --name $PLAN --resource-group $RG --sku F1 --is-linux

az webapp create \
  --name $APP \
  --resource-group $RG \
  --plan $PLAN \
  --runtime "NODE:18-lts"

# Set App Settings (env vars)
az webapp config appsettings set --resource-group $RG --name $APP --settings \
  AZURE_STORAGE_CONNECTION_STRING="$STORAGE_CONN" \
  ACS_CONNECTION_STRING="$ACS_CONN" \
  ACS_SENDER_EMAIL="$ACS_SENDER" \
  ADMIN_PASSWORD="change-me-please" \
  SESSION_SECRET="$(openssl rand -hex 32)" \
  EVENT_ID="devpass-2025" \
  EVENT_NAME="DevPass 2025" \
  EVENT_DATE="2025-08-15" \
  EVENT_VENUE="Your Venue" \
  WEBSITE_NODE_DEFAULT_VERSION="~18" \
  SCM_DO_BUILD_DURING_DEPLOYMENT="true"

# Deploy via zip (from repo root)
zip -r deploy.zip . -x "client/node_modules/*" "node_modules/*" ".git/*" "client/build/*"
az webapp deploy \
  --resource-group $RG --name $APP --src-path deploy.zip --type zip
```

### 4. Frontend — Static Web Apps (Free)

Easiest path is via GitHub: push the repo, then in the Portal:

1. **Create a resource → Static Web App (Free plan)**
2. Repository: your fork. Branch: `main`.
3. **App location:** `client`
4. **Output location:** `build`
5. **API location:** leave empty (we use App Service)

Or via CLI:

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

Set `REACT_APP_API_BASE` (in the SWA "Configuration" blade) to your App Service URL, e.g. `https://devpass-api-12345.azurewebsites.net`.

### 5. CORS on App Service

```bash
SWA_URL=https://<your-swa>.azurestaticapps.net

az webapp cors add \
  --resource-group $RG --name $APP \
  --allowed-origins $SWA_URL

# Also set CLIENT_ORIGIN so Express CORS matches
az webapp config appsettings set --resource-group $RG --name $APP --settings \
  CLIENT_ORIGIN="$SWA_URL"
```

Done. Smoke-test:

```bash
curl https://$APP.azurewebsites.net/api/health
```

---

## Notes & trade-offs

- **Sessions** are plain random tokens stored in the `AdminSessions` table with an 8-hour TTL. Good enough for an MVP; swap for JWT or an identity provider if you outgrow it.
- The approval flow writes to storage **before** attempting to send the email. If email fails, you get a `502` back and can safely retry approval from the dashboard.
- `/api/checkin` is intentionally unauthenticated — volunteers shouldn't have to log in on the door. The QR contains a UUID `qrToken` that's only issued on approval, so an attacker would have to guess a valid one to forge entry.
- Free F1 App Service cold-starts; consider B1 ($) if you need snappy check-in at the door.
- Table Storage queries filter by `PartitionKey = eventId`, which keeps reads cheap even at thousands of registrations.

---

## License

MIT.
