# AccessFlow

AccessFlow is a visitor management app with a static HTML/CSS/JavaScript frontend and a Spring Boot API backed by MongoDB Atlas.

## Structure

```text
backend/    Spring Boot API
frontend/   Static web app
render.yaml Render services
```

## Local Development

Run the backend:

```bash
cd backend
mvn spring-boot:run
```

Build and serve the generated frontend:

```bash
cd frontend
API_BASE_URL=http://localhost:8080/api/v1 node ./scripts/build-static.mjs
python -m http.server 4173 --directory dist
```

For local API testing without a build, override `window.API_BASE_URL` in `frontend/assets/js/env.js`; the checked-in fallback points to the deployed Spring Boot API.

## Environment

Backend production variables:

```text
MONGODB_URI
JWT_SECRET
FRONTEND_PUBLIC_URL
CORS_ALLOWED_ORIGINS
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
SENDGRID_API_KEY
SENDGRID_FROM_EMAIL
SUPER_ADMIN_USERNAME
SUPER_ADMIN_EMAIL
SUPER_ADMIN_PASSWORD
```

Frontend build variable:

```text
API_BASE_URL
```

Use `.env.example` as the shape reference. Do not commit real secrets.

## Render Deployment

`render.yaml` defines two free-tier services:

- `accessflow-api`: Docker web service built from `backend/Dockerfile`
- `accessflow-web`: static site published from `frontend/`

The frontend build now generates `frontend/dist/`, writes a deploy-specific `assets/js/env.js`, stamps local JS/CSS/module imports with a deploy token, and emits `assets/app-manifest.json` for runtime version checks. HTML and runtime manifests are served `no-store`; versioned JS and CSS stay immutable. The backend Docker image starts with the Spring `prod` profile, binds to `0.0.0.0:${PORT:-10000}` for Render, and reads `FRONTEND_PUBLIC_URL` plus `CORS_ALLOWED_ORIGINS` for CORS. In production, use `FRONTEND_PUBLIC_URL=https://accessflow-web.onrender.com` and `CORS_ALLOWED_ORIGINS=https://accessflow-web.onrender.com`.

Set the secret values in Render before the first backend deploy. The initial super admin is created only when no `SUPER_ADMIN` or `ADMIN` user exists. The display name is derived from `SUPER_ADMIN_USERNAME`.

## Checks

```bash
cd backend
mvn test
mvn -DskipTests package
docker build -t accessflow-api .
```

Useful health endpoints:

- `/api/v1/health`
- `/api/v1/health/live`
- `/api/v1/health/ready`
- `/actuator/health`

## Notes

- MongoDB must use an Atlas `mongodb+srv://...` URI in production.
- Cloudinary uses the three explicit credential variables listed above.
- SendGrid email delivery requires `SENDGRID_API_KEY` and a verified `SENDGRID_FROM_EMAIL`.
- JWT access tokens use a 60 minute lifetime and refresh tokens use a 7 day lifetime.
