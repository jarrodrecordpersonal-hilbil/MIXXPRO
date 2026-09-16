# MIXXWAVE Google sign-in

MIXXWAVE supports public venue account creation with Google OAuth 2.0 once the two private Render environment variables below are set.

## Google Auth Platform

Create a **Web application** OAuth client and add this exact authorized redirect URI:

`https://mixxwave.com/api/auth/google/callback`

Google requires an exact redirect URI match, including scheme, host and path.

## Render

Set these values privately on the `mixxwave-pilot` service:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SIGNUPS_ENABLED=true`

Do not commit or paste the client secret into GitHub or chat.

After saving the variables, deploy the latest `main` commit. The sign-in screen will show **Continue with Google** whenever the Google client ID and secret are both configured.

New Google users receive a free venue workspace named from their Google profile (for example, `Jarrod's Venue`) with venue type `other`; they can rename and configure it after sign-in. Existing accounts with the same verified Google email sign into the existing MIXXWAVE user instead of creating a duplicate.
