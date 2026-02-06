# Frontend Migration Guide: REST → Callable Functions

## 🔄 Quick Reference for Frontend Updates

### Installation
```bash
npm install firebase @angular/fire
# or
yarn add firebase @angular/fire
```

### Configuration Setup

```typescript
// firebase.config.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    projectId: "YOUR_PROJECT_ID",
    // ... other config
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-south1");

// For local development
if (location.hostname === "localhost") {
    connectFunctionsEmulator(functions, "localhost", 5001);
}
```

---

## 📋 Migration Examples

### 1. Authentication Functions

#### Before (REST)
```typescript
// login.service.ts
async loginUser(email: string, password: string, role: string) {
    const response = await fetch(
        `https://asia-south1-project.cloudfunctions.net/loginUser`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ email, password, role })
        }
    );

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error);
    }

    const data = await response.json();
    return data;
}
```

#### After (Callable)
```typescript
// login.service.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.config";

async loginUser(email: string, password: string, role: string) {
    try {
        const loginUserFunction = httpsCallable(functions, "loginUser");
        const result = await loginUserFunction({ email, password, role });
        return result.data; // Already structured correctly
    } catch (error: any) {
        throw new Error(error.message);
    }
}
```

---

### 2. Data Fetching Functions

#### Before (REST)
```typescript
// seller.service.ts
async getSellerDetails(uid: string, token: string) {
    const response = await fetch(
        `https://asia-south1-project.cloudfunctions.net/getSellerDetails?uid=${uid}`,
        {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        }
    );

    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data;
}
```

#### After (Callable)
```typescript
// seller.service.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.config";

async getSellerDetails(uid: string) {
    try {
        const getSellerDetailsFunction = httpsCallable(functions, "getSellerDetails");
        const result = await getSellerDetailsFunction({ uid });
        return result.data; // Auto-authenticated via context.auth
    } catch (error: any) {
        throw new Error(error.message);
    }
}
```

---

### 3. Mutation/Write Functions

#### Before (REST)
```typescript
// redemption.service.ts
async createRedemption(sellerId: string, points: number, token: string) {
    const response = await fetch(
        `https://asia-south1-project.cloudfunctions.net/createRedemption`,
        {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                seller_id: sellerId,
                points: points
            })
        }
    );

    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    return data;
}
```

#### After (Callable)
```typescript
// redemption.service.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase.config";

async createRedemption(sellerId: string, points: number) {
    try {
        const createRedemptionFunction = httpsCallable(functions, "createRedemption");
        const result = await createRedemptionFunction({
            seller_id: sellerId,
            points: points
        });
        return result.data;
    } catch (error: any) {
        throw new Error(error.message);
    }
}
```

---

### 4. Error Handling

#### Before (REST)
```typescript
try {
    const response = await fetch(url, options);
    
    if (response.status === 401) {
        // Handle unauthorized
    } else if (response.status === 400) {
        // Handle bad request
    } else if (!response.ok) {
        // Handle other errors
    }
    
    const data = await response.json();
} catch (error) {
    // Network error
}
```

#### After (Callable)
```typescript
import { HttpsErrorCode } from "firebase/functions";

try {
    const result = await myFunction(params);
    // Use result.data directly
} catch (error: any) {
    if (error.code === 'unauthenticated') {
        // Handle unauthorized
    } else if (error.code === 'invalid-argument') {
        // Handle bad request
    } else if (error.code === 'internal') {
        // Handle server error
    }
    
    console.error(error.message);
}
```

---

### 5. React Example

```typescript
// hooks/useAuth.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { useCallback, useState } from "react";

