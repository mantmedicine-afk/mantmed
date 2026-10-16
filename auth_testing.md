# Auth testing (MantMed)

1. Login: curl -c c.txt -X POST $API/api/auth/login -d '{"email":"medico@mantmed.it","password":"Auscula-Studio-2026"}' → user + cookies access_token/refresh_token
2. curl -b c.txt $API/api/auth/me → same user (totp_enabled, idle_minutes)
3. Wrong password → 401 with remaining attempts; 5th → 429 lock 15 min (clear db.login_attempts after tests)
4. Idle: set db.sessions.last_seen older than SESSION_IDLE_MINUTES → /me returns 401 "Sessione chiusa per inattività"
5. 2FA: /2fa/setup → secret; pyotp.TOTP(secret).now() → /2fa/enable; login returns mfa_token → /2fa/verify; disable with password+code afterwards
