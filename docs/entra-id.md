# Signing in with Microsoft Entra ID

SEKA uses Microsoft single sign-on, so the application signs users in through Microsoft Entra ID (Azure AD).
This is implemented and switched on with `AUTH_MODE=entra`. Without it the application runs in demo mode
(`AUTH_MODE=demo`, the default): the login page offers demo accounts and no password is involved.

## What is implemented

- OpenID Connect authorization code flow with PKCE, written without extra libraries (`src/lib/entra.ts`).
- The ID token is verified: RS256 signature against the tenant's signing keys, issuer, audience, expiry, nonce and tenant.
  Anything else (`alg: none`, HS256, an unknown key, a wrong audience ...) is refused.
- State, nonce and the PKCE verifier live in a signed, short-lived, `HttpOnly` cookie that is used once.
- After the check the application issues its own signed session cookie (12 hours). Everything behind the
  login is the same as in demo mode: the three roles are enforced on the server for every request.
- Tested against a small identity provider that runs inside the test suite and speaks Microsoft's endpoints
  (`tests/entra.test.mjs`). It has **not** been tried against a real tenant yet: that needs SEKA's app registration.

## Setup in the Azure portal

1. **App registrations → New registration.** Name: "SEKA Recruitment". Supported account types: *this organizational
   directory only*. Redirect URI, platform *Web*: `https://<your-host>/api/auth/entra/callback`.
2. **Certificates & secrets → New client secret.** Copy the *value* (it is shown once).
3. From **Overview** copy the *Application (client) ID* and the *Directory (tenant) ID*.
4. **App roles → Create app role**, allowed member types *Users/Groups*, one per role:

   | Value | Meaning |
   |---|---|
   | `SEKA.SystemAdmin` | system administrator: everything, including the technical settings (mail server, Azure / Entra ID, AI key) and the demo reset |
   | `SEKA.Admin` | administrator: roles, statuses, permissions, message wording, retention, notifications |
   | `SEKA.HR` | HR manager: the whole company |
   | *any role added in the application* | the name entered for it under Administracja → Role; a role limited to one branch gets the city appended, as below |
   | `SEKA.Branch.Warszawa`, `SEKA.Branch.Kraków`, `SEKA.Branch.Wrocław`, `SEKA.Branch.Gdańsk`, `SEKA.Branch.Poznań`, `SEKA.Branch.Katowice` | branch manager of that city |

5. **Enterprise applications → SEKA Recruitment → Users and groups → Add user/group** and pick the role for each
   user or group (for example the "HR" security group gets `SEKA.HR`). Assignment required: *Yes*, so nobody else
   can sign in at all.
6. Set the environment variables of the application:

   | Variable | Value |
   |---|---|
   | `AUTH_MODE` | `entra` |
   | `ENTRA_TENANT_ID` | Directory (tenant) ID |
   | `ENTRA_CLIENT_ID` | Application (client) ID |
   | `ENTRA_CLIENT_SECRET` | the secret from step 2 |
   | `APP_URL` | public address, for example `https://rekrutacja.seka.pl` (builds the redirect URI) |
   | `SESSION_SECRET` | a long random string (otherwise one is generated and kept in the data volume) |
   | `ENTRA_ROLE_MAP` | optional, see below |

## Roles from groups instead of app roles

If SEKA prefers security groups, add a *groups* claim (**Token configuration → Add groups claim → Security groups**) and
map the group object IDs to roles:

```
ENTRA_ROLE_MAP={"6c1d...-hr-group":"hr","a93f...-admins":"admin","0b7e...-krakow":"manager:Kraków"}
```

The map may also rename app roles (`{"Rekrutacja.Admin":"admin"}`). Names that are not in the map fall back to the
`SEKA.*` values above.

Rules: the highest role wins when a user has several (admin, then HR manager, then branch manager). A branch manager has
exactly one city (the first one found). A user with no matching role, or with a city the system does not know, is turned
away with "To konto nie ma dostępu do systemu rekrutacji" and the attempt is written to the audit log.

## Behind a proxy (Coolify, Azure Container Apps ...)

Set `APP_URL` to the public HTTPS address. The cookies are `Secure` over HTTPS and `HttpOnly`/`SameSite=Lax` always.

## Signing out

"Wyloguj" ends the application session. The Microsoft session stays (that is single sign-on), so the next sign-in is
immediate. A full sign-out of Microsoft would be a redirect to the tenant's `logout` endpoint; it can be added if SEKA wants it.

## Not covered

- No token refresh: the session lasts 12 hours, then the user signs in again (one click with SSO).
- No Microsoft Graph calls. The branch comes from the role, not from profile attributes such as `officeLocation`.
- Users are not stored. The session cookie is the only record; the audit log keeps who signed in and when.
