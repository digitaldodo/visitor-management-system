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

Open `frontend/index.html` with a local static server. The checked-in `frontend/assets/js/env.js` points to `http://localhost:8080/api/v1`.

## Environment

Backend production variables:

```text
MONGODB_URI
JWT_SECRET
FRONTEND_URL
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

The frontend build writes `frontend/assets/js/env.js` from `API_BASE_URL`. The backend Docker image starts with the Spring `prod` profile and reads `FRONTEND_URL` for CORS.

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
