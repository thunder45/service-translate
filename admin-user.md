# Admin User Setup Scripts

## 1. **Create Admin User:**
```bash
./create-admin.sh admin@example.com us-east-1_iwEEqraYS
```
- Creates user with temporary password: `TempPass123!`

## 2. **First Login & Password Change:**
```bash
./first-login.sh admin@example.com 4avro42msdf7ssuaqslsmfd790 MyNewPassword123!
```
- Logs in with temporary password
- Sets permanent password
- Ready to use in the app

## Complete Setup Workflow

1. **Deploy infrastructure** ✅ (Done)
2. **Create admin user:**
   ```bash
   ./create-admin.sh admin@example.com us-east-1_iwEEqraYS
   ```
3. **Set permanent password:**
   ```bash
   ./first-login.sh admin@example.com 4avro42msdf7ssuaqslsmfd790 MySecurePassword123!
   ```
4. **Run client app:**
   ```bash
   cd src/capture && npm run dev
   ```
5. **Configure app** with new AWS details
6. **Login** with your email and new password
7. **Start translating!**

The scripts handle all the Cognito authentication complexity automatically!