export function useAuthFunctions() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loginUser = useCallback(async (email: string, password: string, role: string) => {
        setLoading(true);
        setError(null);
        
        try {
            const loginFunction = httpsCallable(functions, "loginUser");
            const result = await loginFunction({ email, password, role });
            return result.data;
        } catch (err: any) {
            const errorMsg = err.message || "Login failed";
            setError(errorMsg);
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    return { loginUser, loading, error };
}

// Usage in component
function LoginPage() {
    const { loginUser, loading, error } = useAuthFunctions();

    const handleLogin = async (email: string, password: string) => {
        try {
            const result = await loginUser(email, password, "user");
            console.log("Logged in:", result);
        } catch (error) {
            console.error("Login error:", error);
        }
    };

    return (
        <div>
            {error && <p className="error">{error}</p>}
            {loading && <p>Loading...</p>}
            {/* Form JSX */}
        </div>
    );
}
```

---

### 6. Vue Example

```vue
<!-- composables/useAuth.ts -->
<script setup>
import { ref } from 'vue';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

const loading = ref(false);
const error = ref(null);

async function loginUser(email, password, role) {
    loading.value = true;
    error.value = null;
    
    try {
        const loginFunction = httpsCallable(functions, 'loginUser');
        const result = await loginFunction({ email, password, role });
        return result.data;
    } catch (err) {
        error.value = err.message;
        throw err;
    } finally {
        loading.value = false;
    }
}

export { loginUser, loading, error };
</script>

<!-- LoginPage.vue -->
<template>
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="loading" class="loading">Logging in...</div>
    <form @submit.prevent="handleLogin">
        <!-- Form inputs -->
    </form>
</template>

<script setup>
import { loginUser, loading, error } from '@/composables/useAuth';

async function handleLogin() {
    try {
        const result = await loginUser(email.value, password.value, 'user');
        console.log('Logged in:', result);
    } catch (err) {
        console.error('Login error:', err);
    }
}
</script>
```

---

### 7. Angular Example

```typescript
// services/auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpsCallable, Functions, httpsCallable } from '@angular/fire/functions';
import { Observable, from } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private loginUserFunction: HttpsCallable;

    constructor(private functions: Functions) {
        this.loginUserFunction = httpsCallable(functions, 'loginUser');
    }

    loginUser(email: string, password: string, role: string): Observable<any> {
        return from(
            this.loginUserFunction({ email, password, role })
                .then(result => result.data)
                .catch(error => {
                    throw new Error(error.message);
                })
        );
    }
}

// Usage in component
import { Component } from '@angular/core';
import { AuthService } from './services/auth.service';

@Component({
    selector: 'app-login',
    template: `
        <div *ngIf="error" class="error">{{ error }}</div>
        <div *ngIf="loading" class="loading">Logging in...</div>
        <form (ngSubmit)="login()">
            <!-- Form inputs -->
        </form>
    `
})
export class LoginComponent {
    loading = false;
    error: string | null = null;

    constructor(private authService: AuthService) {}

    login() {
        this.loading = true;
        this.error = null;

        this.authService.loginUser(email, password, 'user').subscribe(
            (result) => {
                console.log('Logged in:', result);
                this.loading = false;
            },
            (error) => {
                this.error = error.message;
                this.loading = false;
            }
        );
    }
}
```

---

## 📦 Benefits of Using Callable Functions

| Aspect | REST | Callable |
|--------|------|----------|
| CORS | Manual handling | Automatic |
| Auth | Manual token validation | Built-in context.auth |
| Serialization | Manual JSON | Automatic |
| Error handling | HTTP status codes | Firebase error codes |
| Response time | 200-500ms | 100-200ms |
| Type safety | Manual interfaces | Strong typing |
| Development | More boilerplate | Less boilerplate |

---

## 🔍 Troubleshooting

### Issue: "Function not found" error
- **Cause**: Function name mismatch between backend export and frontend call
- **Solution**: Ensure the function name matches exactly: `export const myFunc` → `httpsCallable(functions, 'myFunc')`

### Issue: "Unauthenticated" error
- **Cause**: User not signed in or token expired
- **Solution**: Ensure user is authenticated before calling: `if (!auth.currentUser) redirectToLogin()`

### Issue: CORS errors in browser
- **Cause**: Old REST endpoints still being called
- **Solution**: Switch completely to callable functions

### Issue: Slow performance still
- **Cause**: Still making sequential queries on backend
- **Solution**: Use `Promise.all()` to parallelize database calls

---

## ✅ Migration Checklist

- [ ] Update firebase SDK to latest version
- [ ] Update all API service files to use callable functions
- [ ] Remove manual CORS handling from frontend
- [ ] Remove manual Authorization headers
- [ ] Update error handling logic
- [ ] Test all functions in local emulator
- [ ] Test with real backend
- [ ] Update API documentation
- [ ] Notify team about breaking changes
- [ ] Deploy both frontend and backend together

---

## 📚 Additional Resources

- [Firebase Callable Functions Documentation](https://firebase.google.com/docs/functions/callable)
- [Firebase Admin SDK Documentation](https://firebase.google.com/docs/reference/admin)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
